'use strict';
// Local CLI only. JSON plans are reviewable before apply; no web admin surface.
if(process.env.DEV_ISOLATED_ADMIN!=='1'||process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw Error('explicit isolated administrator mode required');
const fs=require('node:fs'),path=require('node:path'),{command}=require('../tests/helpers/local-redis'),ops=require('../api/_ledger-admin-dev').admin(command);
const dir=path.resolve(__dirname,'../../ledger-admin-artifacts');fs.mkdirSync(dir,{recursive:true,mode:0o700});
function file(name){if(!/^[a-z0-9-]+\.json$/.test(name||''))throw Error('simple local JSON filename required');return path.join(dir,name)}
function read(name){return JSON.parse(fs.readFileSync(file(name),'utf8'))}function save(name,value){fs.writeFileSync(file(name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});return {saved:file(name)}}
(async()=>{const [action,input,output]=process.argv.slice(2);let result;
 if(action==='reindex'){const request=read(input);result=await ops.reindex(request.keys,{activate:request.activate===true})}
 else if(action==='alerts')result=await ops.alerts();
 else if(action==='inspect')result=await ops.inspect(read(input).keys);
 else if(action==='pause')result=await ops.pause(input);
 else if(action==='plan-resume'){const request=read(input);result=save(output,await ops.prepareResume(request.keys,{reason:request.reason}))}
 else if(action==='resume'){if(output!=='--reviewed')throw Error('review plan then use --reviewed');result=await ops.resume(read(input),{acknowledge:true})}
 else if(action==='edit-work'){const request=read(input);result=await ops.editWork(request.type,request.id,request)}
 else if(action==='backup')result=save(output,await ops.backup(read(input).keys));
 else if(action==='restore')result=await ops.restore(read(input),{prefix:output});
 else if(action==='health')result=await require('../api/_ledger-scheduler-dev').scheduler(command,{}).health();
 else throw Error('reindex | alerts | inspect | pause | plan-resume | resume | edit-work | backup | restore | health');if(action==='health'&&(result.overdue||result.control?.status==='paused'))process.exitCode=2;console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=2});
