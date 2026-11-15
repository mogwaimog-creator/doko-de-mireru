'use strict';
// Binary-safe, loopback-only adapter. Intentionally has no host/credential option.
const net=require('node:net');
function createClient({socketPath=null}={}){
 if(socketPath!==null&&(typeof socketPath!=='string'||!require('node:path').isAbsolute(socketPath)||socketPath.includes('\0')))throw Error('absolute local Unix socket path required');
function pipeline(commands){
 if(!Array.isArray(commands)||!commands.length||commands.length>1024)return Promise.reject(Error('bounded local pipeline required'));
 const encode=args=>{const values=args.map(x=>Buffer.isBuffer(x)?x:Buffer.from(String(x))),request=Buffer.concat([Buffer.from('*'+values.length+'\r\n'),...values.flatMap(v=>[Buffer.from('$'+v.length+'\r\n'),v,Buffer.from('\r\n')])]);return request};
 const request=Buffer.concat(commands.map(encode));
 return new Promise((resolve,reject)=>{let buffer=Buffer.alloc(0),finished=false;const socket=net.createConnection(socketPath?{path:socketPath}:{host:'127.0.0.1',port:16379});
 const finish=(e,v)=>{if(finished)return;finished=true;socket.destroy();e?reject(e):resolve(v)};
 function parse(offset){const end=buffer.indexOf('\r\n',offset);if(end<0)return null;const tag=String.fromCharCode(buffer[offset]),line=buffer.subarray(offset+1,end).toString(),start=end+2;
 if(tag==='-')throw Error(line);if(tag==='+')return {value:line,next:start};if(tag===':')return {value:Number(line),next:start};
 if(tag==='$'){const n=Number(line);if(n===-1)return {value:null,next:start};if(buffer.length<start+n+2)return null;return {value:buffer.subarray(start,start+n),next:start+n+2}}
 if(tag==='*'){const result=[];let next=start;for(let i=0;i<Number(line);i++){const part=parse(next);if(!part)return null;result.push(part.value);next=part.next}return {value:result,next}}throw Error('unsupported response');}
 socket.setTimeout(10000,()=>finish(Error('local Redis timeout')));socket.on('error',e=>finish(e));socket.on('connect',()=>socket.write(request));socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>32*1024*1024)return finish(Error('single response limit'));try{const results=[];let offset=0;for(let i=0;i<commands.length;i++){const part=parse(offset);if(!part)return;results.push(part.value);offset=part.next}finish(null,results)}catch(e){finish(e)}});socket.on('end',()=>{if(!finished)finish(Error('incomplete response'))});
 });
}
async function command(args){return (await pipeline([args]))[0]}
return {command,pipeline};
}
module.exports={...createClient(),createClient};
