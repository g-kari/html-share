import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const d=JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json'));
const h=readFileSync('public/php-emergency-maintenance.html','utf8');
const get=id=>d.confirmed.find(x=>x.id===id);
const batch=d.dailyOfficialFollowup20261110;
const previous=id=>batch.previousRecords.find(x=>x.id===id);
const previous11=id=>d.dailyOfficialFollowup20261111.previousRecords.find(x=>x.id===id);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('November 10 collection-record followup preserves all prior cards, pending groups and discovery rows',()=>{
 assert.equal(d.checkedAt,'2026-11-11T00:27:00Z');
 assert.equal(d.confirmed.length,632);assert.equal(d.confirmed.filter(x=>x.restored).length,133);
 assert.equal(d.pending.length,2044);assert.equal(d.discovery.length,2887);
 assert.equal(batch.batchId,'official-followups-20261110-1827');
 assert.equal(batch.newIds.length,32);assert.equal(batch.updatedIds.length,5);
 assert.equal(batch.previousRecords.length,5);
 assert.equal(batch.unresolvedOriginalCandidatesRetained,true);
 // Reconstructing the pre-batch 599 cards from previousRecords must reproduce the prior array exactly.
 const original=d.confirmed.slice(0,599).map(x=>previous(x.id)??x);
 assert.equal(hash(original),'68a567ff0e2a3c3f1423288703e1e945be7c6e4730230ddb3d07f7968581df06');
 assert.equal(hash(d.pending),'53bfafc6af96a8f5bd1205e0c821c6899d21089eb2f1b64b3cbf01a60090a2cd');
 assert.equal(hash(d.discovery.slice(0,2859)),'c312eb327e56782668636492764e19232d413e24c058740c37ce858b2857320c');
 // New cards are appended in batch order and the HTML article order follows confirmed order.
 assert.deepEqual(d.confirmed.slice(599,631).map(x=>x.id),batch.newIds);
 assert.deepEqual([...h.matchAll(/<article class="service" id="([^"]+)"/g)].map(x=>x[1]),d.confirmed.map(x=>x.id));
 assert.match(h,/新規32カードと既存5カードの更新で、631告知カード・対象範囲の復旧報告130件・照合待ち2044群・収集2887行/);
 assert.match(h,/<p id="count" aria-live="polite">632件の告知対象カード/);
 const cb=d.collectionBatches.find(x=>x.id===batch.batchId);
 assert.equal(cb.rowCount,37);assert.equal(cb.members.length,37);
 for(const id of [...batch.newIds,...batch.updatedIds]) assert.ok(cb.members.some(m=>m.confirmedId===id),id);
});
test('docomo fourth report separates My docomo partial reopening from the still-stopped online shop',()=>{
 const c=get('docomo-online-maintenance-20261105');
 assert.equal(c.restored,false);
 assert.match(c.end,/My docomoは2026-11-09 15:00頃から一部手続きを除き再開/);
 assert.match(c.end,/オンラインショップは11\/9時点で停止継続/);
 assert.match(c.safe,/最大294,839件（個人204,157件・法人96,082件）/);
 assert.match(c.safe,/現時点で新たな情報流出は確認されていない/);
 assert.match(previous(c.id).end,/11\/5 18:30時点で復旧見込み未定/);
 assert.equal(previous(c.id).checkedAt,'2026-11-05T23:35:00Z');
});
test('ALL.Net, teket, Kokopelli and TwitCasting followups keep scope and uncertainty',()=>{
 const a=get('allnet-aime');
 assert.match(a.end,/次回報告は11\/12 09:00頃予定/);
 assert.match(a.status,/バンダイナムコ製品は試験稼働を再開。セガ製品は停止継続/);
 const t=get('teket');
 assert.match(t.safe,/全会員の氏名・メールアドレスの流出を確認/);
 assert.match(t.end,/再開時期は精査中/);
 const b=get('big-advance');
 assert.equal(b.url,'https://www.kokopelli-inc.com/all/7138/');
 assert.ok(b.sources.includes('https://www.kokopelli-inc.com/all/7045/'));
 assert.match(previous11(b.id).status,/2度目の一時停止中（2026-11-07 17:00から）/);
 assert.match(previous11(b.id).safe,/不正アクセス・情報漏えいの確認はない/);
 const w=get('twitcasting');
 assert.match(w.end,/全面再開は2026-11-11予定/);
 assert.match(w.safe,/販売済みチケットの50%補填/);
});
test('new restored cards are limited to the announced scope',()=>{
 for(const id of ['docomo-5gsa-outage-20261105','matsuya-official-app-20261028','shinkin-kyodo-system-20261106','paypay-shinkin-charge-maintenance-20261106','nintendo-store-maintenance-20261106','marujan-resumed-20261107','docomo-gokimura-outage-20261107','fibergate-resumed-20261109']){
  const c=get(id);assert.equal(c.restored,true,id);assert.equal(c.noticeState,'restored',id);
 }
 assert.match(get('shinkin-kyodo-system-20261106').safe,/病院内ATMの停止が2026-11-09まで残る局所残件/);
 assert.match(get('matsuya-official-app-20261028').scope,/約238万件/);
 assert.match(get('marujan-resumed-20261107').scope,/185万5578人分/);
});
test('new stopped and partial cards keep leakage as announced possibilities and plans as plans',()=>{
 const m=get('muji-netstore-20261030');
 assert.equal(m.restored,false);assert.match(m.status,/再開は延期され時期未定/);
 assert.match(m.scope,/最大約2,726万件/);assert.match(m.scope,/代引き受取先の氏名・郵便番号約44万件/);
 const e=get('edion-netshop-20261107');
 assert.equal(e.restored,false);assert.equal(e.noticeState,'partial');
 assert.match(e.scope,/カード情報が最大556回分、注文時エラーログのカード情報最大5件、ギフトカード5,360枚/);
 assert.match(e.start,/2026-11-07 22:00から緊急メンテナンスで全機能停止（2026-11-10に開始時刻を訂正）/);
 const t=get('tsukaeru-net-20261107');
 assert.equal(t.url,'https://www.tsukaeru.net/news/20261107/');
 assert.ok(t.sources.some(s=>s.url==='https://www.tsukaeru.net/news/20261109/'));
 const j=get('jairo-cloud-20261028');
 assert.equal(j.restored,false);assert.match(j.reason,/PHP脆弱性ではないと公式が明言/);
 const l=get('librarie-trcdl-maintenance-20261110');
 assert.equal(l.restored,false);assert.equal(l.noticeState,'planned');
 assert.match(l.end,/2026-11-11 08:00（予定）/);
 const p=get('plm-marines-leak-20261106');
 assert.match(p.scope,/13,711件/);assert.match(p.scope,/有料会員メール11,875件・ニックネーム37,070件/);
 const s=get('sapporo-city-transport-20261109');
 assert.match(s.status,/運行自体は通常通り/);
});
