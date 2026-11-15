'use strict';
const {execFile}=require('node:child_process');
let nativeValkey;
require('node:test').after(()=>nativeValkey?.close());
async function largeLocalCommand(args){
 const net=require('node:net'),values=args.map(v=>Buffer.from(String(v))),request=Buffer.concat([Buffer.from('*'+values.length+'\r\n'),...values.flatMap(v=>[Buffer.from('$'+v.length+'\r\n'),v,Buffer.from('\r\n')])]);
 return new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port:16379});let buffer=Buffer.alloc(0),settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve(value)};
  function parse(offset){const end=buffer.indexOf('\r\n',offset);if(end<0)return null;const tag=String.fromCharCode(buffer[offset]),line=buffer.subarray(offset+1,end).toString(),start=end+2;
   if(tag==='+')return {value:line,next:start};if(tag==='-')throw Error('Redis rejected command: '+line);if(tag===':')return {value:Number(line),next:start};
   if(tag==='$'){const n=Number(line);if(n===-1)return {value:null,next:start};if(buffer.length<start+n+2)return null;return {value:buffer.subarray(start,start+n).toString(),next:start+n+2}}
   if(tag==='*'){const n=Number(line);if(n===-1)return {value:null,next:start};const list=[];let next=start;for(let i=0;i<n;i++){const item=parse(next);if(!item)return null;list.push(item.value);next=item.next}return {value:list,next}}throw Error('invalid local Redis response');
  }
  socket.setTimeout(5000,()=>finish(Error('local Redis timeout')));socket.on('error',error=>finish(error));socket.on('connect',()=>socket.write(request));socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>20*1024*1024)return finish(Error('local Redis response exceeds bound'));try{const result=parse(0);if(result)finish(null,result.value)}catch(error){finish(error)}});socket.on('end',()=>{if(!settled)finish(Error('local Redis closed before response'))});
 });
}
async function command(args){
 if(!process.env.REDIS_TEST_CLI)throw Error('REDIS_TEST_CLI must point to local redis-cli');
 if(process.env.REDIS_TEST_TRANSPORT==='valkey'){nativeValkey ||= require('../../api/_valkey').createValkey({REDIS_URL:'redis://127.0.0.1:16379',NODE_ENV:'test'});return nativeValkey.command(args)}
 if(args.some(v=>Buffer.byteLength(String(v))>60000))return largeLocalCommand(args);
 const values=args.map(String),large=Buffer.byteLength(values.at(-1)||'')>60000;
 const stdout=await new Promise((resolve,reject)=>{
  const child=execFile(process.env.REDIS_TEST_CLI,['-h','127.0.0.1','-p','16379','--json',...(large?['-x']:[]),...(large?values.slice(0,-1):values)],{maxBuffer:8*1024*1024},(error,out)=>error?reject(error):resolve(out));
  child.stdin.on('error',()=>{});child.stdin.end(large?values.at(-1):undefined);
 });
 if(args[0]==='INFO')return stdout;
 if(stdout.startsWith('error:'))throw Error('Redis rejected command: '+stdout.slice(6).trim());
 const value=JSON.parse(stdout);if(value?.error)throw Error('Redis error');return value;
}
module.exports={command};
