'use strict';
// Read-only endpoint: never calls TMDB and never triggers refresh.
const {command}=require('./_redis');
const godzillaWorks=require('../data/godzilla-works.json');
const allWorks=require('../data/streaming-works.json');
const godzillaKeys=new Set(godzillaWorks.map(w=>`${w.type}:${w.id}`));
const mcuWorks=[{"type":"movie","id":1771},{"type":"movie","id":299537},{"type":"movie","id":1726},{"type":"movie","id":10138},{"type":"movie","id":1724},{"type":"movie","id":10195},{"type":"movie","id":24428},{"type":"movie","id":76338},{"type":"movie","id":68721},{"type":"movie","id":100402},{"type":"movie","id":118340},{"type":"movie","id":283995},{"type":"tv","id":232125},{"type":"movie","id":99861},{"type":"movie","id":102899},{"type":"movie","id":271110},{"type":"movie","id":497698},{"type":"movie","id":284054},{"type":"movie","id":315635},{"type":"movie","id":284052},{"type":"movie","id":284053},{"type":"movie","id":363088},{"type":"movie","id":299536},{"type":"movie","id":299534},{"type":"tv","id":85271},{"type":"movie","id":566525},{"type":"tv","id":88396},{"type":"movie","id":429617},{"type":"movie","id":524434},{"type":"movie","id":634649},{"type":"movie","id":453395},{"type":"tv","id":88329},{"type":"tv","id":92749},{"type":"movie","id":505642},{"type":"tv","id":122226},{"type":"tv","id":92783},{"type":"tv","id":92782},{"type":"movie","id":616037},{"type":"movie","id":894205},{"type":"movie","id":774752},{"type":"movie","id":640146},{"type":"movie","id":447365},{"type":"tv","id":114472},{"type":"movie","id":609681},{"type":"tv","id":138501},{"type":"tv","id":114471},{"type":"movie","id":822119},{"type":"tv","id":202555},{"type":"movie","id":986056},{"type":"tv","id":84958},{"type":"tv","id":91363},{"type":"movie","id":533535},{"type":"movie","id":617126},{"type":"movie","id":969681}];
const jurassicWorks=[329,330,331,135397,351286,507086,1234821].map(id=>({type:'movie',id}));
const harrypotterWorks=[671,672,673,674,675,767,12444,12445,259316,338952,338953].map(id=>({type:'movie',id}));
const lordoftheringsWorks=[120,121,122,49051,57158,122917,839033].map(id=>({type:'movie',id})).concat([{type:'tv',id:84773}]);
const KEYPREFIX='doko:watch:v3:';
const MAX_AGE_MS=36*60*60*1000; // Daily Hobby updates plus scheduling tolerance.
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=120, stale-while-revalidate=60');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  if(!['godzilla','mcu','jurassic','harrypotter','lordoftherings'].includes(req.query.series))return res.status(400).json({error:'Unknown series'});
  const works=req.query.series==='godzilla'?godzillaWorks:req.query.series==='mcu'?mcuWorks:req.query.series==='jurassic'?jurassicWorks:req.query.series==='harrypotter'?harrypotterWorks:lordoftheringsWorks;
  try{
    const keys=works.map(w=>`${w.type}:${w.id}`);
    const values=await command(['MGET',...keys.map(k=>KEYPREFIX+k)]);
    const providers={},failures=[];
    for(let i=0;i<keys.length;i++){
      if(values?.[i]){
        try{const record=JSON.parse(values[i]);if(Array.isArray(record.flatrate)){const checked=Date.parse(record.checkedAt);
          const stale=!Number.isFinite(checked)||Date.now()-checked>MAX_AGE_MS||checked>Date.now()+60000;
          providers[keys[i]]={flatrate:record.flatrate,checkedAt:record.checkedAt,stale};continue;}}catch{}
      }
      failures.push(keys[i]);
    }
    return res.status(200).json({providers,failures,complete:failures.length===0});
  }catch(e){console.error('series-watch read:',e.message);return res.status(503).json({error:'保存済みの配信情報を読み込めません'});}
};
