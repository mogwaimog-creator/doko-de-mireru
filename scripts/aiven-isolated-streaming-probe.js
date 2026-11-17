'use strict';
// Manual, one-shot Aiven probe. Never runs in production handlers or cron.
// Uses one dedicated expiring key, with NX so no existing value is overwritten.
const {randomUUID}=require('node:crypto');
const {createAivenConnection}=require('../api/_aiven-connection-v2');
async function run({env=process.env,fetchImpl=fetch,createClient,emit=console.info}={}){
 if(env.AIVEN_ISOLATED_PROBE_CONFIRM!=='YES')throw Error('explicit isolated probe confirmation required');
 if(env.REDIS_PROVIDER!=='valkey')throw Error('Aiven provider required');
 if(!env.TMDB_API_KEY)throw Error('TMDB API key missing');
 const id=157336,type='movie',key='doko:ledger:probe:aiven-v2:stream:'+randomUUID();
 const url='https://api.themoviedb.org/3/'+type+'/'+id+'/watch/providers';
 const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+env.TMDB_API_KEY},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('TMDB providers fetch failed: '+response.status);
 const raw=await response.json();
 if(!raw||typeof raw!=='object'||!raw.results||typeof raw.results!=='object')throw Error('invalid TMDB provider response');
 const payload=JSON.stringify({type,id,source:'tmdb-watch-providers',results:{JP:raw.results.JP||null},testedAt:new Date().toISOString()});
 const connection=createAivenConnection(env,{...(createClient?{createClient}:{}),emit});
 try{
  const result=await connection.command(['SET',key,payload,'NX','EX','120']);
  if(result!=='OK')throw Error('probe key not created');
  const readback=await connection.command(['GET',key]);
  if(readback!==payload)throw Error('Aiven probe readback mismatch');
  emit('AIVEN_ISOLATED_STREAMING_PROBE',JSON.stringify({ok:true,source:'tmdb',saved:true,readback:true,ttlSeconds:120}));
  return {ok:true,saved:true,readback:true,ttlSeconds:120};
 }finally{connection.close()}
}
if(require.main===module)run().catch(error=>{console.error('AIVEN_ISOLATED_STREAMING_PROBE',JSON.stringify({ok:false,code:'probe-failed'}));process.exitCode=1});
module.exports={run};
