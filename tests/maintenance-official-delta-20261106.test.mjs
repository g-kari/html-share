import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const d=JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json'));
const h=readFileSync('public/php-emergency-maintenance.html','utf8');
const s=readFileSync('public/php-security-os-response.html','utf8');
const get=id=>d.confirmed.find(x=>x.id===id);
const previous=id=>d.dailyOfficialFollowup20261106.previousRecords.find(x=>x.id===id);
const previous10=id=>d.dailyOfficialFollowup20261110.previousRecords.find(x=>x.id===id);
test('November 6 followup preserves all prior cards, pending groups and discovery prefix',()=>{
 assert.equal(d.confirmed.length,639);assert.equal(d.confirmed.filter(x=>x.restored).length,135);
 assert.equal(d.pending.length,2044);assert.equal(d.discovery.length,2887);
 assert.equal(d.dailyOfficialFollowup20261106.newIds.length,12);
 assert.equal(d.dailyOfficialFollowup20261106.previousRecords.length,2);
 const original=d.confirmed.slice(0,587).map(x=>previous(x.id)??previous10(x.id)??x);
 assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'4cc86a8a0fe63b61642dbf86962142bec868deef7171388633856839694110c5');
 assert.deepEqual([...h.matchAll(/<article class="service" id="([^"]+)"/g)].map(x=>x[1]),d.confirmed.map(x=>x.id));
 assert.match(h,/599告知カード・対象範囲の復旧報告122件・照合待ち2044群・収集2887行/);
});
test('LoGo and e-Tax current restoration retains earlier uncertain evidence',()=>{
 const l=get('logoform-database-outage-20261103');assert.equal(l.restored,true);assert.equal(l.reasonKey,'other');
 assert.match(l.end,/17:00.*LGWAN.*18:00/);assert.match(l.safe,/再申請/);
 assert.equal(previous(l.id).restored,false);assert.match(previous(l.id).end,/見込み/);
 const e=get('etax-emergency-maintenance-20261104');assert.equal(e.restored,true);assert.equal(e.reasonKey,'security');
 assert.match(e.end,/実再開時計は未記載/);assert.match(e.reason,/PHP原因は未記載/);
 assert.equal(previous(e.id).reasonKey,'other');assert.equal(previous(e.id).restored,false);
});
test('JARTIS, aucfan, CPI and repeated Transfer Center maintenance remain scoped',()=>{
 const j=get('jartis-partial-resumed-20261105');assert.equal(j.restored,false);assert.match(j.safe,/etudes.*調整中/);
 const a=get('aucfan-partial-and-compensation-20261105');assert.equal(a.restored,false);assert.match(a.end,/11\/6.*予定.*未決定/);assert.match(a.safe,/補填.*協議中/);
 const c=get('cpi-db-admin-resumed-20261105');assert.equal(c.restored,false);assert.match(c.scope,/DB自体.*停止対象外/);
 const w=get('whitepoint-transfer-maintenance-20261105');assert.equal(w.restored,false);assert.match(w.end,/14:20.*23:00.*実終了未確認/);
});
test('new end-user impacts preserve conditional alternatives and announced limits',()=>{
 assert.equal(d.nonStreamImpacts.length,14);assert.equal(d.nonStreamImpacts.filter(x=>x.status==='pending').length,4);
 const j=d.nonStreamImpacts.find(x=>x.number===13);assert.match(j.summary,/会員.*後日.*非会員/);assert.match(j.period,/11\/10以降/);
 const n=d.nonStreamImpacts.find(x=>x.number===12);assert.match(n.alternative,/FAX不可.*電話/);
 const k=d.nonStreamImpacts.find(x=>x.number===11);assert.match(k.period,/変更後締切.*未定/);
});
test('php-image rebuilds do not inherit old anonymous/runtime or official system-layout claims',()=>{
 assert.match(s,/id="php-image-rebuild-20261106"/);
 for(const tag of ['al2-7.4','al2-8.0','al2-8.1','al2-8.2','fpm-7.4','fpm-8.0','fpm-8.1'])assert.ok(s.includes(tag+'-e3c1f9791b97'));
 assert.match(s,/全CPU・全variant/);assert.match(s,/匿名pull、実行結果は今回未確認/);
 assert.match(s,/標準配置.*al2-official-\*.*更新ではありません/);
});
