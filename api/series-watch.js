'use strict';
// Legacy mode is read-only; explicitly opted-in shared mode can refresh one work
// per series per ten-minute slot, guarded by Redis atomic budget and work lock.
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
  res.setHeader('Cache-Control',process.env.SERIES_WATCH_SHARED_READ_ENABLED==='1'?'public, max-age=0, s-maxage=30, stale-while-revalidate=30':'public, max-age=0, s-maxage=120, stale-while-revalidate=60');
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
          const stale=!Number.isFinite(checked)||Date.now()-checked>MAX_AGE_MS||checked>Date.now()+60000||(process.env.SERIES_WATCH_SHARED_READ_ENABLED==='1'&&require('./_shared-providers').windowId(new Date(checked))!==require('./_shared-providers').windowId());
          providers[keys[i]]={flatrate:record.flatrate,checkedAt:record.checkedAt,stale};continue;}}catch{}
      }
      failures.push(keys[i]);
    }
    // Optional read-only compatibility with the 06:00/18:00 shared cache.
    let sharedReadOk=process.env.SERIES_WATCH_SHARED_READ_ENABLED!=='1';
    if(process.env.SERIES_WATCH_SHARED_READ_ENABLED==='1'){
      try{
        const {windowId}=require('./_shared-providers');
        const current=windowId();
        const shared=await command(['MGET',...keys.map(k=>'doko:provider-window:v1:'+k)]);
        if(!Array.isArray(shared)||shared.length!==keys.length)throw new Error('Incomplete shared cache batch');
        sharedReadOk=true;
        for(let i=0;i<keys.length;i++){
          if(!shared?.[i])continue;
          let entry;
          try{entry=JSON.parse(shared[i]);}catch{continue;}
          if(!entry||!entry.availability||typeof entry.availability!=='object'||Array.isArray(entry.availability))continue;
          const flat=entry.availability.flatrate;
          // A successfully cached JP response may have only rent/buy offers.
          // Such a record confirms no subscription offers; malformed flat-rate data does not.
          if(flat!==undefined&&!Array.isArray(flat))continue;
          // Only a current-window, timestamp-consistent record can confirm
          // that a missing flatrate field means no subscription offers.
          if(flat===undefined&&(entry.window!==current||windowId(entry.lastSuccessfulAt)!==current))continue;
          const subscriptions=flat===undefined?[]:flat;
          const checked=Date.parse(entry.lastSuccessfulAt);
          if(!Number.isFinite(checked)||checked>Date.now()+60000)continue;
          const legacy=providers[keys[i]];
          // A successful fetch from an earlier 06:00/18:00 window remains usable,
          // but must be clearly marked stale even if it was fetched recently.
          const stale=entry.window!==current || windowId(entry.lastSuccessfulAt)!==current || Date.now()-checked>MAX_AGE_MS;
          // Do not replace a fresh legacy record with older shared data.
          if(stale&&legacy&&!legacy.stale)continue;
          // Never replace a newer legacy observation with an older shared one.
          if(legacy&&Number.isFinite(Date.parse(legacy.checkedAt))&&Date.parse(legacy.checkedAt)>checked)continue;
          providers[keys[i]]={flatrate:subscriptions,checkedAt:entry.lastSuccessfulAt,stale};
          const at=failures.indexOf(keys[i]);
          if(at>=0)failures.splice(at,1);
        }
      }catch(error){console.error('Shared provider batch read failed:',error.message);}
    }
    // Bounded refresh is opt-in and only runs after the shared cache is readable.
    // A cache read failure must never turn into uncontrolled TMDB calls.
    if(process.env.SERIES_WATCH_REFRESH_ENABLED==='1' && process.env.SHARED_PROVIDER_ENABLED==='1' && process.env.SERIES_WATCH_SHARED_READ_ENABLED==='1' && sharedReadOk && process.env.TMDB_API_KEY){
      try{
        const {windowId}=require('./_shared-providers');
        const window=windowId();
        const candidates=works.filter(w=>!providers[w.type+':'+w.id]||providers[w.type+':'+w.id].stale);
        // Rotate the candidate order between ten-minute slots to prevent the
        // first failing title from monopolizing every series refresh attempt.
        const slot=Math.floor(Date.now()/600000);
        const selected=candidates.length?candidates[slot%candidates.length]:null;
        if(candidates.length){
          const budget='doko:series-refresh-budget:v1:'+req.query.series+':'+window+':'+slot;
          const acquired=await command(['SET',budget,'1','NX','EX',600]);
          if(acquired==='OK'){
            const work=selected;
            const {detailProviders}=require('./_detail-providers');
            const result=await detailProviders(work.type,work.id,async()=>{
              const token=process.env.TMDB_API_KEY;
              if(!token)throw new Error('TMDB key unavailable');
              const url='https://api.themoviedb.org/3/'+work.type+'/'+work.id+'/watch/providers?api_key='+encodeURIComponent(token);
              const response=await fetch(url,{signal:AbortSignal.timeout(8000)});
              if(!response.ok)throw new Error('TMDB HTTP '+response.status);
              return response.json();
            });
            const key=work.type+':'+work.id;
            if((result.source==='tmdb'||result.source==='cache') && result.availability && typeof result.availability==='object' && !Array.isArray(result.availability)){
              // A successful JP response without flatrate means no subscription offers.
              const flat=Array.isArray(result.availability.flatrate)?result.availability.flatrate:[];
              providers[key]={flatrate:flat,checkedAt:result.lastSuccessfulAt||new Date().toISOString(),stale:false};
              const index=failures.indexOf(key);
              if(index>=0)failures.splice(index,1);
            }
          }
        }
      }catch(error){console.error('SERIES BOUNDED REFRESH FAILED',error.message);}
    }
    return res.status(200).json({providers,failures,complete:failures.length===0});
  }catch(e){console.error('series-watch read:',e.message);return res.status(503).json({error:'保存済みの配信情報を読み込めません'});}
};
