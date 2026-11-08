'use strict';
const {execFile}=require('node:child_process');
async function command(args){
 if(!process.env.REDIS_TEST_CLI)throw Error('REDIS_TEST_CLI must point to local redis-cli');
 const values=args.map(String),large=Buffer.byteLength(values.at(-1)||'')>60000;
 const stdout=await new Promise((resolve,reject)=>{
  const child=execFile(process.env.REDIS_TEST_CLI,['-h','127.0.0.1','-p','16379','--json',...(large?['-x']:[]),...(large?values.slice(0,-1):values)],{maxBuffer:8*1024*1024},(error,out)=>error?reject(error):resolve(out));
  child.stdin.on('error',()=>{});child.stdin.end(large?values.at(-1):undefined);
 });
 if(args[0]==='INFO')return stdout;
 const value=JSON.parse(stdout);if(value?.error)throw Error('Redis error');return value;
}
module.exports={command};
