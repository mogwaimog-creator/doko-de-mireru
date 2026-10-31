'use strict';
// Separate, bounded Redis incident records. Metadata remains untouched.
const { command } = require('./_redis');
const { identity } = require('./_work-ledger');
const { classifyWorkError } = require('./_work-error-policy');

const PREFIX = 'doko:work-issue:v1';
const INDEX = 'doko:work-issue:index:v1';
function issueKey(type,id,area) {
  const item = identity(type,id);
  if (!['metadata','providers','poster'].includes(area)) throw new Error('Invalid issue area');
  return PREFIX + ':' + item.type + ':' + item.id + ':' + area;
}
function statusFromError(error) {
  const n = Number(error && (error.status || error.statusCode || error.response?.status));
  return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
}
async function recordIssue(type,id,area,error,now = new Date().toISOString()) {
  const key=issueKey(type,id,area), status=statusFromError(error);
  const raw=await command(['GET',key]);
  let previous=null;
  try { previous=raw ? (typeof raw==='string' ? JSON.parse(raw) : raw) : null; } catch (_) {}
  const kind=classifyWorkError(status);
  const same=previous && previous.kind===kind && previous.httpStatus===status;
  const record={type,id:Number(id),area,kind,httpStatus:status,
    firstSeenAt:same ? previous.firstSeenAt : now,lastSeenAt:now,
    count:same ? Math.min(1000000,(Number(previous.count)||0)+1) : 1,
    reviewRequired:kind==='id_review' || area==='poster'};
  await command(['SET',key,JSON.stringify(record)]);
  // Sorted set makes monthly review a bounded index scan, not a Redis KEYS sweep.
  await command(['ZADD',INDEX,Date.parse(now)||Date.now(),key]);
  return record;
}
async function listIssues(limit=100) {
  const n=Math.max(1,Math.min(200,Number(limit)||100));
  const keys=await command(['ZREVRANGE',INDEX,0,n-1]);
  const results=[];
  for(const key of (Array.isArray(keys)?keys:[])) {
    const raw=await command(['GET',key]);
    if(!raw) continue;
    try { results.push(typeof raw==='string'?JSON.parse(raw):raw); } catch (_) {}
  }
  return results;
}
async function clearIssue(type,id,area) {
  const key=issueKey(type,id,area);
  await command(['DEL',key]);
  await command(['ZREM',INDEX,key]);
}
module.exports={issueKey,statusFromError,recordIssue,listIssues,clearIssue};
