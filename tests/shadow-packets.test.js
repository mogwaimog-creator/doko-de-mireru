'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {collect,replay,fixtureRequest,MAX_REQUESTS}=require('../scripts/lib/shadow-packets');
test('shadow collection requests only two typed works, JP providers, one credited person and one TV season',async()=>{
 const urls=[],bundle=await collect({apiKey:'private-test-value',request:async(url,options)=>{urls.push(url);assert.equal(options.redirect,'error');return fixtureRequest(url)}});
 assert.equal(bundle.scope,'selected-tmdb-shadow');assert.equal(urls.length,MAX_REQUESTS);assert.equal(bundle.packets.length,7);
 assert(urls.every(url=>new URL(url).hostname==='api.themoviedb.org'));assert(!JSON.stringify(bundle).includes('private-test-value'));
 const source=replay(bundle);assert.equal((await source('/3/tv/85937')).id,85937);await assert.rejects(source('/3/movie/999999'),/fallback disabled/);
 const raw=await source('/3/tv/85937');raw.id=1;assert.equal((await source('/3/tv/85937')).id,85937,'replay must not mutate saved packet');
});
test('missing key and failed upstream do not retry or expose URL credentials',async()=>{
 let count=0;await assert.rejects(collect({request:()=>{count++}}),/TMDB_API_KEY/);assert.equal(count,0);
 await assert.rejects(collect({apiKey:'private-test-value',request:async url=>{count++;throw Error(url)}}),error=>{assert(!error.message.includes('private-test-value'));return /no automatic retry/.test(error.message)});assert.equal(count,1);
});
test('oversized sources stop before any later request and malformed replay cannot expand the roster',async()=>{
 let count=0;await assert.rejects(collect({apiKey:'private-test-value',request:async()=>{count++;return new Response('x'.repeat(2*1024*1024+1))}}),/stopped/);assert.equal(count,1);
 const bundle=await collect({fixture:true,request:fixtureRequest});assert.equal(bundle.scope,'synthetic-shadow-fixtures');bundle.packets[0].route='/3/movie/999999';assert.throws(()=>replay(bundle),/route/);
});
