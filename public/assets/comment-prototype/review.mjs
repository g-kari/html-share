import {fixture,normalize,makeAnchor,MockStore,Composer} from './core.mjs';
const $=id=>document.getElementById(id);const store=new MockStore();const composer=new Composer(store);let anchor=null,composing=false,editing=null,editDraft=null,undo=null,activeKey=null;const selected=new Set();
let selectionAnchor=null, proposedTarget=null;
const sameTarget=(a,b)=>a?.stableId===b?.stableId&&a?.start===b?.start&&a?.end===b?.end;
function targetSummary(){
 $('target').textContent=anchor?`入力対象: ${anchor.exact}`:'対象を選んでください';
 $('return-target').disabled=!anchor;
 $('composer-mode').textContent=editing?'保存済みリクエストを編集中':'新しいリクエスト';
}
function closeSelection(){selectionAnchor=null;$('selection-tools').hidden=true;}
function cancelTargetChange(){proposedTarget=null;$('target-change').hidden=true;}

const say=text=>{$('messages').textContent=text;};
function highlight(next){for(const p of document.querySelectorAll('[data-block]')){const block=fixture.blocks.find(b=>b.id===p.dataset.block);p.replaceChildren();const text=normalize(block.text);if(next?.stableId===block.id){p.append(document.createTextNode(text.slice(0,next.start)));const mark=document.createElement('mark');mark.textContent=text.slice(next.start,next.end);p.append(mark,document.createTextNode(text.slice(next.end)));}else p.textContent=text;p.closest('.sample-block')?.classList.toggle('target-active',next?.stableId===block.id);p.closest('.sample-block')?.querySelector('[data-role=anchor]')?.setAttribute('aria-pressed',String(next?.stableId===block.id));}for(const button of document.querySelectorAll('[data-figure-part]'))button.setAttribute('aria-pressed',String(next?.stableId==='flow'&&next.exact===button.dataset.figurePart));}
function choose(next,forEdit=false,confirmed=false){
 if(editing&&!forEdit&&sameTarget(anchor,next)){cancelTargetChange();closeSelection();$('body').focus();return;}
 if(!forEdit&&!confirmed&&$('body').value.trim()&&!sameTarget(anchor,next)){
  proposedTarget=next;$('target-change').hidden=false;
  $('target-change-message').textContent=`入力中の文章があります。対象を「${next.exact}」に変更しますか？${editing?' 編集は終了し、新規リクエストの下書きに戻ります。':''}`;
  $('confirm-target').textContent=editing?'編集を保存せず対象を変更':'下書きを保って対象を変更';$('confirm-target').focus();$('target-change').scrollIntoView?.({block:'nearest'});return;
 }
 cancelTargetChange();closeSelection();
 if(editing&&!forEdit){endEdit();say('編集を終了し、元の下書きに戻しました。編集内容は保存していません。');}
 anchor=next;activeKey=forEdit?editing?.key:null;$('viewing-target').hidden=true;highlight(next);render();targetSummary();$('body').focus();$('form').scrollIntoView?.({block:'nearest'});
}
function jump(entry,toTarget=false){activeKey=entry.key;highlight(entry.request.anchor);render();$('viewing-target').hidden=false;$('viewing-target').textContent=`閲覧中: ${entry.request.anchor.exact}（入力対象は変更しません）`;const target=toTarget?document.querySelector(`[data-block="${entry.request.anchor.stableId}"]`):document.querySelector(`[data-key="${entry.key}"]`);target?.focus();target?.scrollIntoView?.({block:'nearest',behavior:'auto'});say(toTarget?'閲覧対象を表示しました。コメントの入力対象は変更していません。':'対象に付いた指摘を表示しました。コメントの入力対象は変更していません。');}
function change(entry,body,status){try{const previous={body:entry.result.body,status:entry.result.status};entry.result=store.changeThread({id:entry.result.id,expectedRevision:entry.result.revision,body,status},crypto.randomUUID());undo={entry,...previous,revision:entry.result.revision};$('undo').disabled=false;render();say('変更をこのタブのメモリに保存しました。直前の変更を取り消せます。');return true;}catch(error){say(error.message);return false;}}

for(const block of fixture.blocks){
 const row=document.createElement('div');row.className='sample-block';
 const p=document.createElement('p');p.tabIndex=-1;p.textContent=normalize(block.text);p.dataset.block=block.id;row.append(p);
 if(block.kind==='figure'){
  const diagram=document.createElement('div');diagram.className='flow-elements';diagram.setAttribute('role','group');diagram.setAttribute('aria-label','図の要素を選んで修正を依頼');
  for(const [index,label] of ['指摘の保存','JSON書き出し','AIの修正案','別の公開承認'].entries()){
   const item=document.createElement('button');item.type='button';item.className='flow-element';item.dataset.figurePart=label;item.setAttribute('aria-pressed','false');
   const title=document.createElement('strong');title.textContent=`${index+1}. ${label}`;
   const note=document.createElement('small');note.textContent=index<2?'この要素の修正を依頼':'未接続の工程を示す合成図';item.append(title,note);
   item.addEventListener('click',()=>{const text=normalize(block.text),start=text.indexOf(label);choose(makeAnchor(fixture,block.id,start,start+label.length));});diagram.append(item);
  }
  row.append(diagram);
 }
 const button=document.createElement('button');button.type='button';button.dataset.role='anchor';button.setAttribute('aria-pressed','false');button.textContent=block.kind==='figure'?'図全体の修正を依頼':'この段落の修正を依頼';button.addEventListener('click',()=>choose(makeAnchor(fixture,block.id)));row.append(button);
 const pins=document.createElement('div');pins.dataset.pins=block.id;pins.className='pins';row.append(pins);$('article').append(row);
}
function readSelection(){
 const selection=getSelection();if(!selection||selection.rangeCount!==1||selection.isCollapsed)return null;
 const range=selection.getRangeAt(0);
 const parent=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest('[data-block]');
 if(!parent||!parent.contains(range.endContainer))return null;
 const before=range.cloneRange();before.selectNodeContents(parent);before.setEnd(range.startContainer,range.startOffset);
 try{return makeAnchor(fixture,parent.dataset.block,before.toString().length,before.toString().length+range.toString().length);}catch{return null;}
}
function offerSelection(){
 const next=readSelection();if(!next){closeSelection();return;}
 // Rewriting or moving the focused toolbar on selectionchange can cancel its click.
 if(sameTarget(selectionAnchor,next)&&!$('selection-tools').hidden)return;
 selectionAnchor=next;$('selection-preview').textContent=`選択中: ${next.exact}`;
 const row=document.querySelector(`[data-block="${next.stableId}"]`).closest('.sample-block');if(row.nextElementSibling!==$('selection-tools'))row.after($('selection-tools'));$('selection-tools').hidden=false;
}
// Native selection remains untouched until the user asks to compose. No focus stealing.
document.addEventListener('selectionchange',offerSelection);
$('article').addEventListener('pointerup',offerSelection);
$('article').addEventListener('keyup',offerSelection);
for(const id of ['selection','request-selection'])$(id).addEventListener('pointerdown',event=>event.preventDefault());
$('selection').addEventListener('click',()=>{const next=readSelection();if(next)choose(next);else say('一つの段落内で文章を選択してください。段落ボタンも使えます。');});
$('request-selection').addEventListener('click',()=>{if(selectionAnchor)choose(selectionAnchor);});
$('dismiss-selection').addEventListener('click',()=>{closeSelection();getSelection()?.removeAllRanges();});
$('confirm-target').addEventListener('click',()=>{if(proposedTarget)choose(proposedTarget,false,true);});
$('keep-target').addEventListener('click',()=>{cancelTargetChange();$('body').focus();});
$('return-target').addEventListener('click',()=>{if(!anchor)return;activeKey=null;$('viewing-target').hidden=true;highlight(anchor);render();const p=document.querySelector(`[data-block="${anchor.stableId}"]`);p.focus();p.scrollIntoView?.({block:'nearest'});});
$('body').addEventListener('compositionstart',()=>{composing=true;$('save').disabled=true;});$('body').addEventListener('compositionend',()=>{composing=false;$('save').disabled=false;});$('body').addEventListener('input',()=>{$('draft-state').textContent='未保存';});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&!composing){if(proposedTarget){cancelTargetChange();$('body').focus();return;}closeSelection();getSelection()?.removeAllRanges();if(editing)endEdit();else{anchor=null;highlight(null);targetSummary();$('target').textContent='選択を解除しました。入力は保持しています';}}});
function render(){const list=$('comments');$('request-count').textContent=composer.pending.size?`${composer.pending.size}件のリクエスト · AI未送信`:'まだリクエストはありません';const active=document.activeElement;const focusedKey=active?.closest('#comments li')?.dataset.key;const focusedRole=active?.dataset.role;const focusedPin=active?.dataset.pinKey;list.replaceChildren();for(const pins of document.querySelectorAll('[data-pins]'))pins.replaceChildren();let number=0;for(const entry of composer.pending.values()){const li=document.createElement('li');li.dataset.key=entry.key;li.tabIndex=-1;li.id=`comment-${++number}`;const heading=document.createElement('p');heading.className='request-title';heading.textContent=`リクエスト ${number}`;li.append(heading);li.classList.toggle('comment-active',activeKey===entry.key);const pin=document.createElement('button');pin.type='button';pin.dataset.pinKey=entry.key;pin.textContent=`指摘 ${number}`;pin.setAttribute('aria-label',`リクエスト ${number} を表示`);pin.setAttribute('aria-pressed',String(activeKey===entry.key));pin.addEventListener('click',()=>jump(entry));document.querySelector(`[data-pins="${entry.request.anchor.stableId}"]`)?.append(pin);const quote=document.createElement('p');quote.textContent=`対象: ${entry.request.anchor.exact}`;const body=document.createElement('p');body.textContent=entry.result?.body??entry.request.body;const status=document.createElement('p');status.textContent=({saving:'保存中（メモリへの確認待ち）',saved:'保存済み（メモリのみ）',failed:'保存失敗・入力保持',checking:'結果確認中・再送前に照合'})[entry.status];li.append(quote,body,status);const targetButton=document.createElement('button');targetButton.type='button';targetButton.dataset.role='target';targetButton.textContent='対象へ移動';targetButton.addEventListener('click',()=>jump(entry,true));li.append(targetButton);if(entry.status==='saved'){const state=document.createElement('strong');state.textContent=entry.result.status==='resolved'?'解決済み':'未解決';li.append(state);const edit=document.createElement('button');edit.type='button';edit.dataset.role='edit';edit.textContent='編集';edit.addEventListener('click',()=>{if(editing===entry){$('body').focus();return;}if(editing&&$('body').value!==editing.result.body){say('編集中の変更を保存するか、編集を取り消してから別のリクエストを開いてください。');$('body').focus();return;}if(!editing)editDraft={body:$('body').value,anchor};editing=entry;activeKey=entry.key;choose(entry.request.anchor,true);render();$('body').value=entry.result.body;$('save').textContent='編集を保存';$('cancel-edit').hidden=false;say('編集中です。保存するまで一覧は変わりません。');});const resolve=document.createElement('button');resolve.type='button';resolve.dataset.role='resolve';resolve.textContent=entry.result.status==='resolved'?'再開する':'解決にする';resolve.addEventListener('click',()=>change(entry,entry.result.body,entry.result.status==='resolved'?'open':'resolved'));li.append(edit,resolve);const label=document.createElement('label');const box=document.createElement('input');box.type='checkbox';box.dataset.role='select';box.checked=selected.has(entry.result.id);box.addEventListener('change',()=>{if(box.checked)selected.add(entry.result.id);else selected.delete(entry.result.id);$('export').disabled=selected.size===0;});label.append(box,document.createTextNode(' 修正依頼に含める'));li.append(label);}if(['failed','checking'].includes(entry.status)){const retry=document.createElement('button');retry.dataset.role='retry';retry.textContent=entry.status==='checking'?'保存結果を確認':'同じ内容で再送';retry.addEventListener('click',async()=>{if(entry.status==='checking'){composer.reconcile(entry.key);say(entry.status==='saved'?'保存結果を確認しました。このタブのメモリに保存済みです。':'保存は確認できませんでした。同じ内容で再送できます。');render();}else await persist(entry);});li.append(retry);}list.append(li);}$('export').disabled=selected.size===0;if(focusedKey){const row=[...list.children].find(x=>x.dataset.key===focusedKey);const control=row&&[...row.querySelectorAll('[data-role]')].find(x=>x.dataset.role===focusedRole);(control||row)?.focus();}else if(focusedPin){[...document.querySelectorAll('[data-pin-key]')].find(x=>x.dataset.pinKey===focusedPin)?.focus();}}
async function persist(entry){const promise=composer.persist(entry.key,async(request,key)=>{await new Promise(resolve=>setTimeout(resolve,350));if($('failure').value==='before')throw new Error('模擬通信失敗');const result=store.save(request,key);if($('failure').value==='after')throw new Error('模擬応答消失');return result;});render();say('保存中です。まだ保存済みではありません。');await promise;render();say(({saved:'指摘をこのタブのメモリに保存しました。',failed:'保存に失敗しました。入力は一覧に保持しています。',checking:'保存結果が不明です。再送の前に保存結果を確認してください。'})[entry.status]);}
$('form').addEventListener('submit',event=>{event.preventDefault();if(composing)return;if(proposedTarget){say('入力対象の変更を確認または取り消してください');return;}if(!anchor){say('対象を選んでください');return;}const body=$('body').value;if(!body.trim()){say('コメントを入力してください');return;}if(editing){if(change(editing,body,editing.result.status)){endEdit();}return;}cancelTargetChange();const entry=composer.stage(anchor,body);activeKey=entry.key;$('body').value='';$('draft-state').textContent='次の指摘を入力できます。保存状況は一覧に表示します。';void persist(entry);});
$('version').addEventListener('click',()=>{store.model={...fixture,version:'mock-v2'};say('本文は新版になりました。旧版の保存・修正依頼は停止します。入力は保持されます。');});
$('export').addEventListener('click',()=>{try{const data=store.exportRequest([...selected]);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='mock-review-request.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('JSONを書き出しました。AI未開始・公開未依頼です。');}catch(error){say(error.message);}});

function endEdit(){editing=null;$('save').textContent='リクエストを残す';$('cancel-edit').hidden=true;if(editDraft){$('body').value=editDraft.body;anchor=editDraft.anchor;highlight(anchor);$('target').textContent=anchor?`入力対象: ${anchor.exact}`:'対象を選んでください';editDraft=null;}targetSummary();cancelTargetChange();}
$('cancel-edit').addEventListener('click',()=>{endEdit();$('body').focus();say('編集を取り消しました。保存済みの指摘は変わりません。');});
$('undo').addEventListener('click',()=>{if(!undo)return;try{const prior=undo;prior.entry.result=store.changeThread({id:prior.entry.result.id,expectedRevision:prior.revision,body:prior.body,status:prior.status},crypto.randomUUID());undo=null;$('undo').disabled=true;render();say('直前の変更を取り消しました。');}catch(error){say(error.message);}});
for(const button of document.querySelectorAll('[data-preview]'))button.addEventListener('click',()=>{const after=button.dataset.preview==='after';$('preview-text').textContent=after?'公開本文は変えません。指摘と修正案は、別々に管理します。':normalize(fixture.blocks[0].text);for(const peer of document.querySelectorAll('[data-preview]'))peer.setAttribute('aria-pressed',String(peer===button));});
