'use strict';
// Offline-only person ledger prototype. No Redis, TMDB, or production imports.
const MAX_CREDITS=500;
const LISTS=['cast','voice','directed','documentary_talk','other'];
function personId(id){const n=Number(id);if(!Number.isSafeInteger(n)||n<1)throw Error('invalid person ID');return n}
function safeText(v,n){return typeof v==='string'?v.slice(0,n):null}
function yearFrom(value){if(typeof value!=='string')return null;const m=/^(\d{4})(?:-|$)/.exec(value);return m?m[1]:null}
function normalizePerson(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid person');
 const id=personId(input.id);
 const out={id,name:safeText(input.name,200),biography:safeText(input.biography,4000),profile_path:safeText(input.profile_path,200),original_name:safeText(input.original_name,200),known_for_department:safeText(input.known_for_department,100),birthday:safeText(input.birthday,30),deathday:safeText(input.deathday,30),place_of_birth:safeText(input.place_of_birth,200)};
 for(const list of LISTS){
  const seen=new Set();
  out[list]=[];
  for(const credit of Array.isArray(input[list])?input[list]:[]){
   if(!credit||typeof credit!=='object')continue;
   // Old person records use content_type; new TMDB-shaped input may use media_type.
   const type=credit.media_type||credit.content_type;
   if(type!=='movie'&&type!=='tv')continue;
   const workId=Number(credit.id);
   if(!Number.isSafeInteger(workId)||workId<1)continue;
   const key=type+':'+workId;
   if(seen.has(key))continue;
   seen.add(key);
   const title=safeText(credit.title||credit.name,200);
   const poster_path=safeText(credit.poster_path,200);
   const year=yearFrom(credit.year)||yearFrom(type==='movie'?credit.release_date:credit.first_air_date)||yearFrom(credit.release_date)||yearFrom(credit.first_air_date);
   out[list].push({id:workId,media_type:type,title,year,poster_path});
   if(out[list].length>=MAX_CREDITS)break;
  }
 }
 return out;
}
function store(){
 const records=new Map();
 function get(id){return records.get(personId(id))||null}
 function success(input,at){
  const person=normalizePerson(input),time=Date.parse(at);
  if(!Number.isFinite(time))throw Error('invalid date');
  const record={person,checkedAt:new Date(time).toISOString()};
  records.set(person.id,record);
  return record;
 }
 function eligible(id,at){
  const record=get(id);if(!record)return true;
  const when=Date.parse(at);
  if(!Number.isFinite(when))throw Error('invalid date');
  return when-Date.parse(record.checkedAt)>=60*86400000;
 }
 function failure(id){return get(id)}
 function save(){return JSON.stringify({version:1,records:[...records.values()]})}
 function load(serialized){
  const data=JSON.parse(serialized);
  if(data.version!==1||!Array.isArray(data.records))throw Error('invalid snapshot');
  const next=new Map();
  for(const item of data.records){
   const p=normalizePerson(item.person);
   const time=Date.parse(item.checkedAt);
   if(!Number.isFinite(time))throw Error('invalid date');
   if(next.has(p.id))throw Error('duplicate person');
   next.set(p.id,{person:p,checkedAt:new Date(time).toISOString()});
  }
  records.clear();for(const [id,record] of next)records.set(id,record);
 }
 return {get,success,eligible,failure,save,load,count:()=>records.size};
}
module.exports={normalizePerson,store};
