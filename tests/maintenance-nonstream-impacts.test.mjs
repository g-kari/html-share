import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addSocialMetadata} from '../scripts/social-metadata.mjs';
const d=JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json'));
const h=readFileSync('public/php-emergency-maintenance.html','utf8');
test('non-stream effects remain ten separate leads with six official confirmations',()=>{
 assert.equal(d.nonStreamImpacts.length,10);
 assert.equal(d.nonStreamImpacts.reduce((n,r)=>n+r.candidateUrls.length,0),14);
 assert.equal(d.nonStreamImpacts.filter(r=>r.status==='verified_limited').length,6);
 assert.equal(d.nonStreamImpacts.filter(r=>r.status==='pending').length,4);
 for(const r of d.nonStreamImpacts){assert.equal(r.candidateTextRead,false);if(r.status==='pending')assert.equal(r.summary,null);}
 assert.equal(d.confirmed.length,576);assert.equal(d.pending.length,2046);assert.equal(d.discovery.length,2855);
 assert.equal(d.confirmed.filter(x=>x.restored).length,113);
 assert.ok(h.indexOf('id="stream-impacts"')<h.indexOf('id="non-stream-impacts"'));
 assert.ok(h.indexOf('id="non-stream-impacts"')<h.indexOf('id="pending"'));
 assert.doesNotMatch(h,/01M5PFXR|gizensya\/cursor|Sentinel_/);
});
test('backup signup limits preserve earlier Lolipop notice and member access remains restricted',()=>{
 const c=d.confirmed.find(x=>x.id==='lolipop-new-signup-migration-webdav-8246');
 assert.match(c.scope,/バックアップ/);assert.match(c.scope,/利用継続/);assert.equal(c.restored,false);assert.ok(c.history.length);
 assert.match(d.nonStreamImpacts.find(x=>x.number===10).restriction,/パスワード/);
});
test('dedicated generated guide is embedded with its actual PNG dimensions',()=>{
 const png=readFileSync('public/assets/maintenance-status-guide-20261028.png');
 assert.equal(png.readUInt32BE(16),1730);assert.equal(png.readUInt32BE(20),909);
 assert.match(h,/<img src="\/assets\/maintenance-status-guide-20261028.png"/);
 assert.match(h,/og:image:width" content="1730"/);assert.match(h,/og:image:height" content="909"/);
});
