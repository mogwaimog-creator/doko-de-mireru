'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const dev=require('../api/_dev-content-ledgers');
const {normalizeWorkV2}=require('../api/_work-ledger-v2-schema');
const {makeRecord}=require('../prototype/season-ledger');
const {createSeoRecord}=require('../prototype/seo-ledger');
async function enabled(fn){const prev={...process.env};try{process.env.DEV_CONTENT_LEDGER_ENABLED='1';delete process.env.NODE_ENV;delete process.env.VERCEL_ENV;await fn()}finally{process.env=prev}}
test('saved compact movie/TV identity, separate season manifest, counts, and episodes agree without upstream calls',()=>enabled(async()=>{
 const records=new Map(),calls=[];const command=async args=>{calls.push(args);assert(['GET','MGET'].includes(args[0]));return args[0]==='GET'?(records.get(args[1])||null):args.slice(1).map(k=>records.get(k)||null)};
 const movie=normalizeWorkV2('movie',85937,{title:'Movie fixture',pageExtras:{guide:{note:'manual'}}}),tv=normalizeWorkV2('tv',85937,{title:'TV fixture'});delete tv.seasons;
 records.set(dev.keys.work('movie',85937),JSON.stringify(movie));records.set(dev.keys.work('tv',85937),JSON.stringify(tv));
 const seasons=makeRecord(85937,[{seasonNumber:1,name:'first',episodeCount:2,episodes:[{episodeNumber:1,name:'one',runtime:24},{episodeNumber:2,name:'two'}]}],'2026-11-09T00:00:00Z');records.set(dev.keys.season(85937),JSON.stringify(seasons));
 assert.equal((await dev.readWork('movie',85937,{command})).title,'Movie fixture');
 const work=await dev.readWork('tv',85937,{command});assert.equal(work.name,'TV fixture');assert.equal(work.number_of_seasons,1);assert.equal(work.number_of_episodes,2);
 assert.equal(work.seasons[0].season_number,(await dev.readSeason(85937,1,{command})).season_number);
 assert.equal((await dev.readSeason(85937,1,{command})).episodes.length,2);assert.equal(calls.length,4);
 assert(!JSON.stringify(tv).includes('tmdbDetail'));assert(!Object.hasOwn(tv,'seasons'));assert.equal(movie.pageExtras.guide.note,'manual');
}));
test('saved person and SEO validate identity and never fetch or write missing content',()=>enabled(async()=>{
 const person=require('../prototype/person-ledger').store().success({id:1813,name:'person fixture',cast:[],voice:[],directed:[],documentary_talk:[],other:[]},'2026-11-09T00:00:00Z');
 const seo=createSeoRecord({type:'tv',id:85937,title:'鬼滅の刃'});
 const command=async args=>JSON.stringify(args[1].includes(':person:')?person:seo);
 assert.equal((await dev.readPerson(1813,{command})).name,'person fixture');assert.match((await dev.readSeo('tv',85937,{command})).canonical,/type=tv/);
 await assert.rejects(dev.readPerson(500,{command}));await assert.rejects(dev.readSeo('movie',85937,{command}));await assert.rejects(dev.readWork('movie',635302,{command:async()=>[null]}));
}));
test('production ignores all development content flags without issuing any commands',()=>enabled(async()=>{
 process.env.VERCEL_ENV='production';const command=async()=>{throw Error('must not connect')};
 assert.equal(await dev.readWork('movie',635302,{command}),null);assert.equal(await dev.readPerson(1813,{command}),null);assert.equal(await dev.readSeason(85937,1,{command}),null);assert.equal(await dev.readSeo('movie',635302,{command}),null);
}));
