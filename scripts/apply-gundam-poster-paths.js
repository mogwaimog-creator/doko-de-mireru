// Apply reviewed output of export-gundam-poster-paths.js to gundam.html.
// Usage: node scripts/apply-gundam-poster-paths.js poster-export.json
// Fails closed if any current fixed-ID or season work lacks a verified poster path.
// Does not deploy, call Vercel, or contact TMDB.
const fs=require('node:fs');
const file='gundam.html';
const exportPath=process.argv[2];
if(!exportPath)throw Error('Provide the reviewed export JSON file');
const html=fs.readFileSync(file,'utf8');
const data=JSON.parse(fs.readFileSync(exportPath,'utf8'));
if(!data.posters||!Array.isArray(data.failures)||data.failures.length)throw Error('Export contains failures or invalid data');
const known=html.match(/const gundamKnownIds=\{([\s\S]*?)\n\};/);
const seasons=html.match(/const gundamSeasonWorks=\{([\s\S]*?)\n\};/);
if(!known||!seasons)throw Error('Current Gundam ID mappings not found');
const titles=[
 ...[...known[1].matchAll(/'([^']+)':\{id:\d+,type:'(?:tv|movie)'\}/g)].map(m=>m[1]),
 ...[...seasons[1].matchAll(/'([^']+)':\{id:\d+,season:\d+\}/g)].map(m=>m[1])
];
const valid=/^\/[a-zA-Z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/;
for(const title of titles)if(!valid.test(data.posters[title]||''))throw Error('Missing or invalid path for '+title);
if(new Set(titles).size!==titles.length)throw Error('Duplicate Gundam titles in mappings');
if(Object.keys(data.posters).length!==titles.length)throw Error('Unexpected extra poster entries');
if(!html.includes('const gundamSharedWatch=fetch('))throw Error('Shared streaming snapshot missing; refusing rewrite');
const start=html.indexOf('const gundamPosterCache=new Map();');
const end=html.indexOf('const gundamFixedWorks=gundamKnownIds;',start);
if(start<0||end<0||end<=start)throw Error('Poster function markers changed; refusing rewrite');
const ordered=Object.fromEntries(titles.map(t=>[t,data.posters[t]]));
const replacement=`// Fixed and reviewed TMDB image paths: no per-visitor poster metadata API call.
const GUNDAM_POSTER_PATHS=Object.freeze(${JSON.stringify(ordered,null,1)});
function gundamFixedPoster(title){
 const path=GUNDAM_POSTER_PATHS[title];
 return Promise.resolve(path?gundamImage(path,'w342'):null);
}
`;
const updated=html.slice(0,start)+replacement+html.slice(end);
if(updated.includes("'/api/gundam-poster?")||updated.includes("+'/api/gundam-poster?"))throw Error('Poster API call remains; refusing rewrite');
const output=process.argv[3]||'gundam.fixed-preview.html';
if(output===file)throw Error('Refusing to overwrite gundam.html directly; review preview first');
fs.writeFileSync(output,updated);
console.log('Wrote '+titles.length+' fixed poster paths to '+output+'. Review diff and test before deployment.');
