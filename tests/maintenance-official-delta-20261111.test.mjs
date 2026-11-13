import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const d=JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json'));
const h=readFileSync('public/php-emergency-maintenance.html','utf8');
const get=id=>d.confirmed.find(x=>x.id===id);
const batch=d.dailyOfficialFollowup20261111;
const previous=id=>batch.previousRecords.find(x=>x.id===id);
const previous12=id=>d.dailyOfficialFollowup20261112.previousRecords.find(x=>x.id===id);
const previous13=id=>d.dailyOfficialFollowup20261113.previousRecords.find(x=>x.id===id);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('November 11 collection-record followup preserves all prior cards, pending groups and discovery rows',()=>{
 assert.equal(d.checkedAt,'2026-11-13T00:27:00Z');
 assert.equal(d.confirmed.length,643);assert.equal(d.confirmed.filter(x=>x.restored).length,135);
 assert.equal(d.pending.length,2044);assert.equal(d.discovery.length,2887);
 assert.equal(batch.batchId,'official-followups-20261111-0927');
 assert.equal(batch.newIds.length,1);assert.equal(batch.updatedIds.length,3);
 assert.equal(batch.previousRecords.length,3);
 assert.equal(batch.unresolvedOriginalCandidatesRetained,true);
 // Reconstructing the pre-batch 631 cards from previousRecords must reproduce the prior array exactly.
 const original=d.confirmed.slice(0,631).map(x=>previous(x.id)??previous12(x.id)??previous13(x.id)??x);
 assert.equal(hash(original),'44a12c37c6f8997afef640d847b07fabc5b5eb4ccfe451613125929beb5ae99e');
 assert.equal(hash(d.pending),'53bfafc6af96a8f5bd1205e0c821c6899d21089eb2f1b64b3cbf01a60090a2cd');
 assert.equal(hash(d.discovery),'e0678961bd0fd9d16f71f510ae6f65e45b5b1f9f7624b32780ca3406e9f80632');
 // The new card is appended in batch order and the HTML article order follows confirmed order.
 assert.deepEqual(d.confirmed.slice(631,632).map(x=>x.id),batch.newIds);
 assert.deepEqual([...h.matchAll(/<article class="service" id="([^"]+)"/g)].map(x=>x[1]),d.confirmed.map(x=>x.id));
 assert.match(h,/新規1カードと既存3カードの更新で、632告知カード・対象範囲の復旧報告133件・照合待ち2044群・収集2887行/);
 assert.match(h,/<p id="count" aria-live="polite">643件の告知対象カード/);
 const cb=d.collectionBatches.find(x=>x.id===batch.batchId);
 assert.equal(cb.rowCount,4);assert.equal(cb.members.length,4);
 for(const id of [...batch.newIds,...batch.updatedIds]) assert.ok(cb.members.some(m=>m.confirmedId===id),id);
});
test('Kokopelli Big Advance and BA Portal resumption closes the second suspension',()=>{
 const b=get('big-advance');
 assert.equal(b.restored,true);assert.equal(b.noticeState,'restored');
 assert.equal(b.url,'https://www.kokopelli-inc.com/all/7138/');
 assert.match(b.status,/2026-11-10 18:25頃/);
 assert.match(b.end,/第2次の停止は解消/);
 assert.match(b.safe,/不正アクセス・情報漏えいの確認はない/);
 assert.match(previous(b.id).status,/2度目の一時停止中（2026-11-07 17:00から）/);
 assert.equal(previous(b.id).checkedAt,'2026-11-10T09:27:00Z');
});
test('Meijiza online ticket full resumption keeps the leak investigation open and extends the fan club presale',()=>{
 const m=get('meijiza-online-ticket-20261109');
 assert.equal(m.restored,true);assert.equal(m.noticeState,'restored');
 assert.equal(m.url,'https://www.meijiza.co.jp/news/2026_1109_02/');
 assert.ok(m.sources.includes('https://www.meijiza.co.jp/news/2026_1109/'));
 assert.match(m.end,/2026-11-12 23:59まで延長/);
 assert.match(m.safe,/漏えいの有無については、再開告知でも言及がなく/);
 assert.equal(previous(m.id).restored,false);
 assert.match(previous(m.id).status,/予約・照会等を一時停止/);
});
test('Sapporo city transport stays stopped with the mayor apology followup kept as reporting',()=>{
 const s=get('sapporo-city-transport-20261109');
 assert.equal(s.restored,false);assert.equal(s.noticeState,'announced');
 assert.match(s.status,/停止継続/);
 assert.match(s.status,/運行自体は通常通り/);
 assert.match(s.end,/秋元市長が陳謝/);
 assert.ok(s.sources.includes('https://news.web.nhk/newsweb/na/nd-20261110de73762'));
 assert.match(previous(s.id).status,/停止中。運行自体は通常通り（2026-11-09 17時時点）/);
});
test('GMO Aozora bank API suspension and resumption is a restored card with both official notices',()=>{
 const g=get('gmo-aozora-bank-api-20261110');
 assert.equal(g.restored,true);assert.equal(g.noticeState,'restored');
 assert.equal(g.url,'https://www.raksulbank.co.jp/%e3%80%90%e9%87%8d%e8%a6%81%e3%80%91gmo%e3%81%82%e3%81%8a%e3%81%9e%e3%82%89%e3%83%8d%e3%83%83%e3%83%88%e9%8a%80%e8%a1%8capi%e6%8e%a5%e7%b6%9a%e3%81%ae%e4%b8%80%e6%99%82%e5%81%9c%e6%ad%a2%e3%81%ab/');
 assert.ok(g.sources.includes('https://gmo-aozora.com/news/2026/20261110-01.html'));
 assert.match(g.status,/2026-11-10 20:42から一時停止し同日22:30に再開/);
 assert.match(g.status,/2026-11-11 01:02に再度一時停止し同日06:25に再開/);
 assert.match(g.safe,/個人情報の漏えいや不正な資金流出等は発生していない/);
 assert.match(g.scope,/ラクスルバンクでも取引が一時停止し/);
});
