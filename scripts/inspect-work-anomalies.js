'use strict';
// Read-only inspection for maintainers. Run locally with existing Redis credentials:
// node scripts/inspect-work-anomalies.js movie 597
// No TMDB requests and no Redis writes.
const {identity}=require('../api/_work-ledger');
const {listAnomalies}=require('../api/_work-anomalies');
async function main(args){
 if(args.length!==2)throw Error('Usage: node scripts/inspect-work-anomalies.js <movie|tv> <TMDB_ID>');
 const {type,id}=identity(args[0],args[1]);
 const entries=await listAnomalies(type,id);
 process.stdout.write(JSON.stringify({type,id,count:entries.length,events:entries},null,2)+'\n');
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{
 console.error('Could not inspect anomaly history:',error.message);
 process.exitCode=1;
});
module.exports={main};
