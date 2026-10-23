// No network, credentials, database, or public-site dependency.
export class Conflict extends Error {}
export const normalize = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
export const fixture = Object.freeze({pageId:'mock-page',version:'mock-v1',baseCommit:'synthetic-demo-v1',blocks:Object.freeze([
  Object.freeze({id:'intro',kind:'paragraph',text:'公開本文を変えずに、指摘と修正案を別々に管理します。'}),
  Object.freeze({id:'flow',kind:'figure',text:'図: 指摘の保存 → JSON書き出し → AIの修正案 → 別の公開承認'})
])});
export function makeAnchor(model, blockId, start=0, end) {
  const block=model.blocks.find(b=>b.id===blockId); if(!block) throw new Conflict('対象がありません');
  const text=normalize(block.text); end ??= text.length;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length||end-start>2000) throw new Conflict('選択範囲が無効です');
  // UTF-16 offsets, matching DOM Selection. Never split surrogate pairs.
  for(const pos of [start,end]) if(pos>0 && /[\uD800-\uDBFF]/u.test(text[pos-1]) && /[\uDC00-\uDFFF]/u.test(text[pos]||'')) throw new Conflict('文字の途中は選べません');
  return {kind:block.kind,stableId:block.id,version:model.version,exact:text.slice(start,end),prefix:text.slice(Math.max(0,start-64),start),suffix:text.slice(end,end+64),start,end,normalizerVersion:1};
}
export function resolveAnchor(anchor, model) {
  if(anchor.normalizerVersion!==1) return 'unmapped';
  const b=model.blocks.find(b=>b.id===anchor.stableId); if(!b) return 'orphan';
  const text=normalize(b.text);
  try { const canonical=makeAnchor(model,b.id,anchor.start,anchor.end); if(anchor.kind!==b.kind || !anchor.exact || anchor.exact.length>2000 || (anchor.version===model.version && ['exact','prefix','suffix'].some(k=>anchor[k]!==canonical[k]))) return 'unmapped'; } catch { return 'unmapped'; }
  if(anchor.version===model.version) return text.slice(anchor.start,anchor.end)===anchor.exact && text.slice(Math.max(0,anchor.start-64),anchor.start)===anchor.prefix && text.slice(anchor.end,anchor.end+64)===anchor.suffix ? 'exact':'unmapped';
  const hits=[]; let from=0;
  while(from<=text.length){const at=text.indexOf(anchor.exact,from);if(at<0)break; if(text.slice(Math.max(0,at-64),at)===anchor.prefix&&text.slice(at+anchor.exact.length,at+anchor.exact.length+64)===anchor.suffix)hits.push(at);from=at+1;}
  return hits.length===1?'reattached':hits.length?'ambiguous':'orphan';
}
const copy = value => structuredClone(value);
export class MockStore {
  #state={threads:[],jobs:[],events:[],receipts:{}};
  constructor(model=fixture){ this.model=model; }
  // A synchronous copy-on-write transaction models atomic commit. NOT durable DB.
  #mutate(key, request, mutate) {
    if(typeof key!=='string'||!key||key.length>100)throw new Conflict('request keyが必要です');
    const hash=JSON.stringify(request); const prior=Object.hasOwn(this.#state.receipts,key)?this.#state.receipts[key]:null;
    if(prior){if(prior.hash!==hash)throw new Conflict('同じkeyで内容が異なります');return copy(prior.result);}
    const next=copy(this.#state); const result=mutate(next);
    Object.defineProperty(next.receipts,key,{value:{hash,result:copy(result)},enumerable:true,writable:true,configurable:true}); this.#state=next; return copy(result);
  }
  lookup(key){return copy(Object.hasOwn(this.#state.receipts,key)?this.#state.receipts[key].result:null);}
  list(){return copy(this.#state.threads);}
  save(request,key){return this.#mutate(key,request,s=>{
    if(request.pageId!==this.model.pageId||request.version!==this.model.version||resolveAnchor(request.anchor,this.model)!=='exact')throw new Conflict('版または対象が変わりました。選び直してください');
    if(typeof request.body!=='string'||!request.body.trim()||request.body.length>4000)throw new Conflict('コメントは1〜4000文字です');
    const thread={id:`thread-${s.threads.length+1}`,revision:1,status:'open',body:request.body,anchor:copy(request.anchor),version:request.version,publication:'not_requested'};
    s.threads.push(thread);s.events.push({action:'comment_saved',id:thread.id});return thread;
  });}
  changeThread(request,key){return this.#mutate(key,request,s=>{
    const thread=s.threads.find(t=>t.id===request.id);
    if(!thread||thread.revision!==request.expectedRevision)throw new Conflict('指摘が更新されました。選び直してください');
    if(thread.version!==this.model.version||resolveAnchor(thread.anchor,this.model)!=='exact')throw new Conflict('版ずれした指摘は変更できません');
    if(typeof request.body!=='string'||!request.body.trim()||request.body.length>4000||!['open','resolved'].includes(request.status))throw new Conflict('変更内容が無効です');
    thread.body=request.body;thread.status=request.status;thread.revision++;s.events.push({action:'comment_changed',id:thread.id});return thread;
  });}
  exportRequest(ids){
    if(!ids.length||ids.length>20||new Set(ids).size!==ids.length)throw new Conflict('1〜20件を選択してください');
    const threads=ids.map(id=>this.#state.threads.find(t=>t.id===id));
    if(threads.some(t=>!t||t.version!==this.model.version||resolveAnchor(t.anchor,this.model)!=='exact'))throw new Conflict('版ずれした指摘は依頼できません');
    const payload=copy({schemaVersion:1,mode:'draft_patch',aiStatus:'not_started',publication:'not_requested',pageId:this.model.pageId,baseVersion:this.model.version,baseCommit:this.model.baseCommit,sourceAllowlist:['mock/article.html'],threads});
    if(new TextEncoder().encode(JSON.stringify(payload)).length>200*1024)throw new Conflict('書き出しは200KBまでです。指摘を減らしてください');
    return payload;
  }
  createJob(request,key){return this.#mutate(key,request,s=>{const payload=this.exportRequest(request.ids);if(request.baseVersion!==this.model.version)throw new Conflict('版ずれ');const job={id:`job-${s.jobs.length+1}`,revision:1,status:'queued',fencingToken:0,leaseUntil:0,payload};s.jobs.push(job);return job;});}
  changeJob(request,key){return this.#mutate(key,request,s=>{
    const j=s.jobs.find(j=>j.id===request.id);if(!j||j.revision!==request.expectedRevision)throw new Conflict('revision conflict');
    const now=request.now??0;
    if(['claim','submit'].includes(request.action) && (j.payload.baseVersion!==this.model.version || j.payload.baseCommit!==this.model.baseCommit || j.payload.threads.some(t=>resolveAnchor(t.anchor,this.model)!=='exact'))) throw new Conflict('stale job base');
    if(request.action==='claim'){
      if(!(j.status==='queued'||j.status==='running'&&j.leaseUntil<=now))throw new Conflict('claim conflict');
      j.status='running';j.fencingToken++;j.leaseOwner=request.runner;j.leaseUntil=now+30000;
    }else if(request.action==='cancel'){
      if(!['queued','running','draft_ready'].includes(j.status))throw new Conflict('cancel conflict');j.status='cancelled';if(j.artifact)j.artifact.accepted=false;
    }else if(request.action==='submit'){
      if(j.status!=='running'||j.leaseUntil<=now||j.leaseOwner!==request.runner||j.fencingToken!==request.fencingToken)throw new Conflict('stale runner');
      j.status='draft_ready';j.artifact={accepted:true,kind:'mock-only',publication:'not_requested'};
    }else throw new Conflict('unknown transition');
    j.revision++;s.events.push({action:request.action,id:j.id,revision:j.revision});return j;
  });}
}
export class Composer {
  constructor(store,model=fixture){this.store=store;this.model=model;this.pending=new Map();}
  stage(anchor,body,key=globalThis.crypto.randomUUID()){
    const request={pageId:this.model.pageId,version:this.model.version,anchor:copy(anchor),body};
    const prior=this.pending.get(key);if(prior){if(JSON.stringify(prior.request)!==JSON.stringify(request))throw new Conflict('pending key conflict');return prior;}
    const entry={key,request,status:'saving'};this.pending.set(key,entry);return entry;
  }
  async persist(key,transport){const entry=this.pending.get(key);if(!entry)throw new Conflict('保存対象がありません');if(entry.inflight)return entry.inflight;if(entry.status==='checking')throw new Conflict('結果照合してから再送してください');
    entry.status='saving';entry.inflight=(async()=>{try{const result=await transport(entry.request,key);entry.status='saved';entry.result=result;}catch(error){entry.status=error instanceof Conflict?'failed':'checking';entry.error=error.message;}finally{delete entry.inflight;}return entry;})();return entry.inflight;
  }
  reconcile(key){const entry=this.pending.get(key);const result=this.store.lookup(key);if(result){entry.result=result;entry.status='saved';}else entry.status='failed';return entry;}
}
