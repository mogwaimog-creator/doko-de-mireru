'use strict';
const assert=require('node:assert/strict');
const {createSeasonRefreshWriter}=require('../api/_season-refresh-writer');
const now=Date.parse('2026-11-07T00:00:00Z');
const old={type:'tv',id:41,seasonNumber:2,seasonName:'old',episodes:[],
 checkedAt:'2026-10-01T00:00:00Z',status:'airing'};
const updated={...old,seasonName:'new',checkedAt:new Date(now).toISOString()};
const dataKey='doko:season:v1:tv:41:2',lockKey=dataKey+':refresh-lock';
const original=process.env.LEDGER_WRITES_RESUME;
function mock(){
 const values=new Map([[dataKey,JSON.stringify(old)]]),calls=[];
 async function command(a){
  calls.push(a);const [op,...rest]=a;
  if(op==='GET')return values.get(rest[0])??null;
  if(op==='SET'){if(rest.includes('NX')&&values.has(rest[0]))return null;values.set(rest[0],rest[1]);return 'OK';}
  if(op==='EVAL'){
   const [,count,...v]=rest;
   if(count==='1'){if(values.get(v[0])===v[1]){values.delete(v[0]);return 1;}return 0;}
   if(count==='2'){const [data,lock,owner,json]=v;if(values.get(lock)!==owner)return null;values.set(data,json);return 'OK';}
  }
  throw Error('Unexpected command: '+op);
 }
 return {values,calls,command};
}
(async()=>{
 try{
  process.env.LEDGER_WRITES_RESUME='1';
  // Expired lease: a second owner has taken over before the first writer finishes.
  let m=mock(),writer=createSeasonRefreshWriter(m.command,{now:()=>now,token:()=> 'owner-a'});
  const result=await writer(old,async()=>{
   m.values.set(lockKey,'owner-b');
   return updated;
  });
  assert.equal(result,null,'expired owner cannot write');
  assert.equal(JSON.parse(m.values.get(dataKey)).seasonName,'old');
  assert.equal(m.values.get(lockKey),'owner-b','old owner cannot delete replacement lock');
  assert.ok(m.calls.some(a=>a[0]==='EVAL'&&a[2]==='2'));
  // A freeze switched on during TMDB retrieval must prevent the write.
  m=mock();writer=createSeasonRefreshWriter(m.command,{now:()=>now,token:()=> 'owner-a'});
  await assert.rejects(writer(old,async()=>{
   delete process.env.LEDGER_WRITES_RESUME;
   return updated;
  }),e=>e.code==='SEASON_LEDGER_WRITES_FROZEN');
  assert.equal(JSON.parse(m.values.get(dataKey)).seasonName,'old');
  assert.equal(m.values.has(lockKey),false);
  assert.equal(m.calls.filter(a=>a[0]==='EVAL'&&a[2]==='2').length,0);
  // An existing fresh record must not be overwritten by a stale caller.
  process.env.LEDGER_WRITES_RESUME='1';
  m=mock();m.values.set(dataKey,JSON.stringify(updated));
  writer=createSeasonRefreshWriter(m.command,{now:()=>now,token:()=> 'owner-a'});
  let fetches=0;
  const fresh=await writer(old,async()=>{fetches++;return updated;});
  assert.equal(fresh.seasonName,'new');
  assert.equal(fetches,0);
  console.log('season lock expiry and mid-flight write freeze tests passed');
 }finally{
  if(original===undefined)delete process.env.LEDGER_WRITES_RESUME;
  else process.env.LEDGER_WRITES_RESUME=original;
 }
})().catch(e=>{console.error(e);process.exitCode=1});
