/* Shared display only. Uses the response of the existing series-watch request; no additional API calls. */
(function(){
  'use strict';
  const message='※配信状況や料金は変更される場合があります。ご契約・ご視聴の前に、必ず各配信サービスの公式サイトで最新情報をご確認ください。';
  let panel, line;
  function ensure(){
    if(panel)return;
    const main=document.getElementById('mcuWatchList')||document.querySelector('main')||document.body;
    panel=document.createElement('section');
    panel.className='doko-series-update-status';
    panel.setAttribute('aria-label','配信情報の更新状況');
    panel.style.cssText='box-sizing:border-box;max-width:1100px;margin:16px auto;padding:14px 18px;border:1px solid #cbd8ea;border-radius:12px;background:#f1f5fc;color:#233b5b;font-size:14px;line-height:1.7';
    line=document.createElement('div');
    line.style.fontWeight='700';
    line.textContent='配信情報：最終取得日を確認しています';
    const schedule=document.createElement('div');
    schedule.textContent='配信情報は毎朝6時を目安に更新しています。';
    const notice=document.createElement('div');
    notice.textContent=message;
    panel.append(line,schedule,notice);
    const title=main.id==='mcuWatchList'?main.querySelector('#mcuWatchTitle'):null;
    if(title)title.insertAdjacentElement('afterend',panel);
    else main.insertBefore(panel,main.firstChild);
  }
  function dayJst(date){
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric'}).format(date);
  }
  let pending=null;
  window.dokoUpdateSeriesStatus=function(data){
    pending=data;
    if(document.readyState==='loading')return;
    render();
  };
  function render(){
    ensure();
    if(!pending||!pending.providers){
      line.textContent='配信情報：更新状況を確認できません';
      return;
    }
    const records=Object.values(pending.providers);
    const valid=records.map(r=>({date:new Date(r.checkedAt),stale:r.stale})).filter(r=>Number.isFinite(r.date.getTime())&&r.date.getTime()<=Date.now()+60000);
    if(!valid.length){
      line.textContent='配信情報：保存済みデータの取得日を確認できません';
      return;
    }
    const newest=new Date(Math.max(...valid.map(r=>r.date.getTime())));
    const newestDay=dayJst(newest);
    const partial=(pending.failures||[]).length>0||valid.length!==records.length||valid.some(r=>r.stale||dayJst(r.date)!==newestDay);
    line.textContent='配信情報：'+newestDay+'更新'+(partial?'（一部は前回取得分）':'');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
  else render();
})();
