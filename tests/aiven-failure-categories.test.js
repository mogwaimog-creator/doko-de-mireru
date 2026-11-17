'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {failureCode,createAivenConnection}=require('../api/_aiven-connection-v2');
test('classifies bounded safe Redis failure categories',()=>{
 const cases=[['NOSCRIPT No matching script','lua-script-missing'],['ERR Error running script (call to f_123): user_script:1: error','lua-runtime'],['NOPERM this user has no permissions','permission'],['WRONGPASS invalid username-password pair','permission'],['OOM command not allowed when used memory > maxmemory','memory'],['ERR unknown command','command-rejected'],['unexpected secret=123','unknown']];
 for(const [message,expected] of cases)assert.equal(failureCode({message}),expected);
 assert.equal(failureCode({code:'ETIMEDOUT'}),'timeout');
 assert.equal(failureCode({code:'ECONNRESET'}),'network');
 assert.equal(failureCode({code:'CERT_HAS_EXPIRED'}),'tls');
});
test('EVAL error emits only fixed code, never sensitive message or Lua body',async()=>{
 const lines=[],secret='PRIVATE_SCRIPT_OR_PASSWORD_DO_NOT_LOG';
 const createClient=()=>({isOpen:false,on(){return this},async connect(){this.isOpen=true},async sendCommand(){throw Error('ERR Error running script '+secret)},destroy(){this.isOpen=false}});
 const connection=createAivenConnection({REDIS_PROVIDER:'valkey',AIVEN_REDIS_URL:'rediss://user:password@example.aivencloud.com:12345'},{createClient,emit:(...parts)=>lines.push(parts.join(' '))});
 await assert.rejects(connection.command(['EVAL','return 1','0']),/outcome may be unknown/);
 const output=lines.join(' ');assert.match(output,/command-lua-runtime/);assert.doesNotMatch(output,/PRIVATE_SCRIPT|password|example\.aivencloud|return 1/);
 connection.close();
});
