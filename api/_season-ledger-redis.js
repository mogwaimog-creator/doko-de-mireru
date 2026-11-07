'use strict';
// Opt-in storage adapter for future season ledger. No Redis command is run on import.
// Uses a separate v1 namespace and SET NX to protect existing records.
const {command}=require('./_redis');
const {valid}=require('./_season-ledger-cache');
const PREFIX='doko:season:v1';
function key(type,id,seasonNumber){
 if(!valid(type,id,seasonNumber))throw Error('Invalid season identity');
 return `${PREFIX}:${type}:${id}:${seasonNumber}`;
}
function decode(raw,type,id,seasonNumber){
 if(raw==null)return null;
 let value;
 try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw Error('Invalid stored season JSON');}
 if(!value||value.type!==type||value.id!==id||value.seasonNumber!==seasonNumber||
 !Array.isArray(value.episodes))throw Error('Invalid stored season record');
 return value;
}
async function getRecord(type,id,seasonNumber){
 const raw=await command(['GET',key(type,id,seasonNumber)]);
 return decode(raw,type,id,seasonNumber);
}
async function putRecordIfAbsent(record){
 if(!record||!valid(record.type,record.id,record.seasonNumber)||!Array.isArray(record.episodes))
 throw Error('Invalid season record');
 const saved=await command(['SET',key(record.type,record.id,record.seasonNumber),JSON.stringify(record),'NX']);
 return saved==='OK';
}
module.exports={PREFIX,key,decode,getRecord,putRecordIfAbsent};
