import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const d=JSON.parse(readFileSync(new URL('../public/data/emergency-maintenance-20261021.json',import.meta.url),'utf8'));
const h=readFileSync(new URL('../public/php-emergency-maintenance.html',import.meta.url),'utf8');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const batch=d.dailyOfficialFollowup20261111b;
const previous12=id=>d.dailyOfficialFollowup20261112.previousRecords.find(x=>x.id===id);
const previous13=id=>d.dailyOfficialFollowup20261113.previousRecords.find(x=>x.id===id);

test('November 11 15:27 collection-record followup adds three new cards without changing prior records',()=>{
 assert.equal(d.checkedAt,'2026-11-13T00:27:00Z');
 assert.equal(d.confirmed.length,643);assert.equal(d.confirmed.filter(x=>x.restored).length,135);
 assert.equal(d.pending.length,2044);assert.equal(d.discovery.length,2887);
 assert.equal(batch.batchId,'official-followups-20261111-1527');assert.equal(batch.checkedAt,'2026-11-11T06:27:00Z');
 assert.deepEqual(batch.newIds,['docomo-5gsa-outage-20261111','idemitsu-car-maintenance-20261110','ngt48-official-cd-shop-20261021']);
 assert.deepEqual(batch.updatedIds,[]);assert.deepEqual(batch.previousRecords,[]);
 assert.equal(batch.unresolvedOriginalCandidatesRetained,true);
 // Every card that existed before this batch is byte-identical, in the same order.
 assert.equal(hash(d.confirmed.slice(0,632).map(x=>previous12(x.id)??previous13(x.id)??x)),'d40c77cf4ec6e924d8b3f35c870f9619c8b7a3a0efc3d6a2313dd856905b8625');
 assert.equal(hash(d.pending),'53bfafc6af96a8f5bd1205e0c821c6899d21089eb2f1b64b3cbf01a60090a2cd');
 assert.equal(hash(d.discovery),'e0678961bd0fd9d16f71f510ae6f65e45b5b1f9f7624b32780ca3406e9f80632');
 assert.deepEqual(d.confirmed.slice(632,635).map(x=>x.id),batch.newIds);
 for(const card of d.confirmed.slice(632,635)){
  assert.equal(card.checkedAt,card.id==='docomo-5gsa-outage-20261111'?'2026-11-12T00:27:00Z':'2026-11-11T06:27:00Z');assert.equal(card.restored,card.id==='docomo-5gsa-outage-20261111');
  assert.ok(card.url.startsWith('https://'),`${card.id} needs an official URL`);
  assert.ok(card.name&&card.status&&card.scope&&card.safe,`${card.id} needs the full fact set`);
 }
 const docomo=d.confirmed.find(x=>x.id==='docomo-5gsa-outage-20261111');
 assert.ok(previous12(docomo.id).status.includes('第五報でも継続中'));assert.ok(docomo.scope.includes('5G SA'));
 const idemitsu=d.confirmed.find(x=>x.id==='idemitsu-car-maintenance-20261110');
 assert.equal(idemitsu.reasonKey,'security');assert.ok(idemitsu.status.includes('一時停止中'));
 const ngt=d.confirmed.find(x=>x.id==='ngt48-official-cd-shop-20261021');
 assert.ok(ngt.scope.includes('一括で取り消し'));assert.ok(ngt.end.includes('2026-11-11'));
 // The GMO Aozora second stop/resume cycle was already recorded by the 09:27 batch; it must not be duplicated here.
 const gmo=d.confirmed.find(x=>x.id==='gmo-aozora-bank-api-20261110');
 assert.ok(gmo.status.includes('2026-11-11 01:02に再度一時停止し同日06:25に再開'));
 assert.ok(!batch.newIds.includes(gmo.id)&&!batch.updatedIds.includes(gmo.id));
 const row=d.collectionBatches.find(x=>x.id==='official-followups-20261111-1527');
 assert.equal(row.checkedAt,'2026-11-11T06:27:00Z');assert.equal(row.rowCount,3);assert.equal(row.reviewedSourceCount,3);
 assert.deepEqual(row.members.map(x=>x.confirmedId),batch.newIds);
 assert.deepEqual([...h.matchAll(/<article class="service" id="([^"]+)"/g)].map(x=>x[1]),d.confirmed.map(x=>x.id));
 assert.match(h,/公式追跡（2026年11月11日 15:27 JST）<\/h2><p>2026年11月11日 12:27と15:27の収集継続確認（公式発表および報道で確認）に基づく追随です。新規3カードの追加で、635告知カード・対象範囲の復旧報告133件・照合待ち2044群・収集2887行です。/);
 assert.match(h,/<p id="count" aria-live="polite">643件の告知対象カード/);
 assert.match(h,/今回の限定照合：2026\/11\/13 09:27 JST/);
});
