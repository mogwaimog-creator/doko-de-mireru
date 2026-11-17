'use strict';
// Local-only end-to-end Aiven/TMDB test. Never modifies production ledger keys.
// Usage: node scripts/test-aiven-streaming-local.js movie 157336
const tls=require('node:tls'),crypto=require('node:crypto'),readline=require('node:readline');
const [type,idText]=process.argv.slice(2);
const id=Number(idText);
if(!['movie','tv'].includes(type)||!Number.isSafeInteger(id)||id<1){console.error('Usage: node scripts/test-aiven-streaming-local.js movie 157336');process.exit(2)}
const host='doko-de-mireru-valkey-mogwaimog-fc7c.e.aivencloud.com',port=16890;
const ask=q=>new Promise(resolve=>{const rl=readline.createInterface({input:process.stdin,output:process.stdout});rl.question(q,v=>{rl.close();resolve(v)})});
function encode(args){const parts=[Buffer.from('*'+args.length+'\r\n')];for(const x of args){const b=Buffer.from(String(x));parts.push(Buffer.from('$'+b.length+'\r\n'),b,Buffer.from('\r\n'))}return Buffer.concat(parts)}
async function main(){
 const tmdb=await ask('TMDB API key (local only): ');
 const password=await ask('Aiven password (local only; visible while typing): ');
 const response=await fetch('https://api.themoviedb.org/3/'+type+'/'+id+'/watch/providers?api_key='+encodeURIComponent(tmdb),{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('TMDB HTTP '+response.status);
 const jp=(await response.json()).results?.JP||{};
 const pick=a=>Array.isArray(a)?a.filter(p=>Number.isInteger(p.provider_id)&&typeof p.logo_path==='string').map(p=>({provider_id:p.provider_id,provider_name:p.provider_name,logo_path:p.logo_path})):[];
 const record={type,id,flatrate:pick(jp.flatrate),rent:pick(jp.rent),buy:pick(jp.buy),checkedAt:new Date().toISOString()};
 console.log('TMDB取得成功: 見放題'+record.flatrate.length+'件 / レンタル'+record.rent.length+'件 / 購入'+record.buy.length+'件');
 const key='chatgpt:connection-test:streaming:'+crypto.randomUUID(),payload=JSON.stringify(record);
 const socket=tls.connect({host,port,servername:host,timeout:10000});
 let buf=Buffer.alloc(0),pending;
 socket.on('data',chunk=>{buf=Buffer.concat([buf,chunk]);while(pending){const i=buf.indexOf('\r\n');if(i<0)return;const prefix=String.fromCharCode(buf[0]);let consumed=i+2,value;if(prefix==='$'){const len=Number(buf.subarray(1,i));consumed=len<0?i+2:i+2+len+2;if(buf.length<consumed)return;value=len<0?null:buf.subarray(i+2,i+2+len).toString()}else if(['+',':','-'].includes(prefix)){value=buf.subarray(1,i).toString()}else{pending.reject(Error('Unexpected RESP response'));pending=null;return}buf=buf.subarray(consumed);const p=pending;pending=null;prefix==='-'?p.reject(Error('Aiven command rejected')):p.resolve(value)}});
 const fail=e=>{if(pending){pending.reject(e);pending=null}};
 socket.on('error',fail);socket.on('timeout',()=>{fail(Error('Aiven timeout'));socket.destroy()});
 await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',reject)});
 const command=(...args)=>new Promise((resolve,reject)=>{if(pending)return reject(Error('Concurrent command'));pending={resolve,reject};socket.write(encode(args))});
 try{
  if(await command('AUTH','default',password)!=='OK')throw Error('Authentication failed');
  console.log('Aiven認証成功');
  if(await command('SET',key,payload,'NX','EX','60')!=='OK')throw Error('Temporary save failed');
  console.log('テスト用キーへの配信情報保存成功');
  const saved=await command('GET',key);
  if(saved!==payload)throw Error('Readback mismatch');
  console.log('配信情報の読み戻し・完全一致成功');
  const deleted=await command('DEL',key);
  if(deleted!=='1')throw Error('Cleanup failed (key expires within 60s)');
  console.log('テスト用キー削除成功');
  console.log('一連のテスト成功（本番台帳の変更なし）');
 }finally{socket.destroy()}
}
main().catch(e=>{console.error('テスト失敗:',e.message);process.exitCode=1});
