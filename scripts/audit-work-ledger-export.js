'use strict';
// Read-only, offline audit of exported work-ledger records.
// Usage: node scripts/audit-work-ledger-export.js export.json [report.json]
// No Redis/TMDB/API calls, no writes to the work ledger.
const fs = require('node:fs');
const path = require('node:path');
function audit(records) {
  if (!Array.isArray(records)) throw Error('Expected an array of work records');
  const issues = [], seen = new Set(), stats = {total:records.length,verified:0,unverified:0,errors:0};
  const add = (index, key, code, detail) => issues.push({index,key,code,detail});
  records.forEach((r,index) => {
    const type=r?.type, id=r?.id, key=String(type)+':'+String(id);
    const valid=['movie','tv'].includes(type)&&Number.isSafeInteger(id)&&id>0;
    if (!valid) add(index,key,'INVALID_IDENTITY','type must be movie/tv and id a positive integer');
    if (seen.has(key)) add(index,key,'DUPLICATE_IDENTITY','Duplicate type and TMDB ID');
    seen.add(key);
    if (r?.schemaVersion!==1) add(index,key,'INVALID_SCHEMA','Expected schemaVersion 1');
    if (typeof r?.title!=='string'||!r.title.trim()) add(index,key,'MISSING_TITLE','Title is empty');
    if (!r?.releaseDate) add(index,key,'MISSING_RELEASE_DATE','Release date is missing');
    if (!r?.posterPath) add(index,key,'MISSING_POSTER','Poster is missing');
    if (!r?.overview) add(index,key,'MISSING_OVERVIEW','Overview is missing');
    const d=r?.extensions?.tmdbDetail;
    if (!d) add(index,key,'MISSING_DETAIL','TMDB detail snapshot missing');
    else {
      if (Number(d.id)!==id) add(index,key,'DETAIL_ID_MISMATCH','Detail ID differs from ledger ID');
      const detailTitle=type==='tv'?(d.name||d.original_name):(d.title||d.original_title);
      if (detailTitle && r.title && detailTitle.trim()!==r.title.trim()) add(index,key,'TITLE_MISMATCH','Ledger title differs from saved detail; manual review required');
      const detailDate=type==='tv'?d.first_air_date:d.release_date;
      if (detailDate && r.releaseDate && detailDate!==r.releaseDate) add(index,key,'DATE_MISMATCH','Ledger date differs from saved detail');
      if (d.poster_path && r.posterPath && d.poster_path!==r.posterPath) add(index,key,'POSTER_MISMATCH','Ledger poster differs from saved detail');
      if ('watch/providers' in d) add(index,key,'PROVIDER_DATA_IN_FIXED','Streaming provider data found in fixed detail');
    }
    if (Array.isArray(r?.errors)&&r.errors.length) {stats.errors++;add(index,key,'RECORDED_ERRORS','Existing ledger error entries: '+r.errors.length);}
    const v=r?.verification||{};
    if (v.identity==='verified'&&v.metadata==='verified') stats.verified++;
    else {stats.unverified++;add(index,key,'NOT_VERIFIED','Identity and metadata are not both explicitly verified');}
    // Never mark records verified here. Review must be separately approved.
  });
  return {stats,issueCount:issues.length,issues,readOnly:true,automaticVerification:false};
}
if (require.main===module) {
  const [, ,input,output]=process.argv;
  if (!input) {console.error('Usage: node scripts/audit-work-ledger-export.js export.json [report.json]');process.exitCode=2;}
  else try {
    const report=audit(JSON.parse(fs.readFileSync(path.resolve(input),'utf8')));
    if (output) fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n');
    else process.stdout.write(JSON.stringify(report,null,2)+'\n');
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
module.exports={audit};
