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
const starwarsWorks=[{type:'tv',id:114479},{type:'movie',id:1893},{type:'movie',id:1894},{type:'movie',id:12180},{type:'tv',id:4194},{type:'tv',id:203085},{type:'movie',id:1895},{type:'tv',id:251091},{type:'tv',id:288055},{type:'tv',id:105971},{type:'tv',id:289219},{type:'movie',id:348350},{type:'tv',id:92830},{type:'tv',id:83867},{type:'tv',id:60554},{type:'movie',id:330459},{type:'movie',id:11},{type:'movie',id:1891},{type:'movie',id:1892},{type:'tv',id:82856},{type:'tv',id:115036},{type:'tv',id:114461},{type:'tv',id:225011},{type:'movie',id:1228710},{type:'tv',id:79093},{type:'movie',id:140607},{type:'movie',id:181808},{type:'movie',id:181812}];
const wildspeedWorks=[9799,584,9615,13804,51497,82992,168259,337339,384018,385128,385687].map(id=>({type:'movie',id}));
const minionsWorks=[20352,93456,211672,324852,438148,519182,1315772].map(id=>({type:'movie',id}));
const odoruWorks=[{type:'tv',id:20794},...([545255,545819,55382,55384,65841,835865,193402,1285372,1285375,1491083,1172474,59952,45070,1394731,1475877].map(id=>({type:'movie',id})))];
const evaWorks=[15137,22843,75629,283566,18491].map(id=>({type:'movie',id})).concat([{type:'tv',id:890}]);
const conanWorks=[21422,21452,28808,20677,32022,26662,39202,39203,39204,39205,39206,39207,28764,97375,77617,122583,228805,257512,316873,374856,438058,493006,566555,662638,903939,1047041,1209217,1396965,1545621].map(id=>({type:'movie',id})).concat([{type:'tv',id:30983}]);
const KEYPREFIX='doko:watch:v3:';
const MAX_AGE_MS=36*60*60*1000; // Daily Hobby updates plus scheduling tolerance.
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=120, stale-while-revalidate=60');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  if(!['godzilla','mcu','jurassic','harrypotter','lordoftherings','starwars','wildspeed','minions','odoru','eva','conan'].includes(req.query.series))return res.status(400).json({error:'Unknown series'});
  const works=req.query.series==='godzilla'?godzillaWorks:req.query.series==='mcu'?mcuWorks:req.query.series==='jurassic'?jurassicWorks:req.query.series==='harrypotter'?harrypotterWorks:req.query.series==='lordoftherings'?lordoftheringsWorks:req.query.series==='starwars'?starwarsWorks:req.query.series==='wildspeed'?wildspeedWorks:req.query.series==='minions'?minionsWorks:req.query.series==='odoru'?odoruWorks:req.query.series==='eva'?evaWorks:conanWorks;
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
