'use strict';
// Files only. No secret discovery, network adapter, deployment or Redis mutation.
const fs=require('node:fs'),path=require('node:path'),kit=require('./lib/cutover/package');
const read=file=>{const source=path.resolve(file);if(fs.statSync(source).size>64*1024*1024)throw Error('private input exceeds 64MiB bound');return JSON.parse(fs.readFileSync(source,'utf8'))};
function privateDirectory(dir){if(!dir)throw Error('private output directory required');const root=fs.realpathSync(path.join(__dirname,'..')),resolved=path.resolve(dir);if(resolved===root||resolved.startsWith(root+path.sep))throw Error('private release data must stay outside the repository');fs.mkdirSync(resolved,{recursive:true,mode:0o700});const actual=fs.realpathSync(resolved);if(actual===root||actual.startsWith(root+path.sep))throw Error('private output resolves inside repository');return actual}
function write(dir,name,data){const file=path.join(privateDirectory(dir),name);fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});return file}
function writePage(dir,body){const file=path.join(privateDirectory(dir),'manual-review.html');fs.writeFileSync(file,body,{flag:'wx',mode:0o600});return file}
function main(args=process.argv.slice(2)){const [action,...rest]=args;if(action==='requirements'){console.log(JSON.stringify(kit.requirements(),null,2));return}
 if(action==='review-page'){const [snapshot,out]=rest;console.log(writePage(out,require('./lib/cutover/manual-review-page').render(read(snapshot))));return}
 if(action==='review'){const [snapshot,decisions,out]=rest,result=require('./lib/cutover/targeted-manual').review(read(snapshot),read(decisions));console.log(write(out,'reviewed-manual.json',result));return}
 if(action==='build'){const [packets,review,out]=rest,result=kit.build({packets:read(packets),manualReview:read(review)});console.log(write(out,'seed-package.json',result));if(result.status==='blocked')process.exitCode=1;return}
 throw Error('Usage: requirements | review-page <snapshot.json> <private-dir> | review <snapshot.json> <decisions.json> <private-dir> | build <packets.json> <review.json> <private-dir>');}
if(require.main===module)try{main()}catch(error){console.error(error.message);process.exitCode=1}
module.exports={privateDirectory,main};
