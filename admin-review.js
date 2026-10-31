'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 let token='',offset=0,items=[],total=0,hasMore=false,busy=false;
 const message=text=>{$('message').textContent=text;};
 const button=(id,disabled)=>{$(id).disabled=disabled;};
 function reset(){
   token='';offset=0;items=[];total=0;hasMore=false;
   $('secret').value='';$('queue').hidden=true;
   button('disconnect',true);message('認証情報を消去しました。');
 }
 async function request(path,options={}){
   const response=await fetch(path,{...options,cache:'no-store',credentials:'same-origin',
     headers:{Authorization:'Bearer '+token,...options.headers}});
   let body={};try{body=await response.json();}catch{}
   if(!response.ok)throw Object.assign(new Error(body.error||'通信エラー'),{status:response.status});
   return body;
 }
 function td(row,value){const cell=document.createElement('td');cell.textContent=value??'—';row.append(cell);return cell;}
 function render(){
   const tbody=$('rows');tbody.replaceChildren();
   const visible=items.filter(x=>!$('pending').checked||x.status!=='reviewed');
   $('summary').textContent='登録された確認対象：'+total+'件（このページ：'+visible.length+'件表示）';
   $('position').textContent=(offset+1)+'〜'+(offset+items.length)+'件 / '+total+'件';
   button('previous',busy||offset===0);button('next',busy||!hasMore);
   if(!visible.length){const tr=document.createElement('tr'),cell=td(tr,'このページに表示対象はありません。');cell.colSpan=6;tbody.append(tr);return;}
   for(const item of visible){
     const tr=document.createElement('tr');
     td(tr,item.title||'作品名未取得');td(tr,item.releaseYear);
     td(tr,(item.type==='tv'?'TV':'映画')+' / '+item.id);
     const labels={reviewed:'確認済み',unreviewed:'未確認',needs_recheck:'再確認が必要'};
     td(tr,labels[item.status]||'不明');
     td(tr,item.reviewedAt?new Date(item.reviewedAt).toLocaleString('ja-JP'):'—');
     const action=document.createElement('td'),btn=document.createElement('button');
     btn.type='button';btn.textContent=item.status==='reviewed'?'確認済み':'確認済みにする';
     btn.disabled=busy||item.status==='reviewed'||!item.fingerprint||!item.title||!item.releaseYear;
     btn.addEventListener('click',()=>confirmReview(item));
     action.append(btn);tr.append(action);tbody.append(tr);
   }
 }
 async function load(){
   if(!token||busy)return;
   busy=true;message('読み込み中…');
   try{
     const data=await request('/api/admin-review-queue?offset='+offset);
     items=data.items||[];total=data.totalIndexed||0;hasMore=!!data.hasMore;
     $('queue').hidden=false;button('disconnect',false);message('一覧を取得しました。');
   }catch(error){
     $('queue').hidden=true;message(error.status===401?'認証キーを確認してください。':'取得できませんでした：'+error.message);
   }finally{busy=false;render();}
 }
 async function confirmReview(item){
   if(busy||!token)return;
   if(!window.confirm('「'+item.title+'」（'+item.releaseYear+'年 / '+item.type+' '+item.id+'）の作品名・公開年・TMDB IDを確認済みにしますか？'))return;
   busy=true;render();message('確認状況を保存中…');
   try{
     await request('/api/admin-confirm-review',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({type:item.type,id:item.id,expectedFingerprint:item.fingerprint})});
     message('確認済みを保存しました。');
   }catch(error){message(error.status===409?'情報が変更されています。一覧を再読み込みしてください。':'保存できませんでした：'+error.message);}
   finally{busy=false;await load();}
 }
 $('connect').addEventListener('click',()=>{const value=$('secret').value.trim();if(!value){message('認証キーを入力してください。');return;}token=value;$('secret').value='';offset=0;load();});
 $('disconnect').addEventListener('click',reset);
 $('pending').addEventListener('change',render);
 $('previous').addEventListener('click',()=>{if(offset>=50){offset-=50;load();}});
 $('next').addEventListener('click',()=>{if(hasMore){offset+=50;load();}});
 window.addEventListener('pagehide',()=>{token='';});
})();
