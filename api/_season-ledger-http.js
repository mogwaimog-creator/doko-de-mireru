'use strict';
// Isolated opt-in boundary. Not imported by api/search.js yet.
// Existing API response remains unchanged unless caller explicitly uses this helper.
const {handleSeasonLedgerRequest,parseSeasonRequest}=require('./_season-ledger-route');
function createSeasonApiHandler({getRecord,putRecordIfAbsent,fetchSeason,refreshRecord}){
 return async function seasonApiHandler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  if(!parseSeasonRequest(req.query))return res.status(400).json({error:'Invalid season query'});
  try{
   const data=await handleSeasonLedgerRequest(req.query,{getRecord,putRecordIfAbsent,fetchSeason,refreshRecord});
   return res.status(200).json(data);
  }catch(error){
   // Never mask a Redis/TMDB failure as an empty successful season.
   return res.status(503).json({error:'Season information temporarily unavailable'});
  }
 };
}
module.exports={createSeasonApiHandler};
