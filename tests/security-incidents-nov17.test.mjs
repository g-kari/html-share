import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {decodeHTML} from 'entities';
const html=await readFile(new URL('../public/security-incidents.html',import.meta.url),'utf8');
const register=JSON.parse(html.match(/<script id="incident-register" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const byId=new Map(register.incidents.map(r=>[r.id,r]));
const text=id=>JSON.stringify(byId.get(id));
test('November 17 change summary identifies each unique added and updated record',()=>{
 const change=register.changes.find(c=>c.kind==='official_november_17_updates');
 assert.ok(change);assert.equal(change.date,'2026-11-17');
 assert.equal(new Set(change.incident_ids).size,change.incident_ids.length);
 assert.deepEqual(new Set(change.incident_ids),new Set([...change.added_ids,...change.updated_ids]));
 assert.equal(change.added_ids.filter(id=>change.updated_ids.includes(id)).length,0);
 for(const id of change.incident_ids){const r=byId.get(id);assert.ok(r);assert.equal(r.last_content_change,id==='openlogi-shipping-20261108'?'2026-11-27':'2026-11-17');assert.ok(r.sources.every(s=>s.type==='official'));}
 assert.equal(register.changes.length,119);
});
test('rendered derived totals agree with the register, including overlapping causes',()=>{
 const multiple=register.incidents.filter(i=>i.cause_types.length>1).length;
 assert.ok(html.includes(`全${register.incidents.length}件のうち複合要因${multiple}件`));
 assert.ok(html.includes(`複合要因（${multiple}件）`));
 assert.doesNotMatch(html,/現在の掲載事案は2件/);
 for(const c of register.cause_taxonomy.categories){
  const rendered=html.match(new RegExp(`<div class="cause-stat ${c.id}">[\\s\\S]*?<strong>(\\d+)<small>`));
  assert.equal(Number(rendered[1]),register.cause_taxonomy.counts[c.id]);
 }
 for(const m of new Set(register.incidents.filter(i=>i.scope==='2026').map(i=>i.catalog_month))){
  const n=register.incidents.filter(i=>i.scope==='2026'&&i.catalog_month===m).length;
  assert.match(html,new RegExp(`data-month-shortcut="${m}">\\d+月 <span>${n}</span>`));
 }
});
test('provider totals and downstream figures are not added together',()=>{
 const y=byId.get('ymir-cuenote-fc-20261016');assert.match(y.count,/47,864,147件.*51,628,280件.*実人数ではない/);
 assert.match(y.count,/BASE.*190件.*別区分/);
 const a=byId.get('arara-message-20261027');assert.match(text(a.id),/85,565/);assert.match(text(a.id),/2,537/);
 assert.match(a.response,/11月16日13:03.*再開/);
 assert.match(a.response,/アララを利用せず自社管理クラウド/);
 const open=byId.get('openlogi-shipping-20261108');assert.match(text(open.id),/3,358/);assert.doesNotMatch(text(open.id),/アカツキ商事/);
 assert.match(open.impact,/株式会社アカツキ.*Slash Gift/);
});
test('restoration announcements retain completed versus planned scope',()=>{
 const s=byId.get('sagawa-tracking-20260930');assert.match(s.response,/11月16日.*3機能.*再開.*完了時刻.*明記はなく/);
 assert.match(s.response,/4機能.*未定/);
 const b=byId.get('rakus-blastmail-20261020');assert.match(b.response,/基本機能.*再開.*11月16日.*案内.*移行の完了・全機能復旧とはしない/);
 const t=byId.get('teket-ticket-platform-20261108');assert.match(t.response,/11月23日/);assert.match(t.response,/11月17日/);
 const muji=byId.get('ryohin-muji-app-store-20261030');assert.match(muji.response,/再開を延期/);assert.match(muji.count,/75万件.*52万件.*27万件.*44万件.*合算しない/);
});
test('new financial portal and permissions cases preserve separate scope and confirmed access',()=>{
 const lottery=byId.get('takarakuji-account-login-202611');assert.match(lottery.count,/4,436名.*4,133名.*内数/);assert.match(text(lottery.id),/DB|データベース/);
 const axa=byId.get('axa-myaxa-20261109');assert.match(axa.count,/597,000件.*実人数にはしない.*PCS.*加算しない/);assert.match(axa.impact_status,/可能性/);
 const m=byId.get('manulife-manulink-permissions-20261025');assert.deepEqual(m.cause_types,['operational_error']);assert.match(m.count,/5,925.*146/);assert.match(m.cause,/権限.*設定/);
 const ts=byId.get('teamspirit-development-cloud-20261027');assert.match(ts.response,/11月16日.*不適切.*訂正.*見解.*維持.*判断.*PPC.*判断・見解を示していない/);
});
test('Studio supplemental customer scope and earlier source-date notes remain visible',()=>{
 const r=byId.get('studio-cloud-20260930');assert.ok(r.downstream_scope);
 const card=html.match(/<article class="card" id="studio-cloud-20260930"[\s\S]*?<\/article>/)[0];
 assert.match(card,/class="fact-details downstream-scope"/);assert.match(card,/FGN/);assert.match(card,/13時00分/);
 assert.match(text(r.id),/6,693/);
});
test('overseas updates separate provider containment, customer actions and preliminary scope',()=>{
 const fire=byId.get('fireworks-ai-credentials-20261006');assert.match(fire.count,/1%未満.*人数ではない/);assert.match(fire.count,/0.01%未満.*5,000人.*別の母集団/);
 const chain=byId.get('chainalysis-internal-tools-202610');assert.match(chain.response,/11月10日03:00 EST.*Data Solutions.*復帰.*全顧客の再接続完了までは示していない/);
 const apify=byId.get('apify-internal-credentials-20261109');assert.equal(apify.updated,'2026-11-16');assert.match(apify.brief,/20日までの予定/);
 const cw=byId.get('connectwise-screenconnect-extensions-20261111');assert.equal(cw.updated,'2026-11-16');assert.match(cw.count,/400.*導入環境数.*侵害確認数ではない/);assert.match(cw.response,/26.6.5.*サーバーだけの更新では不十分/);
 assert.match(text(cw.id),/横展開.*未観測|成功.*未観測|成功.*観測していない|成功例.*確認していない/);
 const phala=byId.get('phala-inference-cvm-20261021');assert.deepEqual(phala.cause_types,['external_attack','operational_error']);
 const near=byId.get('nearai-sglang-20261108');assert.match(near.count,/100利用者.*18 agent.*2社.*合算しない/);
});
test('new November 16 cases separate credentials, information fields and maximum exposure',()=>{
 const r=byId.get('riken-fugaku-rikyu-20261110');assert.match(r.count,/4,597名.*4,222名.*375名.*流出確定数ではない/);assert.match(r.occurred,/11月10〜13日.*12日.*13日16:33/);assert.match(r.impact,/接続試行.*二次被害.*調査中/);
 const j=byId.get('atlas-jpgu-presenter-20261112');assert.match(j.count,/未公表.*JpGU利用分/);assert.match(j.impact_status,/可能性が高い/);
 const m=byId.get('meetsmore-requests-20261111');assert.match(m.count,/36万6,850件.*可能性.*201アカウント.*合算しない/);assert.match(m.impact,/この区分に含まれない.*不正ログインでは氏名・メール/);assert.match(m.relevance,/外部カレンダーの会議URL.*対象外/);
});
test('all changed card prose, timeline and source titles agree with the register',()=>{
 const change=register.changes.find(c=>c.kind==='official_november_17_updates');
 for(const id of change.incident_ids){
  const r=byId.get(id);const card=decodeHTML(html.match(new RegExp(`<article class="card" id="${id}"[\\s\\S]*?<\\/article>`))[0]);
  for(const k of ['name','brief','cause','count','impact','response','relevance']) assert.ok(card.includes(r[k]),`${id} ${k}`);
  for(const s of r.sources){assert.ok(card.includes(s.title),`${id} source title`);assert.ok(card.includes(s.url),`${id} source url`);}
  for(const event of r.timeline)assert.ok(card.includes(event.text),`${id} timeline`);
 }
});
