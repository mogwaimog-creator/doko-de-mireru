'use strict';
// Offline inventory of browser-initiated search API usage in current templates.
// Read-only: does not alter site runtime or make network requests.
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const files=['detail.html','person.html'];
const findings=[];
for(const file of files){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const calls=[...source.matchAll(/await\s+fetch\s*\(/g)];
 for(const match of calls){
  const before=source.slice(Math.max(0,match.index-1100),match.index);
  const after=source.slice(match.index,match.index+300);
  const line=source.slice(0,match.index).split('\n').length;
  findings.push({file,line,context:before.slice(-260).replace(/\s+/g,' ').trim(),request:after.slice(0,160).replace(/\s+/g,' ').trim()});
 }
}
const expected={ 'detail.html':3,'person.html':1 };
for(const file of files){
 const count=findings.filter(x=>x.file===file).length;
 if(count!==expected[file])throw Error(file+' fetch inventory changed: expected '+expected[file]+', got '+count);
}
console.log(JSON.stringify({summary:'Browser fetch call inventory (not request counts)',findings},null,2));
