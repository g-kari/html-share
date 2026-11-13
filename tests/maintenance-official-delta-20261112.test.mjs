import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const d = JSON.parse(readFileSync(new URL('../public/data/emergency-maintenance-20261021.json', import.meta.url), 'utf8'));
const h = readFileSync(new URL('../public/php-emergency-maintenance.html', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const get = id => d.confirmed.find(x => x.id === id);
const NEW_IDS = ['tokyo-disney-resort-shopping-20261111', 'furusato-choice-trustbank-20261019', 'sharp-cocoro-energy-20261111', 'vpoint-mall-20261021'];
const UPDATED_IDS = ['docomo-5gsa-outage-20261111', 'librarie-trcdl-maintenance-20261110', 'allnet-aime', 'teket', 'twitcasting'];

test('2026-11-11 evening and 2026-11-12 morning followups add four notices and close two incidents', () => {
  assert.equal(d.checkedAt, '2026-11-13T00:27:00Z');
  assert.equal(d.confirmed.length, 643);
  assert.equal(d.confirmed.filter(x => x.restored).length, 135);
  assert.equal(d.pending.length, 2044);
  assert.equal(d.discovery.length, 2887);

  const batch = d.dailyOfficialFollowup20261112;
  assert.equal(batch.batchId, 'official-followups-20261112-0927');
  assert.equal(batch.checkedAt, '2026-11-12T00:27:00Z');
  assert.deepEqual(batch.newIds, NEW_IDS);
  assert.deepEqual(batch.updatedIds, UPDATED_IDS);
  assert.equal(batch.previousRecords.length, 5);
  assert.equal(batch.unresolvedOriginalCandidatesRetained, true);

  // The five pre-update records are preserved verbatim and rebuild the prior 635-card state.
  const previous = id => batch.previousRecords.find(x => x.id === id);
  const previous13 = id => d.dailyOfficialFollowup20261113.previousRecords.find(x => x.id === id);
  assert.match(previous('docomo-5gsa-outage-20261111').status, /第五報でも継続中/);
  assert.equal(previous('docomo-5gsa-outage-20261111').restored, false);
  assert.equal(previous('librarie-trcdl-maintenance-20261110').restored, false);
  assert.equal(previous('librarie-trcdl-maintenance-20261110').noticeState, 'planned');
  assert.match(previous('allnet-aime').end, /次回報告は11\/12 09:00頃予定/);
  assert.match(previous('teket').status, /再開時期は精査中/);
  assert.equal(hash(d.confirmed.slice(0, 635).map(x => previous(x.id) ?? previous13(x.id) ?? x)),
    '257591fde49508a8ad7f4178c995523f39e9f6f38032846e695e906298cb32cf');

  // New cards are appended in collection order with complete sourced fields.
  assert.deepEqual(d.confirmed.slice(635, 639).map(x => x.id), NEW_IDS);
  for (const card of d.confirmed.slice(635, 639)) {
    assert.equal(card.checkedAt, '2026-11-12T00:27:00Z');
    assert.equal(card.restored, false);
    assert.match(card.url, /^https:\/\//);
    assert.ok(card.name && card.status && card.scope && card.safe && card.source && card.date);
  }
  const disney = get('tokyo-disney-resort-shopping-20261111');
  assert.match(disney.start, /2026-11-11 14:30/);
  assert.match(disney.source, /アプリ内掲出/);
  const furusato = get('furusato-choice-trustbank-20261019');
  assert.equal(furusato.reasonKey, 'security');
  assert.match(furusato.reason, /4,454,097件/);
  assert.match(furusato.status, /アプリ版は2026-11-09 15:00に再開/);
  assert.match(furusato.end, /チョイスPay/);
  const sharp = get('sharp-cocoro-energy-20261111');
  assert.equal(sharp.reasonKey, 'security');
  assert.match(sharp.source, /同一文面の発表は本収集時点で未確認/);
  const vpoint = get('vpoint-mall-20261021');
  assert.match(vpoint.start, /2026-10-21/);
  assert.match(vpoint.reason, /原因は未確定として扱う|不正アクセスや情報漏えいが原因とは判断できない/);
  assert.match(vpoint.safe, /順次付与/);

  // The docomo outage closes: eighth report and recovery report folded into one update.
  const docomo = get('docomo-5gsa-outage-20261111');
  assert.equal(docomo.restored, true);
  assert.equal(docomo.noticeState, 'restored');
  assert.equal(docomo.reasonKey, 'other');
  assert.match(docomo.status, /19:17に完全復旧/);
  assert.match(docomo.end, /8時間43分/);
  assert.match(docomo.reason, /交換機の輻輳/);
  assert.match(docomo.safe, /2026-11-05〜11-06の5G SA障害（既報）とは別事象/);
  assert.equal(d.confirmed.filter(x => x.id === 'docomo-5gsa-outage-20261111').length, 1);

  // LibrariE maintenance completed on schedule per the using library's notice.
  const librarie = get('librarie-trcdl-maintenance-20261110');
  assert.equal(librarie.restored, true);
  assert.equal(librarie.noticeState, 'restored');
  assert.match(librarie.status, /メンテナンスは完了/);
  assert.match(librarie.end, /2026-11-11 08:00に終了/);

  const allnet = get('allnet-aime');
  assert.match(allnet.status, /2026-11-12 09:00報告でも再開の目処は立っていない/);
  assert.match(allnet.end, /次回報告は2026-11-17 09:00頃予定/);
  const teket = get('teket');
  assert.match(teket.status, /再開は少なくとも2026-11-23以降の見込み/);
  assert.match(teket.safe, /新たな不正アクセスや被害の拡大は確認されておらず/);
  const twit = get('twitcasting');
  assert.equal(twit.restored, false);
  assert.match(twit.status, /すべてのライブ配信・視聴が2026-11-11夕方に再開/);
  assert.match(twit.end, /全面再開は2026-11-11予定どおり/);
  assert.match(twit.restorationNote, /PayPay・WebMoney決済は復旧対応中/);

  const row = d.collectionBatches.find(x => x.id === 'official-followups-20261112-0927');
  assert.equal(row.rowCount, 9);
  assert.equal(row.reviewedSourceCount, 9);
  assert.deepEqual(row.members.map(x => x.confirmedId), [...NEW_IDS, ...UPDATED_IDS]);
  assert.ok(row.members.every(x => x.verification === 'confirmed' && x.sourceUrl.startsWith('https://')));

  const ids = [...h.matchAll(/<article class="service" id="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(ids, d.confirmed.map(x => x.id));
  assert.match(h, /公式追跡（2026年11月12日 09:27 JST）<\/h2><p>2026年11月11日 18:27と11月12日 09:27の収集継続確認（公式発表および報道で確認）に基づく追随です。新規4カードと既存5カードの更新で、639告知カード・対象範囲の復旧報告135件・照合待ち2044群・収集2887行です。/);
  assert.match(h, /<p id="count" aria-live="polite">643件の告知対象カード/);
  assert.match(h, /今回の限定照合：2026\/11\/13 09:27 JST/);
});
