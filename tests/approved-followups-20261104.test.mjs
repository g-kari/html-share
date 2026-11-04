import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const maintenance = JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json', 'utf8'));
const maintenanceHTML = readFileSync('public/php-emergency-maintenance.html', 'utf8');
const incidentHTML = readFileSync('public/security-incidents.html', 'utf8');
const incident = JSON.parse(incidentHTML.match(/<script id="incident-register" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const m = id => maintenance.confirmed.find(item => item.id === id);
const i = id => incident.incidents.find(item => item.id === id);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('four approved maintenance notices retain all old records and resolve only their two matching pending URLs', () => {
  assert.equal(maintenance.confirmed.length, 580);
  assert.equal(maintenance.confirmed.filter(item => item.restored).length, 114);
  assert.equal(maintenance.pending.length, 2044);
  assert.equal(maintenance.discovery.length, 2859);
  const batch = maintenance.collectionBatches.find(item => item.id === 'official-monitor-20261104-six-approved');
  assert.equal(batch.rowCount, 4);
  const resolved = maintenance.pendingResolutionHistory.filter(item => item.resolvedBatch === batch.id);
  assert.equal(resolved.length, 2);
  assert.deepEqual(resolved.map(item => item.originalPendingIndex).sort((a,b) => a-b), [2044,2045]);
  for (const item of resolved) assert.equal(maintenance.pending.some(row => row.url === item.originalPendingGroup.url), false);
  assert.equal(hash(maintenance.confirmed.slice(0, 576)), 'ec409102ada836a1277d2ab83140d27374b3de0d6c82079beb483f34dd00f482');
  assert.equal(hash(maintenance.discovery.slice(0, 2855)), '304c32a90e0e7790c92826b6471cb03f3b9c96f0b45e1b73fa09d2ee6d720e48');
  assert.match(maintenanceHTML, /今回の限定照合：2026\/11\/04 21:42 JST。/);
});

test('cancellation, entry reopening and scope-limited restoration do not become blanket service recovery', () => {
  const nara = m('nara-nice-maintenance-cancelled-20261031');
  assert.equal(nara.restored, false); assert.equal(nara.actualStopped, false);
  assert.equal(nara.noticeState, 'cancelled');
  const tokyo = m('tokyo-customer-harassment-entry-period-20261029');
  assert.equal(tokyo.restored, false); assert.equal(tokyo.reasonKey, 'security');
  assert.match(tokyo.status, /11\/4.*受付開始/); assert.match(tokyo.end, /11\/18 17時/);
  assert.match(tokyo.safe, /先着順ではなく/);
  const sompo = m('sompo-institute-plus-website-reopened-20261030');
  assert.equal(sompo.restored, true); assert.match(sompo.scope, /グループ全体.*ではない/);
  const phone = m('phone-appli-php-partial-restoration-20261030');
  assert.equal(phone.restored, false); assert.equal(phone.noticeState, 'partial');
  assert.match(phone.status, /k1\/k2.*停止継続/); assert.match(phone.safe, /11\/2.*別障害/);
});

test('two incident publication series retain prior cases and separate confirmed leakage groups from historical possibilities', () => {
  assert.equal(incident.incidents.length, 198);
  assert.equal(hash(incident.incidents.slice(2)), '92f4cf554d99e9797a28c84aa009931944c2c774499746b240f90f063dee1ea3');
  assert.equal(hash(incident.changes.slice(0, -1)), 'fab2a7f1af653aeb2e858f7088f978da926dfcd59ca19f40abac027a3848ad55');
  const saison = i('saison-smart-realestate-member-platform-20261029');
  assert.match(saison.count, /1,889名.*39名.*1,850名/);
  assert.match(saison.relevance, /同一性は確認できておらず/);
  const ntt = i('nttdata-st-direct-vendor-digital-bonds-20261031');
  assert.equal(ntt.updated, '2026-11-02');
  assert.match(ntt.impact_status, /漏えいを確認.*継続調査/);
  assert.match(ntt.cause, /Securitize Japan.*認証機能/);
  assert.match(ntt.count, /111名.*2,678名.*合算せず/);
  assert.match(ntt.impact, /開始前の個別サービス/);
  assert.match(ntt.response, /停止継続.*再開日は未定/);
  assert.ok(ntt.sources.some(source => source.url === 'https://www.nttdata.com/global/ja/news/release/2026/110200/'));
  for (const item of [saison, ntt]) {
    assert.equal(item.checked_at, '2026-11-04');
    assert.deepEqual(item.cause_types, ['external_attack']);
    assert.ok(incidentHTML.includes(`id="${item.id}"`));
  }
});
