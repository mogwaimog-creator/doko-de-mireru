'use strict';
const {roster}=require('./package');
// Not connected by any application entry. Explicit PC-side future read-only client.
function createClient({endpoint,token,request,enabled=false,maxRequests=68,maxResponseBytes=8*1024*1024}={}){
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||typeof token!=='string'||token.length<20||typeof request!=='function'||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>136||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1)throw Error('explicit bounded read-only source client required');
 const allowed=new Set(roster.map(w=>'doko:work:v1:'+w.type+':'+w.id)),stats={commands:0,receivedBytes:0};
 return {get stats(){return Object.freeze({...stats})},async command(args){if(!enabled)throw Error('source client is dormant');if(!Array.isArray(args)||args[0]!=='MGET'||args.length<2||args.length>9||args.slice(1).some(k=>!allowed.has(k)))throw Error('only named protected work keys may be read');if(stats.commands>=maxRequests)throw Error('source read budget exhausted');stats.commands++;
  const response=await request(url.toString(),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});if(!response.ok||!response.body?.getReader)throw Error('source read unavailable');const reader=response.body.getReader(),chunks=[];let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;stats.receivedBytes+=value.byteLength;if(bytes>maxResponseBytes){await reader.cancel();throw Error('source reply exceeds bound')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}const json=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(json.error||!Array.isArray(json.result)||json.result.length!==args.length-1)throw Error('incomplete source reply');return json.result;
 }};
}
module.exports={createClient};
