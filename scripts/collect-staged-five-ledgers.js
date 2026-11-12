'use strict';
const fs=require('node:fs'),path=require('node:path'),kit=require('./lib/staged-tmdb');
async function main(args=process.argv.slice(2)){
 const opt=k=>args[args.indexOf(k)+1];if(!args.includes('--out'))throw Error('--out private directory required');const store=kit.packetStore(opt('--out'));
 if(args.includes('--reuse-shadow'))kit.importShadow(store,JSON.parse(fs.readFileSync(opt('--reuse-shadow'),'utf8')));
 const limit=args.includes('--limit')?Number(opt('--limit')):8;if(!args.includes('--execute')){console.log(JSON.stringify({mode:'offline',packets:store.all().length,limit}));return}
 const source=kit.collector(store,{apiKey:process.env.TMDB_API_KEY,maxRequests:limit*3+2});const at=Date.now();let result;
 try{result=await kit.collectBatch(store,source,{limit,samplePerson:args.includes('--sample-person')})}catch(e){result={error:e.message,stats:source.stats};process.exitCode=1}
 const report={at:new Date().toISOString(),elapsedMs:Date.now()-at,...result,remoteRedisCommands:0,productionChanged:false};fs.writeFileSync(path.join(store.dir,'collection-'+at+'.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(()=>{console.error('Staged collection stopped: check private checkpoint, configuration and budgets');process.exitCode=1});module.exports={main};
