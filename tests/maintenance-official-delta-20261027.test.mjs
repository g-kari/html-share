import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const data=JSON.parse(readFileSync(new URL('../public/data/emergency-maintenance-20261021.json',import.meta.url)));
const html=readFileSync(new URL('../public/php-emergency-maintenance.html',import.meta.url),'utf8');
// SHA256(JSON.stringify(parsed array)) from immutable PR34 head 01de0baa.
// No Git history is required: Actions uses a shallow checkout.
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const priorHashes={confirmed:'d4540107931cde655a2848deef1c11e182de869b573e2903567badbbd3945031',pending:'84eb1a88c2bbdcbd02c8b8899200a76507b692f67f6f6c662a4f152ca3eae49c',discovery:'aa17e17b9111f62bed66ddc9308cd29fa5fcf663df176bfc1447564979eb7fae'};
const get=id=>data.confirmed.find(c=>c.id===id);
test('six official followups preserve every prior confirmed card and source row',()=>{
 assert.equal(hash(data.confirmed.slice(0,557).map(c=>c.id==='softbank-emergency-alert-mail'?c.history.find(h=>h.id===c.id):c)),priorHashes.confirmed);
 assert.equal(data.confirmed.length,576);assert.equal(data.discovery.length,2855);assert.equal(data.pending.length,2046);
 for(const [key,count] of [['pending',2043],['discovery',2832]]) {
  const prior=data[key].slice(0,count).map(row=>{const current={...row};delete current.relatedOfficialEvidence;return current;});
  assert.equal(hash(prior),priorHashes[key]);
 }
 assert.deepEqual([...html.matchAll(/<article class="service" id="([^"]+)"/g)].map(m=>m[1]),data.confirmed.map(c=>c.id));
});
test('six notices keep clocks, causes and residual limitations separate',()=>{
 const s=get('suita-library-three-online-services');assert.match(s.name,/自習室/);assert.match(s.end,/現在/);assert.match(s.safe,/正確な実復旧時計ではありません/);
 const h=get('hanshin-exp-disabled-discount-online-application');assert.equal(h.restored,false);assert.equal(h.reasonKey,'unknown');assert.match(h.safe,/福祉担当窓口/);
 const hotel=get('hotel-h2-nagasaki-email-recovery');assert.equal(hotel.reasonKey,'unknown');assert.match(hotel.scope,/メール/);
 const f=get('dsj-fastcarbon-plus-reopening');assert.equal(f.restored,false);assert.match(f.end,/海外IP制限/);
 assert.match(get('beingcollaboration-recovery-20261027').end,/正午.*実績/);
 const c=get('carenet-com-php-maintenance-resume');assert.equal(c.restored,true);
 for(const key of ['pending','discovery']) {
  const row=data[key].find(x=>x.collectionBatch==='grok-public-candidates-20261022-2055'&&x.collectionPart===3&&x.collectionRow===97);
  assert.equal(row.sourceRead,'not_read_this_cycle');assert.equal(row.relatedOfficialEvidence[0].confirmedId,c.id);
 }
});

test('earlier confirmed backlog preserves scope, exceptions and SoftBank partial history',()=>{
 assert.match(get('lolipop-new-signup-migration-webdav-8246').end,/準備完了次第.*停止中一覧/);
 assert.match(get('naccs-digital-certificate-issuance-delay').scope,/申込は可能/);
 assert.match(get('eaprin-maintenance-resumed').end,/11:30/);
 assert.match(get('docomo-area-mail-disaster-resumed').end,/午後8:01/);
 assert.match(get('lixil-owners-club-resumed').safe,/自動期限延長・無条件保証承認とはしません/);
 assert.match(get('shibuya-digital-library-resumed').safe,/10\/31.*11月以降/);
 assert.equal(get('gunma-shakyo-training-maintenance').restored,false);
 assert.match(get('gunma-shakyo-training-maintenance').end,/約3週間.*確定復旧日は未公表/);
 const s=get('softbank-emergency-alert-mail');assert.equal(s.restored,true);assert.match(s.end,/午後11:17/);
 assert.ok(s.history.some(h=>/午前9:25/.test(h.end)));assert.ok(s.history.some(h=>h.restored===false));
});

test('earlier backlog dates distinguish publication from recorded evidence checks',()=>{
 assert.match(get('naccs-digital-certificate-issuance-delay').date,/2026\/10\/23公開/);
 assert.match(get('lixil-owners-club-resumed').date,/2026\/10\/26掲載/);
 assert.match(get('shibuya-digital-library-resumed').date,/2026\/10\/26掲載/);
 assert.match(get('gunma-shakyo-training-maintenance').date,/初掲載日時は未確認/);
 assert.equal(get('docomo-area-mail-disaster-resumed').checkedAt,'2026-10-26T01:41:00Z');
 assert.equal(get('eaprin-maintenance-resumed').checkedAt,'2026-10-25T23:29:00Z');
 for(const c of data.confirmed.filter(c=>c.evidenceRecordedAt)) assert.match(c.source,/本文の再取得.*ではありません/);
});
