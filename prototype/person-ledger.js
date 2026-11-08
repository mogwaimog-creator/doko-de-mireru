'use strict';
// Offline-only person ledger prototype. No Redis, TMDB, or production imports.
const MAX_CREDITS=500;
const LISTS=['cast','voice','directed','documentary_talk','other'];
const cardFields=['id','media_type','title','name','release_date','first_air_date','poster_path','character','job'];
function personId(id){const n=Number(id);if(!Number.isSafeInteger(n)||n<1)throw Error('invalid person ID');return n}
function text(v,n){return typeof v==='string'?v.slice(0,n):null}
function normalizePerson(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid person');
 const id=personId(input.id),out={id,name:text(input.name,200),biography:text(input.biography,4000),profile_path:text(input.profile_path,200),birthday:text(input.birthday,30),deathday:text(input.deathday,30),place_of_birth:text(input.place_of_birth,200)};
 for(const list of LISTS){
  const seen=new Set();
  out[list]=[];
  for(const credit of Array.isArray(input[list])?input[list]:[]){
   if(!credit||typeof credit!=='object')continue;
   const type=credit.media_type;
   if(!['movie','tv'].includes(type))continue;
   const workId=Number(credit.id);
   if(!Number.isSafeInteger(workId)||workId<1)continue;
   const key=type+':'+workId;
   if(seen.has(key))continue;
   seen.add(key);
   const c={};
   for(const field of cardFields){
    if(field==='id')c.id=workId;
    else if(field==='media_type')c.media_type=type;
    else if(typeof credit[field]==='string')c[field]=credit[field].slice(0,200);
   }
   out[list].push(c);
   if(out[list].length>=MAX_CREDITS)break;
  }
 }
 return out;
}
function store(){
 const records=new Map();
 function get(id){return records.get(personId(id))||null}
 function success(input,at){
  const person=normalizePerson(input),checkedAt=new Date(at).toISOString();
  if(checkedAt==='Invalid Date')throw Error('invalid date');
  const record={person,checkedAt};
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
   const date=new Date(item.checkedAt).toISOString();
   if(next.has(p.id))throw Error('duplicate person');
   next.set(p.id,{person:p,checkedAt:date});
  }
  records.clear();for(const [id,record] of next)records.set(id,record);
 }
 return {get,success,eligible,failure,save,load,count:()=>records.size};
}
module.exports={normalizePerson,store};
