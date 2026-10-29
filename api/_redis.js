'use strict';
async function command(args) {
  const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token) throw new Error('Redis credentials unavailable');
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`Redis HTTP ${response.status}`);
  const json=await response.json();
  if(json.error)throw new Error('Redis command failed');
  return json.result;
}
module.exports={command};
