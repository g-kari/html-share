import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateSplitTechnologyUpdates, splitTechnologySource, isTechnologyArchive, TECHNOLOGY_SOURCE_PATH } from "../scripts/split-technology-updates.mjs";
import { authoredReportSource, reportSourcePaths } from "../scripts/report-source.mjs";
import { contentFingerprint, writeFeed } from "../scripts/rss-feed.mjs";
import { writeSearchIndex } from "../scripts/search-index.mjs";
import { prepareIndex, searchDocuments } from "../public/assets/site-search-core.js";
import { scanTags } from "../scripts/social-metadata.mjs";

const current = await readFile(new URL('../reports/technology-updates.source.html', import.meta.url), 'utf8');
const config = (html) => JSON.parse(html.match(/id="technology-view-data">([\s\S]*?)<\/script>/)[1]);
const articles = (html) => [...html.matchAll(/<article\b[^>]*class="update"[^>]*>[\s\S]*?<\/article>/g)].map((match) => match[0]);
async function fixture(source = current) {
  const root = await mkdtemp(path.join(tmpdir(), 'technology-scale-'));
  await mkdir(path.join(root, 'reports'));
  await mkdir(path.join(root, 'public'));
  await writeFile(path.join(root, TECHNOLOGY_SOURCE_PATH), source);
  return root;
}
async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (file.endsWith('.html')) files.push(file);
  }
  return files;
}
function scaled(count) {
  const dates = Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 9, 8) - i * 86400000).toISOString().slice(0, 10));
  const records = dates.map((date, i) => ({ id: `sample-${i}`, date, category: 'agent', title: `Codex CLI update ${i}`, lead: '編集修正', facts: [`unique-${i} 公開本文`], test: '小さく確認', sources: [['Official', 'https://github.com/openai/codex/releases']], flag: '改善' }));
  const cards = records.map((r) => `<article class="update" id="${r.id}" data-category="agent"><div class="record-meta"></div><h3 id="title-${r.id}">${r.title}</h3><p>${r.facts[0]}</p><a href="${r.sources[0][1]}">Official</a></article>`).join('\n');
  const history = dates.map((date, i) => `<li><time datetime="${date}">${date}</time>history-only-${i}</li>`).join('');
  return `<html lang="ja"><head><title>技術更新</title><meta name="description" content="公開資料"><style>body{color:black}</style></head><body><header id="top">16項目 / 6分野</header><main><section class="quick"><a href="#sample-999">最古</a></section><section class="collection" id="updates"><form id="filters" hidden><input id="query"><select id="category"></select><button type="reset">条件をクリア</button><p class="filter-status" id="filter-status">全件</p></form><div class="updates">${cards}</div><p id="empty" hidden>なし</p></section><section class="history" id="history"><ul>${history}</ul></section></main><script type="application/json" id="technology-update-data">${JSON.stringify({ schema_version: 1, records, changes: [] })}</script><script>PRIVATE_OLD_SCRIPT</script></body></html>`;
}

test('current technology source preserves all 16 records, facts, official links and history', async () => {
  const root = await fixture();
  try {
    const result = await generateSplitTechnologyUpdates(root);
    assert.equal(result.manifest.rows.length, 16);
    const main = result.files.get('technology-updates.html');
    assert.equal(articles(main).length, 12);
    assert.doesNotMatch(main, /technology-update-data|PRIVATE_OLD_SCRIPT|rel="(?:preload|prefetch)"/);
    assert.equal(config(main).initialIds.length, 12);
    for (const id of ['filters', 'query', 'category', 'tag', 'month', 'update-cards', 'filter-status', 'empty', 'pagination', 'previous-page', 'next-page', 'page-status', 'load-error']) {
      assert.equal(scanTags(main).filter((tag) => !tag.closing && tag.attrs?.get('id')?.value === id).length, 1, `Real generated main must contain exactly one #${id}`);
    }
    assert.equal(Buffer.byteLength(main) < Buffer.byteLength(current), true);
    const originals = articles(current);
    for (const original of originals) {
      const id = scanTags(original)[0].attrs.get('id').value;
      const row = result.manifest.rows.find((r) => r.id === id);
      const archive = result.files.get(row.archive.slice(1) + '.html');
      const generated = articles(archive).find((article) => scanTags(article)[0].attrs.get('id').value === id);
      const withoutTags = generated.replace(/<a class="auto-tag"[\s\S]*?<\/a>/g, '');
      assert.equal(withoutTags, original.replace(/(<a\b[^>]*class="permalink"[^>]*\bhref=")#[^"]*(")/, `$1/technology-updates#${id}$2`));
      assert.match(generated, new RegExp(`class="permalink" href="/technology-updates#${id}"`));
      assert.ok(row.tags.some((tag) => tag.kind === 'product'));
      assert.ok(row.tags.some((tag) => tag.kind === 'domain'));
      assert.ok(row.tags.some((tag) => tag.kind === 'change'));
      assert.match(archive, new RegExp(`rel="canonical" href="https://share.0g0.xyz${row.archive}"`));
      assert.match(archive, /application\/rss\+xml/);
    }
    assert.match(result.files.get('technology-updates/history.html'), /終了日未発表/);
    assert.equal(await readFile(path.join(root, TECHNOLOGY_SOURCE_PATH), 'utf8'), current);
    const second = await generateSplitTechnologyUpdates(root);
    assert.deepEqual(second.files, result.files);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('1000 records and history entries keep landing HTML and every static page bounded', async () => {
  const large = await fixture(scaled(1000));
  const small = await fixture(scaled(50));
  try {
    const a = await generateSplitTechnologyUpdates(large);
    const b = await generateSplitTechnologyUpdates(small);
    const main = a.files.get('technology-updates.html');
    assert.equal(articles(main).length, 12);
    assert.equal((main.match(/<li\b/g) || []).length, 5);
    assert.ok(Buffer.byteLength(main) < 16000);
    assert.ok(Math.abs(Buffer.byteLength(main) - Buffer.byteLength(b.files.get('technology-updates.html'))) < 100);
    assert.doesNotMatch(main, /unique-999|history-only-999/);
    assert.match(main, /1000項目 \/ 1分野/);
    for (const [file, value] of a.files) {
      if (file.endsWith('.html')) {
        assert.ok(articles(value).length <= 12, file);
        assert.ok((value.match(/<li\b/g) || []).length <= 20, file);
        assert.ok(Buffer.byteLength(value) < 22000, file);
      }
    }
    assert.equal(a.manifest.rows.length, 1000);
    const oldest = a.manifest.rows.at(-1);
    assert.match(a.files.get(oldest.archive.slice(1) + '.html'), /unique-999/);
    assert.ok(a.files.has('technology-updates/archive/page-2.html'));
    assert.ok(a.files.has('technology-updates/history/page-50.html'));
    for (const [file, value] of a.files) if (file.includes('/chunk-')) assert.ok(JSON.parse(value).cards.length <= 12);
  } finally { await rm(large, { recursive: true, force: true }); await rm(small, { recursive: true, force: true }); }
});

test('sitewide search finds old public card text and every history entry under original route/anchors', async () => {
  const root = await fixture(scaled(50));
  try {
    await generateSplitTechnologyUpdates(root);
    await writeFile(path.join(root, 'reports/private.html'), 'PRIVATE_SOURCE_SENTINEL');
    const url = await writeSearchIndex(root, await htmlFiles(path.join(root, 'public')));
    const contents = await readFile(path.join(root, 'public', url), 'utf8');
    const index = prepareIndex(JSON.parse(contents));
    assert.equal(index.length, 4);
    const old = searchDocuments(index, 'unique-49')[0];
    assert.equal(old.route, '/technology-updates');
    assert.equal(old.section.anchor, 'sample-49');
    const history = searchDocuments(index, 'history-only-49')[0];
    assert.equal(history.route, '/technology-updates/history/page-3');
    assert.match(await readFile(path.join(root, 'public', history.route + '.html'), 'utf8'), /history-only-49/);
    assert.doesNotMatch(contents, /PRIVATE_SOURCE_SENTINEL|PRIVATE_OLD_SCRIPT/);
    assert.ok(index.every((doc) => !doc.route.includes('/archive')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('source migration leaves general RSS publication/update dates and GUID unchanged', async () => {
  const root = await fixture();
  try {
    const before = contentFingerprint(current, 'technology-updates.html');
    const previous = { fingerprint: before, published: '2026-10-08T23:59:03.000Z', updated: '2026-10-08T23:59:03.000Z' };
    await writeFile(path.join(root, '.feed-state.json'), JSON.stringify({ version: 1, pages: { 'technology-updates.html': previous } }));
    const { files } = await generateSplitTechnologyUpdates(root);
    const authored = await authoredReportSource(root, 'technology-updates.html', files.get('technology-updates.html'));
    assert.equal(contentFingerprint(authored, 'technology-updates.html'), before);
    await writeFeed(root, [{ relativePath: 'technology-updates.html', route: '/technology-updates', title: '技術更新', description: '説明', source: authored }]);
    const state = JSON.parse(await readFile(path.join(root, '.feed-state.json'), 'utf8'));
    assert.deepEqual(state.pages['technology-updates.html'], previous);
    const feed = await readFile(path.join(root, 'public/feed.xml'), 'utf8');
    assert.match(feed, /<guid isPermaLink="true">https:\/\/share.0g0.xyz\/technology-updates<\/guid>/);
    assert.match(feed, /2026-10-08T23:59:03.000Z/);
    assert.deepEqual(reportSourcePaths('technology-updates.html'), ['reports/technology-updates.source.html', 'public/technology-updates.html']);
    assert.ok(isTechnologyArchive('technology-updates/archive.html'));
    assert.ok(isTechnologyArchive('technology-updates/history/page-2.html'));
    assert.equal(isTechnologyArchive('technology-updates.html'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid/mismatched duplicate technology IDs fail rather than lose historical content', () => {
  assert.throws(() => splitTechnologySource(current.replace('id="openai-sol-ultrafast"', 'id="other"')), /Invalid technology record/);
  assert.throws(() => splitTechnologySource(current.replace('data-category="api"', 'data-category="wrong"')), /category mismatch/);
  assert.throws(() => splitTechnologySource(current.replace('id="claude-code-21294"', 'id="openai-sol-ultrafast"')), /category mismatch|same unique IDs/);
  assert.throws(() => splitTechnologySource(current.replace('"date":"2026-10-08"', '"date":"2026-02-30"')), /Invalid technology record/);
});
