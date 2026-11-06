'use strict';
// Offline extraction only. Never reads Redis or calls TMDB.
const fs=require('node:fs/promises');
const {fixedOnly}=require('../api/_detail-metadata-cache');

function extractFixedDetail(record){
 if(!record||record.schemaVersion!==1||!['movie','tv'].includes(record.type)||
    !Number.isSafeInteger(record.id)||record.id<=0||typeof record.title!=='string'||!record.title.trim())
   throw Error('Invalid shared work ledger record');
 const detail=record.extensions?.tmdbDetail;
 if(!detail||typeof detail!=='object'||Array.isArray(detail)||
    Number(detail.id)!==record.id||typeof detail.title!=='string'&&typeof detail.name!=='string')
   throw Error('Missing or mismatched tmdbDetail; cannot generate static detail data');
 // Preserve the existing TMDB-compatible metadata, excluding provider payloads.
 const fixed=fixedOnly(detail);
 // Fail closed if unexpected provider data appears in this record.
 if(Object.hasOwn(fixed,'streaming')||Object.hasOwn(fixed,'rental')||
    Object.hasOwn(fixed,'purchase')||Object.hasOwn(fixed,'free'))
   throw Error('Dynamic provider fields must not be embedded in fixed metadata');
 return {type:record.type,id:record.id,metadata:fixed};
}
async function main(input,output){
 const rows=JSON.parse(await fs.readFile(input,'utf8'));
 if(!Array.isArray(rows))throw Error('Expected ledger export array');
 const extracted=rows.map(extractFixedDetail);
 await fs.writeFile(output,JSON.stringify(extracted,null,2)+'\n','utf8');
 console.log('Extracted '+extracted.length+' fixed detail records offline');
}
if(require.main===module){
 const [, , input,output]=process.argv;
 if(!input||!output){console.error('Usage: node scripts/extract-seo-fixed-detail.js ledger.json output.json');process.exitCode=2;}
 else main(input,output).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={extractFixedDetail};
