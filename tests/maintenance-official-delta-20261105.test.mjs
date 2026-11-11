import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const data = JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json', 'utf8'));
const html = readFileSync('public/php-emergency-maintenance.html', 'utf8');
// Previous-state assertions remain tied to their saved November 5 evidence.
const get = id => data.dailyOfficialFollowup20261106.previousRecords.find(x => x.id === id) ?? data.confirmed.find(x => x.id === id);
const followup = data.dailyOfficialFollowup20261105;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('new official followups preserve all original records, unresolved sources, and discovery rows', () => {
  assert.equal(data.confirmed.length, 632);
  assert.equal(data.confirmed.filter(x => x.restored).length, 133);
  assert.equal(data.pending.length, 2044);
  assert.equal(data.discovery.length, 2887);
  assert.equal(followup.newIds.length, 7);
  assert.deepEqual(followup.updatedIds, ['infinicloud-partial', 'myroyal']);
  const originals = data.confirmed.slice(0, 580).map(x => followup.previousRecords.find(old => old.id === x.id) ?? data.dailyOfficialFollowup20261110.previousRecords.find(old => old.id === x.id) ?? x);
  assert.equal(hash(originals), '50e13733b24f5a4d6248aacb6aa49ada0e11b65a819b47e8311b595ff9ccfdf7');
  assert.equal(hash(data.pending), '53bfafc6af96a8f5bd1205e0c821c6899d21089eb2f1b64b3cbf01a60090a2cd');
  assert.equal(hash(data.discovery.slice(0, 2859)), 'c312eb327e56782668636492764e19232d413e24c058740c37ce858b2857320c');
  const batch = data.collectionBatches.find(x => x.id === followup.batchId);
  assert.equal(batch.rowCount, 11);
  assert.equal(batch.reviewedSourceCount, 12);
  assert.deepEqual([...html.matchAll(/<article class="service" id="([^"]+)"/g)].map(x => x[1]), data.confirmed.map(x => x.id));
  assert.match(html, /新たに7カードを追加。587告知カード/);
});

test('existing service updates preserve uncertainty, approximate clocks, and original stop notices', () => {
  const cloud = get('infinicloud-partial');
  assert.equal(cloud.restored, false);
  assert.match(cloud.end, /未定/);
  assert.match(cloud.scope, /新規/);
  assert.match(cloud.safe, /悪用.*運営の説明/);
  const royal = get('myroyal');
  assert.equal(royal.restored, true);
  assert.match(royal.end, /11\/4 9:00頃/);
  assert.match(royal.source, /公式検索/);
  assert.ok(royal.sources.some(x => x.url === 'https://www.royal-co.net/news/5113/'));
});

test('Canonet plans, testing and reported completions remain PHP-version and cohort specific', () => {
  const c = get('canonet-php-cohort-status-20261104');
  assert.equal(c.restored, false);
  assert.equal(c.noticeState, 'partial');
  for (const text of ['W1 PHP5.2', '11/5', 'W3 PHP7.4/8.1/8.2', '11/4 14:00', 'W4 PHP8.2', '11/6']) assert.ok(c.end.includes(text));
  for (const text of ['W2 PHP5.6', '11/3', 'W3 PHP8.0', 'W4 PHP8.3', '10/24', 'W1 PHP4.4', 'W2 PHP7.0/7.3']) assert.ok(c.scope.includes(text));
  assert.match(c.safe, /W1 PHP4.4は停止継続/);
  assert.match(c.safe, /一般サポート再開/);
  assert.ok(c.sources.some(x => x.url.includes('/502?')));
  assert.ok(c.sources.some(x => x.url.includes('/505?')));
});

test('non-PHP emergency completions distinguish publication and actual reported completion dates', () => {
  const lms = get('gakunin-lms-emergency-20261104');
  assert.equal(lms.restored, true); assert.equal(lms.reasonKey, 'other');
  assert.match(lms.end, /11\/4 17:30 JST/);
  assert.match(lms.scope, /情報セキュリティ講座は利用可能/);
  const seiko = get('grand-seiko-ewarranty-restored-20261027');
  assert.equal(seiko.restored, true); assert.equal(seiko.reasonKey, 'other');
  assert.match(seiko.end, /10\/27.*復旧.*11\/4.*掲載日/);
});

test('LoGo reapplication and Hino alternatives are not mixed with October PHP maintenance', () => {
  const c = get('logoform-database-outage-20261103');
  assert.equal(c.restored, false); assert.equal(c.reasonKey, 'other');
  assert.match(c.end, /11\/5 06:00.*16:00以降.*見込み/);
  assert.match(c.safe, /再申請が必要/); assert.match(c.safe, /完了画面.*正常保存/);
  assert.match(c.safe, /通常開館.*窓口・電話/);
  assert.match(c.safe, /10月のPHP対応.*別/);
});

test('Hyogo snapshots, MFJ inconsistent planned clocks and e-Tax unstated cause stay bounded', () => {
  const hyogo = get('hyogo-php-stopped-sites-20261104');
  assert.equal(hyogo.restored, false);
  assert.match(hyogo.date, /16時時点/);
  assert.match(hyogo.safe, /省略だけで復旧を判断せず/);
  assert.ok(data.relationships.some(x => x.childId === hyogo.id));
  const mfj = get('mfj-emergency-maintenance-20261105');
  assert.equal(mfj.noticeState, 'planned'); assert.equal(mfj.restored, false);
  assert.match(mfj.end, /題名は04:00、本文は4:30/);
  const etax = get('etax-emergency-maintenance-20261104');
  assert.equal(etax.reasonKey, 'other'); assert.equal(etax.restored, false);
  assert.match(etax.reason, /理由未記載/);
  assert.match(etax.safe, /不審通信・侵害・漏えい・PHP原因の記載はありません/);
});
