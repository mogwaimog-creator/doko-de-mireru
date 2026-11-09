'use strict';
// Binary-safe, loopback-only adapter. Intentionally has no host/credential option.
const net=require('node:net');
function command(args){
 const values=args.map(x=>Buffer.isBuffer(x)?x:Buffer.from(String(x))),request=Buffer.concat([Buffer.from('*'+values.length+'\r\n'),...values.flatMap(v=>[Buffer.from('$'+v.length+'\r\n'),v,Buffer.from('\r\n')])]);
 return new Promise((resolve,reject)=>{let buffer=Buffer.alloc(0),finished=false;const socket=net.createConnection({host:'127.0.0.1',port:16379});
 const finish=(e,v)=>{if(finished)return;finished=true;socket.destroy();e?reject(e):resolve(v)};
 function parse(offset){const end=buffer.indexOf('\r\n',offset);if(end<0)return null;const tag=String.fromCharCode(buffer[offset]),line=buffer.subarray(offset+1,end).toString(),start=end+2;
 if(tag==='-')throw Error(line);if(tag==='+')return {value:line,next:start};if(tag===':')return {value:Number(line),next:start};
 if(tag==='$'){const n=Number(line);if(n===-1)return {value:null,next:start};if(buffer.length<start+n+2)return null;return {value:buffer.subarray(start,start+n),next:start+n+2}}
 if(tag==='*'){const result=[];let next=start;for(let i=0;i<Number(line);i++){const part=parse(next);if(!part)return null;result.push(part.value);next=part.next}return {value:result,next}}throw Error('unsupported response');}
 socket.setTimeout(10000,()=>finish(Error('local Redis timeout')));socket.on('error',e=>finish(e));socket.on('connect',()=>socket.write(request));socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>32*1024*1024)return finish(Error('single response limit'));try{const part=parse(0);if(part)finish(null,part.value)}catch(e){finish(e)}});socket.on('end',()=>{if(!finished)finish(Error('incomplete response'))});
 });
}
module.exports={command};
