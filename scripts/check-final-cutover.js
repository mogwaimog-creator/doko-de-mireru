'use strict';
const fs=require('node:fs'),{evaluate}=require('./lib/final-cutover-gate');
const file=process.argv[2];if(!file){console.error('Private evidence JSON required; no remote operations performed');process.exitCode=1}else{try{const result=evaluate(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1}catch{console.error('Invalid evidence; cutover blocked, no remote operations performed');process.exitCode=1}}
