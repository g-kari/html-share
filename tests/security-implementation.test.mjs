import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeHTML } from 'entities';
import test from 'node:test';
const html = await readFile(new URL('../public/security-lessons.html', import.meta.url),'utf8');
const preserved = {
  "case-voising-bi-20260810": "f8843788183b549d4a03a84a2b7feedc581348633fbd567eae7550285999886e",
  "case-seicomart-app-20260924": "551c8b24e65fed4fd6f3aca37dc3cf0183e5cd367dfa704324703f5492659d17",
  "case-ntt-west-insider-20231017": "1949f2089daade15c55a1d472a6f2c35d3abe6065a56d00a85913a8b128a5bbb",
  "case-toppan-misdelivery-20260901": "50cff021859a013127c7e7f8f1fabdb94cb19818e3d024b82ab715b23a32cba6",
  "leadership": "ae0557e455280c7c01ee5c578a6b115a0baf49a68f266091cd2898a4d239ec5c",
  "architecture": "757b3a75f3c3f27ab6c2e96eff005a1f81d96553144321c265734e1ebeeb74fd",
  "operations": "22a45bcbd46f56ecfabcc99955ae2e2c65feeac5c2d2d1d95724d6d236ed4af7",
  "partners": "43a6121384fac501c69169e3ae2659335f20906bfc58a41f55e0d4c0cb981bed",
  "users": "f116931929389c4ff32842973491e61d1dbd9cf3e6044174e788a471188575f1",
  "society": "49b18f7ce6aeb7b7164e024ec28ce5e193976a6981c74b473257ca66f29c1378"
};

test('original four evidence cases and six viewpoints remain byte-identical',()=>{
 for(const match of html.matchAll(/(<article class="case" id="([^"]+)"[\s\S]*?<\/article>|<section class="lens" id="([^"]+)"[\s\S]*?<\/section>)/g)){
  const id=match[2]||match[3];assert.equal(createHash('sha256').update(match[0]).digest('hex'),preserved[id],id);
 }
 assert.equal(Object.keys(preserved).length,10);
});

test('practical chapter retains concrete deployments, boundaries and current cost caveats',()=>{
 for(const id of ['implementation','placement','cloud-controls','multicloud','app-controls','reference-designs','implementation-tests','costs','control-edr','control-runtime','control-vulnerability','control-audit','control-boundary','control-data','control-recovery','control-alert'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal([...html.matchAll(/<article class="recipe"/g)].length,8);
 assert.equal([...html.matchAll(/<article class="app-recipe"/g)].length,9);
 assert.equal([...html.matchAll(/<article class="provider"/g)].length,3);
 for(const term of ['初期のAVがpassive mode','Runtime coverage','合成finding','既存の追跡済み接続','SQL実行ログの代替ではない','Cloudflare','Google Cloud','Azure','Security Hub Threat Analytics','2026-10-31','実際の有効状態を確認','9月30日','USD 24/月','東京の単価','実アカウントでの設定・インストール・購入・動作検証は行っていない'])assert.ok(html.includes(term),term);
 assert.ok(!html.includes('@@'),'no unresolved placeholders');
 assert.ok(!html.includes('/devguide/lag-vault.html'),'no known bad source URL');
});

test('EventBridge example is valid JSON with scoped high-severity finding filter',()=>{
 const block=[...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map(x=>decodeHTML(x[1])).find(x=>x.trim().startsWith('{'));
 const p=JSON.parse(block);assert.deepEqual(p.source,['aws.guardduty']);assert.deepEqual(p['detail-type'],['GuardDuty Finding']);assert.deepEqual(p.detail.severity,[{numeric:['>=',7]}]);
});

test('SQL example binds trusted tenant and validated ID; document stays self-contained',()=>{
 assert.ok(html.includes('tenant_id = $1 AND id = $2 LIMIT 1'));
 assert.ok(html.includes('verifiedSession.tenantId, validatedOrderId'));
 assert.ok(html.includes('完成した認証・認可の実装ではない'));
 assert.ok(!/<script[ >]|<iframe[ >]|<form[ >]|@import|<link[^>]+stylesheet/i.test(html));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 assert.ok([...html.matchAll(/href="#([^"]+)"/g)].every(x=>ids.includes(x[1])));
 assert.match(html,/@media\(max-width:620px\)/);
 assert.match(html,/white-space:pre-wrap/);
});
