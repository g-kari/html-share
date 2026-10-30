import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/data/emergency-maintenance-20261021.json',import.meta.url)));
const html=readFileSync(new URL('../public/php-emergency-maintenance.html',import.meta.url),'utf8');
const php=readFileSync(new URL('../public/php-security-os-response.html',import.meta.url),'utf8');
test('six directly checked notices added without truncating prior candidates',()=>{
 assert.equal(data.confirmed.length,576);
 assert.equal(data.confirmed.filter(c=>c.restored).length,113);
 const ids=data.dailyOfficialFollowup20261029.verifiedIds;
 assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);
 for(const id of ids){const c=data.confirmed.find(x=>x.id===id);assert.equal(c.sourceRead,'body_retrieved');assert.equal(c.reasonKey,'php');assert.ok(c.ownershipEvidence.length);assert.match(c.checkedAt,/2026-10-29/);}
 assert.deepEqual([...html.matchAll(/<article class="service" id="([^"]+)"/g)].map(m=>m[1]),data.confirmed.map(c=>c.id));
 assert.equal(data.dailyOfficialFollowup20261029.pending.length,4);
 assert.ok(data.pending.some(x=>JSON.stringify(x).includes('satsumasendai20')));
 assert.ok(data.discovery.length>=2832);
});
test('status clocks and partial scope do not become blanket restoration',()=>{
 const get=id=>data.confirmed.find(c=>c.id==='official-20261029-'+id);
 assert.equal(get('minato-partial').restored,false);assert.match(get('minato-partial').safe,/復旧期限ではありません/);
 assert.equal(get('nanto-cultural').restored,false);assert.match(get('nanto-cultural').scope,/対応中/);
 assert.equal(get('toyota-still-stopped').restored,false);assert.match(get('toyota-still-stopped').end,/午後5時/);
 assert.match(get('iki-contact').safe,/正確な復旧時計ではない/);
 assert.match(get('tgkk-reservation').safe,/10\/28 12時を実復旧時計に転用しない/);
});
test('CISA KEV notice keeps both exact CVEs and applicability, no invented deadline',()=>{
 const section=php.match(/<section class="section" id="cisa-kev-20261026">.*?<\/section>/s)?.[0];assert.ok(section);
 for(const id of ['CVE-2026-109618','CVE-2026-109619'])assert.ok(section.includes(id));
 assert.match(section,/連邦文民行政機関/);assert.match(section,/対応期限.*未読/);assert.match(section,/content\.govdelivery\.com\/accounts\/USDHSCISA\/bulletins\/4309083/);
 assert.doesNotMatch(section,/10月29日.*期限|10\/29.*期限/);
});
test('PAN-OS exploitation followup is limited to exposed management and vendor updates',()=>{
 const section=php.match(/<section class="section" id="pan-os-management-20261029">.*?<\/section>/s)?.[0];assert.ok(section);
 for(const id of ['CVE-2026-109618','CVE-2026-109619'])assert.ok(section.includes(id));
 assert.match(section,/インターネットに公開されたPAN-OSの管理/);
 assert.match(section,/標準の構成ではインターネットに公開されていません/);
 assert.match(section,/信頼できる内部IPアドレス/);assert.match(section,/提供済みのPAN-OS修正版/);
 assert.match(section,/個人の利用環境.*調べていません/);
 assert.match(section,/unit42\.paloaltonetworks\.com\/cve-2026-109618-cve-2026-109619/);
 assert.match(section,/security\.paloaltonetworks\.com\/CVE-2026-109618/);
 assert.doesNotMatch(section,/12\.2\.4|11\.2\.10|25台|GlobalProtect.*影響/);
});
