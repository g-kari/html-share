import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decodeHTML } from 'entities';
import { splitVulnerabilitySource, generateSplitVulnerabilities, isReportArchive, PAGE_SIZE } from '../scripts/split-vulnerabilities.mjs';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('reports/vulnerabilities.source.html', root), 'utf8');
const { data, cards } = splitVulnerabilitySource(source);

test('splitting preserves every published record, exact article and full searchable text', async () => {
 const temp = await mkdtemp(path.join(tmpdir(), 'html-share-split-'));
 try {
  await mkdir(path.join(temp, 'reports')); await mkdir(path.join(temp, 'public'));
  await writeFile(path.join(temp, 'reports/vulnerabilities.source.html'), source);
  const { files, manifest } = await generateSplitVulnerabilities(temp);
  assert.equal(cards.length, data.records.length);
  const declared = source.match(/収録：([0-9,]+)項目\s*\/\s*CVE数：([0-9,]+)件/);
  assert.ok(declared, 'The declared source counts must be available');
  assert.equal(Number(declared[1].replaceAll(',', '')), data.records.length);
  assert.equal(Number(declared[2].replaceAll(',', '')), new Set(data.records.flatMap(record => record.ids || []).filter(id => /^CVE-\d{4}-\d+$/i.test(id))).size);
  const ids = new Set(cards.map(card => card.id)); const found = new Map();
  for (const [name, content] of files) if (/chunk-[a-f0-9]+\.json$/.test(name)) {
   const chunk = JSON.parse(content); assert.ok(chunk.cards.length <= PAGE_SIZE);
   for (const card of chunk.cards) { assert.ok(!found.has(card.id)); found.set(card.id, card.html); }
  }
  assert.equal(found.size, ids.size);
  for (const card of cards) assert.equal(found.get(card.id), card.html, card.id);
  const search = JSON.parse(files.get(manifest.searchUrl.slice(1)));
  for (const card of cards) assert.equal(search[card.id], decodeHTML(card.html.replace(/<[^>]*>/g, '')).toLocaleLowerCase('ja'));
  assert.deepEqual(manifest.rows.map(row => row.id), cards.map(card => card.id), 'stable source ordering');
  const expectedLeadIds = [...cards].sort((a,b) => a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date)).slice(0,3).map(card => card.id);
  for (const row of manifest.rows) {
   assert.ok(files.has(row.chunk.slice(1))); const archive = files.get(row.archive.slice(1) + '.html');
   assert.ok(archive.includes(found.get(row.id))); assert.match(archive, /<link rel="canonical" href="https:\/\/share\.0g0\.xyz\/vulnerabilities\/archive\/page-/);
  }
  for (const [name, archive] of files) if (/^vulnerabilities\/archive\/page-\d+\.html$/.test(name)) {
   const lead = archive.match(/<ul class="lead-summary">([\s\S]*?)<\/ul>/)[1];
   const links = [...lead.matchAll(/<li data-lead-record="([^"]+)"><a href="([^"]+)"/g)];
   assert.deepEqual(links.map(link => link[1]), expectedLeadIds, name);
   for (const [, id, href] of links) {
    const url = new URL(decodeHTML(href), 'https://share.0g0.xyz/');
    assert.equal(url.origin, 'https://share.0g0.xyz');
    assert.match(url.pathname, /^\/vulnerabilities\/archive\/page-\d+$/);
    const target = files.get(url.pathname.slice(1) + '.html');
    assert.ok(target?.includes(`id="${id}"`), `${name} lead ${href} resolves to its static target`);
    assert.ok(target.includes(found.get(id)), 'Target is the full authored article');
   }
  }
  const html = files.get('vulnerabilities.html');
  assert.equal((html.match(/<article /g) || []).length, 20);
  assert.ok(Buffer.byteLength(html) < Buffer.byteLength(source) * .2, 'initial HTML under20% of original');
  assert.ok(!html.includes('vulnerability-report-data')); assert.ok(html.includes('vulnerability-view-data'));
  const shortLead = html.match(/<ul class="lead-summary">([\s\S]*?)<\/ul>/)[1];
  const shortItems = [...shortLead.matchAll(/<li[^>]*data-lead-record="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
  assert.equal(shortItems.length, 3);
  const expectedLead = [...cards].sort((a,b) => a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date)).slice(0,3).map(card => card.id);
  assert.deepEqual(shortItems.map(item => item[1]), expectedLead);
  assert.ok(shortItems.every(item => decodeHTML(item[2].replace(/<[^>]*>/g, '')).length <= 55), 'Three short conditional summary lines');
  const originalLead = splitVulnerabilitySource(source).prefix.match(/<section class="brief"><h2>いま先に確認したいこと<\/h2>(<ul>[\s\S]*?<\/ul>)/)[1];
  assert.ok(html.includes(originalLead), 'Every original detailed lead point remains exact');
  assert.match(html, /<details class="lead-more"><summary>/);
  assert.ok(html.includes('製品の利用状況は未確認'));
  for (const suffix of ['', '-top']) for (const id of ['pagination','previous-page','next-page','page-status']) assert.ok(html.includes(`id="${id}${suffix}"`));
  assert.ok(html.includes('aria-label="一覧上部のページ送り"'));
  assert.ok(html.includes('aria-label="一覧下部のページ送り"'));
  assert.ok(html.includes('JavaScriptなしの上部ページ送り'));
  assert.ok(html.includes('<noscript>')); assert.ok(!html.includes('JavaScriptが無効でも全件を読めます。ページ内検索'));
  assert.match(html, /<details class="archive-index" id="archive-index" open>/, 'No-JavaScript legacy fragment links remain visible');
  for (const id of ['main','advisories-heading','coverage-heading','method-heading','history-heading']) assert.ok(html.includes(`id="${id}"`));
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), 'JS-disabled legacy anchor '+id);
  const allIds = [...html.matchAll(/(?<=\s)id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(allIds.length, new Set(allIds).size, 'no duplicate static IDs');
  const again = await generateSplitVulnerabilities(temp); assert.deepEqual(again.files, files);
  assert.equal(await readFile(path.join(temp, 'reports/vulnerabilities.source.html'), 'utf8'), source);
 } finally { await rm(temp, {recursive:true, force:true}); }
});

test('generator exclusion only applies to vulnerability archive and malformed card/register sets fail', () => {
 assert.ok(isReportArchive('vulnerabilities/archive/page-1.html'));
 assert.ok(!isReportArchive('security-incidents.html')); assert.ok(!isReportArchive('vulnerabilities.html'));
 assert.throws(() => splitVulnerabilitySource(source.replace(cards[0].html, '')), /same unique IDs/);
 assert.throws(() => splitVulnerabilitySource(source.replace('id="'+cards[0].id+'"', 'id="unsafe\\anchor"')), /Unsafe vulnerability anchor/);
});
