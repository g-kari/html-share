import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/data/emergency-maintenance-20261021.json',import.meta.url)));
const html=readFileSync(new URL('../public/php-emergency-maintenance.html',import.meta.url),'utf8');
test('official cards and source rows stay consistent with the displayed tracker',()=>{
 assert.ok(data.confirmed.length>=557);assert.ok(data.discovery.length>=2832);
 assert.deepEqual([...html.matchAll(/<article class="service" id="([^"]+)"/g)].map(m=>m[1]),data.confirmed.map(c=>c.id));
 for (const id of ['muumuu-new-signups-20261024','kawamura-home56-streaming-extension']) {
  const card=data.confirmed.find(c=>c.id===id);
  assert.ok(data.discovery.some(row=>JSON.stringify(row).includes(card.url)));
 }
});
test('TEAM26 separates partial reopening, planned continuation and closed auto procedures',()=>{
 const t=data.confirmed.find(c=>c.id==='team26');assert.equal(t.restored,false);
 assert.match(t.end,/13:00/);assert.match(t.end,/19:00.*予定/);assert.match(t.safe,/受付終了/);
 assert.ok(t.history.some(h=>h.end==='未定'));
});
test('two actor-owned notices retain limited scope and do not increase restoration count',()=>{
 for(const id of ['muumuu-new-signups-20261024','kawamura-home56-streaming-extension']){const c=data.confirmed.find(c=>c.id===id);assert.equal(c.restored,false);assert.equal(c.sourceRead,'body_retrieved');assert.ok(c.ownershipEvidence.length);}
 const m=data.confirmed.find(c=>c.id==='muumuu-new-signups-20261024');assert.match(m.safe,/契約中/);assert.match(m.reason,/PHP名未記載/);
 const k=data.confirmed.find(c=>c.id==='kawamura-home56-streaming-extension');assert.match(k.end,/10\/25 23:59/);assert.match(k.end,/21:00/);assert.match(k.scope,/全配信.*ありません/);
});
