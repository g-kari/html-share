import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const d = JSON.parse(readFileSync(new URL('../public/data/emergency-maintenance-20261021.json', import.meta.url), 'utf8'));
const h = readFileSync(new URL('../public/php-emergency-maintenance.html', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const get = id => d.confirmed.find(x => x.id === id);
const NEW_IDS = ['japanpost-line-posukuma-tonariwa-20261111', 'tradewaltz-20261110', 'netmile-sugutama-20261102', 'microsoft365-outage-20261113'];
const UPDATED_IDS = ['muji-netstore-20261030', 'takarakuji-official-20261105'];

test('2026-11-12 daytime/evening and 2026-11-13 morning followups add four notices and update two incidents', () => {
  assert.equal(d.checkedAt, '2026-11-13T00:27:00Z');
  assert.equal(d.confirmed.length, 643);
  assert.equal(d.confirmed.filter(x => x.restored).length, 135);
  assert.equal(d.pending.length, 2044);
  assert.equal(d.discovery.length, 2887);

  const batch = d.dailyOfficialFollowup20261113;
  assert.equal(batch.batchId, 'official-followups-20261113-0927');
  assert.equal(batch.checkedAt, '2026-11-13T00:27:00Z');
  assert.deepEqual(batch.newIds, NEW_IDS);
  assert.deepEqual(batch.updatedIds, UPDATED_IDS);
  assert.equal(batch.previousRecords.length, 2);
  assert.equal(batch.unresolvedOriginalCandidatesRetained, true);

  // The two pre-update records are preserved verbatim and rebuild the prior 639-card state.
  const previous = id => batch.previousRecords.find(x => x.id === id);
  assert.match(previous('muji-netstore-20261030').status, /第4報/);
  assert.doesNotMatch(previous('muji-netstore-20261030').status, /記者会見/);
  assert.match(previous('takarakuji-official-20261105').status, /復旧未定（2026-11-06発表）/);
  assert.equal(previous('takarakuji-official-20261105').tag, '停止継続・復旧未定');
  assert.equal(hash(d.confirmed.slice(0, 639).map(x => previous(x.id) ?? x)),
    '2852490e1dfc4374a3da3ed52f97dc2e6124bb7da3c64332248217bd9ce93a1a');

  // New cards are appended in collection order with complete sourced fields.
  assert.deepEqual(d.confirmed.slice(639).map(x => x.id), NEW_IDS);
  for (const card of d.confirmed.slice(639)) {
    assert.equal(card.checkedAt, '2026-11-13T00:27:00Z');
    assert.equal(card.restored, false);
    assert.match(card.url, /^https:\/\//);
    assert.ok(card.name && card.status && card.scope && card.safe && card.source && card.date);
  }
  const posukuma = get('japanpost-line-posukuma-tonariwa-20261111');
  assert.equal(posukuma.reasonKey, 'security');
  assert.match(posukuma.status, /2026-11-11 14:20頃から緊急メンテナンス/);
  assert.match(posukuma.scope, /TONARIWA/);
  assert.match(posukuma.safe, /公式Webサイトからの利用を案内/);
  const tradewaltz = get('tradewaltz-20261110');
  assert.equal(tradewaltz.reasonKey, 'security');
  assert.match(tradewaltz.status, /第9報（2026-11-12 17:00）/);
  assert.match(tradewaltz.status, /貿易書類130件のみと確定/);
  assert.equal(tradewaltz.url, 'https://www.tradewaltz.com/news/13816/');
  const netmile = get('netmile-sugutama-20261102');
  assert.equal(netmile.reasonKey, 'security');
  assert.match(netmile.reason, /最大約549万人/);
  assert.match(netmile.safe, /保有マイルは会社が保証/);
  const m365 = get('microsoft365-outage-20261113');
  assert.equal(m365.reasonKey, 'other');
  assert.match(m365.status, /世界規模の接続障害/);
  assert.match(m365.scope, /MO1550821/);
  assert.equal(m365.restored, false);

  // Muji: the 2026-11-12 press conference is folded in without closing the incident.
  const muji = get('muji-netstore-20261030');
  assert.equal(muji.restored, false);
  assert.match(muji.status, /記者会見で清水智社長が謝罪/);
  assert.match(muji.status, /再開のメドは立っていない/);
  assert.match(muji.safe, /パスワードの再設定を依頼/);
  assert.equal(muji.checkedAt, '2026-11-13T00:27:00Z');

  // Takarakuji: the 2026-11-11 announcement details what could have been viewed.
  // The reopening stays unconfirmed (secondary source only), so the card is not restored.
  const takarakuji = get('takarakuji-official-20261105');
  assert.equal(takarakuji.restored, false);
  assert.match(takarakuji.status, /リスト型攻撃による不正ログイン/);
  assert.match(takarakuji.scope, /当落の履歴/);
  assert.match(takarakuji.safe, /確定情報として扱いません/);
  assert.equal(takarakuji.checkedAt, '2026-11-13T00:27:00Z');

  const row = d.collectionBatches.find(x => x.id === 'official-followups-20261113-0927');
  assert.equal(row.rowCount, 6);
  assert.equal(row.reviewedSourceCount, 6);
  assert.deepEqual(row.members.map(x => x.confirmedId), [...NEW_IDS, ...UPDATED_IDS]);
  assert.ok(row.members.every(x => x.verification === 'confirmed' && x.sourceUrl.startsWith('https://')));

  const ids = [...h.matchAll(/<article class="service" id="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(ids, d.confirmed.map(x => x.id));
  assert.match(h, /公式追跡（2026年11月13日 09:27 JST）<\/h2><p>2026年11月12日 12:27・15:27・18:27と11月13日 09:27の収集継続確認（公式発表および報道で確認）に基づく追随です。新規4カードと既存2カードの更新で、643告知カード・対象範囲の復旧報告135件・照合待ち2044群・収集2887行です。/);
  assert.match(h, /<p id="count" aria-live="polite">643件の告知対象カード/);
  assert.match(h, /今回照合：2026\/11\/13 09:27 JST/);
});
