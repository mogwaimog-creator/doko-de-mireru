'use strict';
const assert=require('node:assert/strict');
const {fromTmdbSeason,getCachedSeason}=require('../api/_season-ledger-cache');
const {seasonResponse}=require('../api/_season-ledger-response');
(async()=>{
 const id=1399,seasonNumber=1;
 const payload={_id:'tmdb-season-id',air_date:'2011-04-17',name:'シーズン1',overview:'season overview',
 season_number:1,poster_path:'/unused.jpg',
 episodes:[
 {id:101,episode_number:1,name:'冬来たる',air_date:'2011-04-17',runtime:62,overview:'日本語の説明',still_path:'/still.jpg',vote_average:8.2,crew:[{name:'X'}]},
 {id:102,episode_number:2,name:'',air_date:null,runtime:null,overview:'',still_path:null},
 {id:103,episode_number:3,name:'Upcoming',air_date:'2030-12-01',runtime:null,overview:null},
 {id:104,episode_number:0,name:'invalid episode number'},
 {id:105,episode_number:null,name:'invalid episode number'}]};
 const record=fromTmdbSeason(id,seasonNumber,payload);
 assert.equal(record.episodes.length,3);
 assert.equal(record.seasonName,'シーズン1');
 assert.equal(record.episodes[0].title,'冬来たる');
 assert.equal(record.episodes[1].title,'');
 assert.equal(record.episodes[1].airDate,null);
 assert.equal(record.episodes[2].runtimeMinutes,null);
 assert.equal(record.episodes[2].overview,'');
 const json=JSON.stringify(record);
 for(const field of ['still_path','poster_path','vote_average','crew','_id'])assert.ok(!json.includes(field),field+' must not be stored');
 const view=seasonResponse(record);
 assert.equal(view.season_number,1);
 assert.equal(view.episodes[0].episode_number,1);
 assert.equal(view.episodes[0].runtime,62);
 assert.equal(view.episodes[2].air_date,'2030-12-01');
 let writes=0;
 await assert.rejects(getCachedSeason({type:'tv',id,seasonNumber,getRecord:async()=>null,
 putRecordIfAbsent:async()=>{writes++;return true;},fetchSeason:async()=>({...payload,season_number:2})}),/mismatched/);
 assert.equal(writes,0,'mismatched season must never be saved');
 console.log('season realistic TMDB fixture tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
