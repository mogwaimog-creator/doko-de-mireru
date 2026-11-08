'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const dev=require('../api/_dev-content-ledgers'),hook=require('../api/_dev-content-refresh');
async function flags(fn){const old={...process.env};try{process.env.DEV_CONTENT_LEDGER_ENABLED='1';process.env.DEV_CONTENT_REFRESH_ENABLED='1';delete process.env.NODE_ENV;delete process.env.VERCEL_ENV;await fn()}finally{process.env=old}}
test('stale person and unknown episodes use opt-in refresh then saved readers; outage retains success',()=>flags(async()=>{
 const at=new Date().toISOString(),past=new Date(Date.now()-91*86400000).toISOString(),p=require('../prototype/person-ledger').store(),s=require('../prototype/season-ledger');let person=p.success({id:1813,name:'old'},past),manifest=s.makeRecord(85937,[{seasonNumber:1,episodeCount:1}],past),calls=[];const original=hook.refresh;
 const command=async args=>{assert.equal(args[0],'GET');return JSON.stringify(args[1].includes(':person:')?person:manifest)};
 try{hook.refresh=async request=>{calls.push(request.kind);if(request.kind==='person')person=p.success({id:1813,name:'new'},at);else manifest=s.makeRecord(85937,[{seasonNumber:1,episodeCount:1,episodes:[{episodeNumber:1,name:'saved'}],episodesCheckedAt:at}],at,manifest);return {status:'saved'}};
 assert.equal((await dev.readPerson(1813,{command})).name,'new');assert.equal((await dev.readSeason(85937,1,{command})).episodes[0].name,'saved');assert.deepEqual(calls,['person','episode']);
 person=p.success({id:1813,name:'retain'},at);person={...person,checkedAt:past,createdAt:past};hook.refresh=async()=>{throw Error('bridge disconnected')};assert.equal((await dev.readPerson(1813,{command})).name,'retain');
 }finally{hook.refresh=original}
}));
test('refresh rejects non-loopback endpoints and production ignores opt-in without HTTP',()=>flags(async()=>{
 process.env.SHARED_LEDGER_DEV_URL='https://production.example';await assert.rejects(hook.refresh({kind:'person',id:1813}),/local content refresh/);process.env.NODE_ENV='production';assert.equal(await hook.refresh({kind:'person',id:1813}),null);
}));
