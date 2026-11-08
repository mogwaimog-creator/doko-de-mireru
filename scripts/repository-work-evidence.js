'use strict';
// Extract existing explicit title/ID maps. Never resolves IDs by guess or network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function literal(source,name){const found=source.match(new RegExp('const '+name+'=(\\{[\\s\\S]*?\\n\\});'));if(!found)throw Error('missing evidence '+name);return JSON.parse(JSON.stringify(vm.runInNewContext('('+found[1]+')',{}, {timeout:100,contextCodeGeneration:{strings:false,wasm:false}})))}
function evidence(){
 const out=new Map(),godzilla=fs.readFileSync(path.join(root,'godzilla.html'),'utf8');
 const match=godzilla.match(/const GODZILLA_VERIFIED_IDS=Object\.freeze\((\{[^\n]*\})\);/);if(!match)throw Error('missing Godzilla ID evidence');
 for(const [label,id] of Object.entries(JSON.parse(match[1]))){const parts=label.split(':'),type=parts.shift(),year=parts.pop(),title=parts.join(':');out.set(type+':'+id,{title,year,source:'godzilla.html:GODZILLA_VERIFIED_IDS'})}
 const gundam=fs.readFileSync(path.join(root,'gundam.html'),'utf8');
 for(const name of ['gundamKnownIds','gundamTheatricalWorks'])for(const [title,w] of Object.entries(literal(gundam,name)))out.set(w.type+':'+w.id,{title,source:'gundam.html:'+name});
 const starwars=fs.readFileSync(path.join(root,'starwars.html'),'utf8'),list=starwars.match(/const works = (\[[\s\S]*?\n  \])\.map/);
 if(!list)throw Error('missing Star Wars work evidence');
 const raw=vm.runInNewContext('('+list[1]+')',{}, {timeout:100,contextCodeGeneration:{strings:false,wasm:false}});
 const catalog=require('../data/watch-order-memberships.json').starwars;
 for(const [,title,year,,,id] of raw){const matches=catalog.filter(w=>w.id===id);if(matches.length!==1)throw Error('ambiguous Star Wars ID');out.set(matches[0].type+':'+id,{title,year,source:'starwars.html:works'})}
 return out;
}
module.exports={evidence};
