'use strict';
// Private, read-only administration endpoint. Never expose credentials or raw Redis keys.
const { listIssues } = require('./_work-issues');
const works = require('../data/streaming-works.json');
module.exports = async function adminStatus(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method !== 'GET') return res.status(405).json({error:'GET only'});
  const secret=process.env.ADMIN_STATUS_SECRET;
  if(!secret || req.headers.authorization !== 'Bearer '+secret)
    return res.status(401).json({error:'Unauthorized'});
  try {
    const issues=await listIssues(100);
    const safeIssues=issues.map(i=>({
      type:i.type,id:i.id,area:i.area,kind:i.kind,
      httpStatus:i.httpStatus,firstSeenAt:i.firstSeenAt,
      lastSeenAt:i.lastSeenAt,count:i.count,reviewRequired:i.reviewRequired
    }));
    return res.status(200).json({
      generatedAt:new Date().toISOString(),
      scheduledSeriesWorkCount:new Set(works.map(w=>w.type+':'+w.id)).size,
      issuesShown:safeIssues.length,
      issuesLimit:100,
      issues:safeIssues,
      note:'Scheduled series count is not the total number of works in Redis.'
    });
  } catch(error) {
    console.error('admin-status failed',error.message);
    return res.status(503).json({error:'Status temporarily unavailable'});
  }
};
