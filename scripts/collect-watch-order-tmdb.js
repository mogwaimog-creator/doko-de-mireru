'use strict';
// Explicit, bounded TMDB collection for the existing watch-order ID roster.
// Writes private source packets locally. No Redis access, no deployment, no old-data reads.
// Usage: node scripts/collect-watch-order-tmdb.js --execute --out <private-file.json> --limit <1..266>
// Requires TMDB_API_KEY already set locally. Never print the key.
const fs=require('node:fs'),path=require('node:path');
const {roster}=require('./lib/cutover/package');
const {createSource}=require('./lib/cutover/tmdb-source-candidate');
async function main(args=process.argv.slice(2),env=process.env){
 const execute=args.includes('--execute'),opt=k=>args[args.indexOf(k)+1],out=args.includes('--out')?opt('--out'):null;
 const limit=args.includes('--limit')?Number(opt('--limit')):0;
 if(!Number.isSafeInteger(limit)||limit<1||limit>266||!out)throw Error('Usage: --out <private-file.json> --limit <1..266> [--execute]');
 const selected=roster.slice(0,limit),estimatedRequests=selected.length*2;
 if(!execute){console.log(JSON.stringify({mode:'dry-run',works:selected.length,maxTmdbRequests:estimatedRequests,redisCommands:0,output:path.resolve(out)}));return}
 if(typeof env.TMDB_API_KEY!=='string'||env.TMDB_API_KEY.length<8)throw Error('TMDB_API_KEY must already be set in the local environment');
 const dest=path.resolve(out),root=fs.realpathSync(path.join(__dirname,'..'));
 if(dest.startsWith(root+path.sep)||dest===root||fs.existsSync(dest))throw Error('Private output must be a new file outside the repository');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 const source=createSource({apiKey:env.TMDB_API_KEY,request:fetch,enabled:true,freeExistingAccessConfirmed:true,maxRequests:estimatedRequests,concurrency:2});
 const packets=[],errors=[];
 for(const item of selected){
  try{const fixed=await source.fixed(item.type,item.id);packets.push(fixed);
   // Provider packets are intentionally separate: never mistake them for fixed metadata.
   const providers=await source.providers(item.type,item.id);
   packets.push({type:item.type,id:item.id,source:{kind:'tmdb-providers-jp',capturedAt:new Date().toISOString()},data:providers});
  }catch(e){errors.push({type:item.type,id:item.id,error:String(e.message).slice(0,150)});break}
 }
 fs.writeFileSync(dest,JSON.stringify({version:1,scope:'explicit watch-order test data',selected:selected.length,packets,errors,stats:source.stats},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output:dest,selected:selected.length,completedFixed:packets.filter(p=>p.source.kind==='tmdb-export').length,completedProviders:packets.filter(p=>p.source.kind==='tmdb-providers-jp').length,errors,stats:source.stats,redisCommands:0}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={main};
