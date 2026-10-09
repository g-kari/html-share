import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import vm from 'node:vm';
import { prepareIndex, searchDocuments } from '../public/assets/site-search-core.js';

const code = await readFile(new URL('../public/assets/technology-updates-view.js', import.meta.url), 'utf8');
const origin = 'https://share.0g0.xyz';
const root = '/assets/technology-updates/';
const pageSize = 12;
const tags = [
  { id: 'openai', label: 'OpenAI', kind: 'company' },
  { id: 'anthropic', label: 'Anthropic', kind: 'company' },
  { id: 'local', label: 'ローカル実行', kind: 'topic' },
];
const rows = Array.from({ length: 156 }, (_, index) => ({
  id: `record-${String(index).padStart(3, '0')}`,
  title: `更新 ${index}`,
  date: index < 72 ? '2026-10-08' : '2026-09-30',
  category: index % 3 === 0 ? 'local' : 'agent',
  tags: [tags[index % 2], ...(index % 3 === 0 ? [tags[2]] : [])],
  chunk: root + `cards-${Math.floor(index / pageSize)}.json`,
  archive: `/technology-updates/archive/${index < 72 ? '2026-10' : '2026-09'}`,
}));
const markup = row => `<article class="update" id="${row.id}" data-category="${row.category}"><h3>${row.title}</h3><p>本文</p><footer><a href="https://example.org/primary">一次資料</a><a href="#${row.id}">リンク</a></footer></article>`;
const config = { version: 1, pageSize, total: rows.length, manifestUrl: root + 'manifest.json', initialIds: rows.slice(0, pageSize).map(row => row.id) };
const manifest = { version: 1, pageSize, searchUrl: root + 'search.json', rows, tags, months: ['2026-10', '2026-09'] };
const files = new Map([
  [config.manifestUrl, manifest],
  [manifest.searchUrl, Object.fromEntries(rows.map((row, index) => [row.id, `${row.title} complete body ${index === 143 ? '深部だけの語 fullwidth abc' : ''}`]))],
]);
for (let page = 0; page < rows.length / pageSize; page++) files.set(root + `cards-${page}.json`, { version: 1, cards: rows.slice(page * pageSize, (page + 1) * pageSize).map(row => ({ id: row.id, html: markup(row) })) });
const clone = value => JSON.parse(JSON.stringify(value));
const ids = records => records.map(row => row.id);

// Minimal DOM harness: run the unmodified browser script and parse the same
// article/template APIs it uses. Fixtures span thirteen independently loaded chunks.
class Element {
  constructor(id = '', tagName = 'DIV') {
    this.id = id; this.tagName = tagName; this.nodeType = 1;
    this.listeners = new Map(); this.attributeMap = new Map(); this.children = [];
    this.hidden = true; this.disabled = false; this.textContent = ''; this.currentValue = '';
    this.classList = { contains: token => (this.getAttribute('class') || '').split(/\s+/).includes(token) };
  }
  get attributes() { return [...this.attributeMap].map(([name, value]) => ({ name, value })); }
  get value() { return this.currentValue; }
  set value(value) { this.currentValue = this.tagName === 'SELECT' && !this.children.some(option => option.value === value) ? '' : String(value); }
  get childNodes() { return this.children; }
  setAttribute(name, value) { this.attributeMap.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributeMap.get(name); }
  removeAttribute(name) { this.attributeMap.delete(name); }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  dispatch(type, target = this) { if (type === 'click' && this.disabled) return; for (const listener of this.listeners.get(type) || []) listener({ type, target, preventDefault() {} }); }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  scrollIntoView() { this.scrolled = true; }
  querySelectorAll(selector) { assert.equal(selector, '.update'); return this.children.filter(child => child.tagName === 'ARTICLE'); }
}
function setAttributes(element, text) {
  for (const [, name, quoted, single, plain] of text.matchAll(/([a-z0-9:_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)) element.setAttribute(name, quoted ?? single ?? plain ?? '');
}
class Card extends Element {
  constructor(html) {
    super('', 'ARTICLE'); this.html = html;
    const match = html.match(/^<article\b([^>]*)>([\s\S]*)<\/article>$/i);
    assert.ok(match, 'Test parser expects an article root');
    setAttributes(this, match[1]);
    this.descendants = [...match[2].matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)].map(([, tagName, attributes]) => {
      const element = new Element('', tagName.toUpperCase()); setAttributes(element, attributes); return element;
    });
  }
  get outerHTML() { return this.html; }
  querySelectorAll(selector) { assert.equal(selector, '*'); return this.descendants; }
}
class Template extends Element {
  constructor() { super('', 'TEMPLATE'); this.content = new Element(); }
  set innerHTML(html) {
    const nodes = []; let cursor = 0;
    for (const match of html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
      if (match.index > cursor) nodes.push({ nodeType: 3, textContent: html.slice(cursor, match.index) });
      nodes.push(new Card(match[0])); cursor = match.index + match[0].length;
    }
    if (cursor < html.length) nodes.push({ nodeType: 3, textContent: html.slice(cursor) });
    this.content.replaceChildren(...nodes);
  }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function flush() { await nextTurn(); await nextTurn(); }
function browser(start = '/technology-updates', options = {}) {
  const elements = new Map();
  for (const id of ['filters', 'update-cards', 'filter-status', 'empty', 'load-error', 'pagination', 'previous-page', 'next-page', 'page-status', 'technology-view-data', 'updates', 'notes']) elements.set(id, new Element(id));
  elements.set('query', new Element('query', 'INPUT'));
  for (const id of ['category', 'tag', 'month']) {
    const select = new Element(id, 'SELECT');
    const choices = id === 'category' ? (options.categories || ['', 'agent', 'local']) : [''];
    select.replaceChildren(...choices.map(value => { const option = new Element('', 'OPTION'); option.value = value; return option; }));
    elements.set(id, select);
  }
  elements.get('update-cards').replaceChildren(...(options.initialCards || rows.slice(0, pageSize).map(markup)).map(html => new Card(html)));
  elements.get('technology-view-data').textContent = typeof options.config === 'string' ? options.config : JSON.stringify(options.config ?? config);
  const location = new URL(start, origin);
  const historyEntries = [location.href]; let historyPosition = 0;
  const listeners = new Map(); const requests = [];
  let fetchOverride = options.fetch;
  const realFetch = async url => {
    const fixtureFiles = options.files || files;
    assert.ok(fixtureFiles.has(url), `Unexpected URL ${url}`);
    return { ok: true, url: origin + url, headers: { get: name => name === 'content-type' ? 'application/json; charset=utf-8' : null }, json: async () => clone(fixtureFiles.get(url)) };
  };
  const document = {
    getElementById: id => elements.get(id) || elements.get('update-cards').children.find(card => card.id === id) || elements.get('update-cards').children.flatMap(card => card.descendants).find(node => node.id === id),
    createTextNode: text => ({ nodeType: 3, textContent: text }),
    createElement: tag => tag === 'template' ? new Template() : new Element('', tag.toUpperCase()),
  };
  vm.runInNewContext(code, {
    document, location, URL, URLSearchParams, setTimeout, clearTimeout,
    fetch: async (url, init) => { requests.push({ url, init }); return fetchOverride ? fetchOverride(url, realFetch) : realFetch(url); },
    history: {
      pushState(_state, _title, url) { location.href = new URL(url, location).href; historyEntries.splice(++historyPosition); historyEntries.push(location.href); },
      replaceState(_state, _title, url) { location.href = new URL(url, location).href; historyEntries[historyPosition] = location.href; },
    },
    window: { addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); } },
  }, { filename: 'technology-updates-view.js' });
  return {
    elements, location, historyEntries,
    get requestedUrls() { return requests.map(request => request.url); },
    get requests() { return requests; },
    visibleIds: () => elements.get('update-cards').children.map(card => card.id),
    errorVisible: () => !elements.get('load-error').hidden,
    setFetch(override) { fetchOverride = override; },
    async settle() {
      const deadline = Date.now() + 3000;
      while (elements.get('update-cards').getAttribute('aria-busy')) { assert.ok(Date.now() < deadline, 'View update did not settle'); await nextTurn(); }
      await flush();
    },
    startChange(id, value, type = 'change') { elements.get(id).value = value; elements.get('filters').dispatch(type, elements.get(id)); },
    async change(id, value, type = 'change') { this.startChange(id, value, type); await this.settle(); },
    async focus(id) { elements.get('filters').dispatch('focusin', elements.get(id)); await this.settle(); },
    async click(id) { elements.get(id).dispatch('click'); await this.settle(); },
    async reset() { elements.get('filters').dispatch('reset'); await flush(); await this.settle(); },
    async retry() { const button = elements.get('load-error').children.find(node => node.tagName === 'BUTTON'); assert.ok(button, 'Retry must be available'); button.dispatch('click'); await this.settle(); },
    async go(offset) { historyPosition += offset; assert.ok(historyPosition >= 0 && historyPosition < historyEntries.length); location.href = historyEntries[historyPosition]; for (const listener of listeners.get('popstate') || []) listener(); await this.settle(); },
    async hash(id) { location.hash = '#' + encodeURIComponent(id); for (const listener of listeners.get('hashchange') || []) listener(); await this.settle(); },
  };
}
function assertPage(app, expected, page = 1) {
  assert.deepEqual(app.visibleIds(), ids(expected.slice((page - 1) * pageSize, page * pageSize)));
  assert.ok(app.visibleIds().length <= pageSize);
  assert.equal(app.elements.get('page-status').textContent, `${page} / ${Math.max(1, Math.ceil(expected.length / pageSize))}ページ`);
  assert.equal(app.elements.get('empty').hidden, expected.length > 0);
  assert.equal(app.elements.get('previous-page').disabled, page === 1);
  assert.equal(app.elements.get('next-page').disabled, page === Math.max(1, Math.ceil(expected.length / pageSize)));
}

test('ordinary initial load leaves static cards intact and fetches nothing', async () => {
  const app = browser(); await app.settle();
  assertPage(app, rows); assert.deepEqual(app.requestedUrls, []);
  assert.equal(app.elements.get('filters').hidden, false);
  assert.equal(app.elements.get('filter-status').getAttribute('aria-live'), 'polite');
});

test('initial record and existing non-record anchors need no data fetch', async () => {
  for (const id of ['record-002', 'notes']) {
    const app = browser('/technology-updates#' + id); await app.settle();
    assert.deepEqual(app.requestedUrls, []); assertPage(app, rows);
    if (id.startsWith('record')) assert.equal(app.elements.get('update-cards').children[2].scrolled, true);
  }
});

test('paging loads only manifest and the required chunk, keeps DOM bounded, and navigates history', async () => {
  const app = browser(); await app.click('next-page');
  assertPage(app, rows, 2);
  assert.deepEqual(app.requestedUrls, [config.manifestUrl, root + 'cards-1.json']);
  assert.equal(app.location.search, '?page=2');
  assert.ok(app.requests.every(request => request.init.redirect === 'error' && request.init.mode === 'same-origin'));
  await app.go(-1); assertPage(app, rows);
  await app.go(1); assertPage(app, rows, 2);
  assert.equal(app.requestedUrls.length, 2);
});

test('tag and month options populate lazily on focus without full-text search', async () => {
  const app = browser(); await app.focus('tag');
  assert.deepEqual(app.requestedUrls, [config.manifestUrl]);
  assert.deepEqual(app.elements.get('tag').children.map(option => option.value), ['', ...tags.map(tag => tag.id)]);
  assert.deepEqual(app.elements.get('month').children.map(option => option.value), ['', '2026-10', '2026-09']);
  await app.change('tag', 'openai');
  assertPage(app, rows.filter(row => row.tags.some(tag => tag.id === 'openai')));
  await app.change('category', 'local');
  assertPage(app, rows.filter(row => row.category === 'local' && row.tags.some(tag => tag.id === 'openai')));
  await app.change('month', '2026-09');
  assertPage(app, rows.filter(row => row.date.startsWith('2026-09') && row.category === 'local' && row.tags.some(tag => tag.id === 'openai')));
  assert.ok(!app.requestedUrls.includes(manifest.searchUrl));
  assert.deepEqual(Object.fromEntries(app.location.searchParams), { tag: 'openai', category: 'local', month: '2026-09' });
});

test('full-text searches complete bodies beyond initial cards with NFKC case normalization', async () => {
  const app = browser(); await app.change('query', '深部だけの語 ＡＢＣ', 'input');
  assertPage(app, [rows[143]]);
  assert.deepEqual(app.requestedUrls, [config.manifestUrl, manifest.searchUrl, rows[143].chunk]);
  assert.equal(app.location.searchParams.get('q'), '深部だけの語 ＡＢＣ');
  await app.change('query', 'no matches'); assertPage(app, []);
  await app.reset(); assertPage(app, rows);
  assert.equal(app.location.search, '');
  assert.equal(app.requestedUrls.filter(url => url === manifest.searchUrl).length, 1);
});

test('URL filters restore before lazy tag options exist and clamp excessive pages', async () => {
  const app = browser('/technology-updates?tag=anthropic&month=2026-09&page=999'); await app.settle();
  const expected = rows.filter(row => row.tags.some(tag => tag.id === 'anthropic') && row.date.startsWith('2026-09'));
  assertPage(app, expected, Math.ceil(expected.length / pageSize));
  assert.equal(app.elements.get('tag').value, 'anthropic');
  assert.equal(app.elements.get('month').value, '2026-09');
  assert.equal(app.location.searchParams.get('page'), '4');
});

test('old record anchors resolve across chunks and clear conflicting filters', async () => {
  const app = browser('/technology-updates?category=local&tag=openai&month=2026-10#record-143'); await app.settle();
  assertPage(app, rows, 12);
  assert.equal(app.location.hash, '#record-143');
  assert.equal(app.location.search, '?page=12');
  assert.equal(app.elements.get('update-cards').children.find(card => card.id === 'record-143').scrolled, true);
  assert.ok(!app.requestedUrls.includes(manifest.searchUrl));
  await app.hash('record-155'); assertPage(app, rows, 13);
  await app.change('category', 'local'); assert.equal(app.location.hash, '');
});

test('Back and Forward restore filter controls, selected page, and record anchors', async () => {
  const app = browser(); await app.change('category', 'local'); await app.click('next-page');
  assertPage(app, rows.filter(row => row.category === 'local'), 2);
  await app.go(-1); assertPage(app, rows.filter(row => row.category === 'local'));
  await app.go(-1); assertPage(app, rows); assert.equal(app.elements.get('category').value, '');
  await app.go(1); assertPage(app, rows.filter(row => row.category === 'local')); assert.equal(app.elements.get('category').value, 'local');
  await app.go(1); assertPage(app, rows.filter(row => row.category === 'local'), 2);
});

test('failed chunk retains the entire previous page and offers exact archive links plus Retry', async () => {
  let failed = true;
  const app = browser('/technology-updates', { fetch: (url, normal) => failed && url === root + 'cards-1.json' ? Promise.reject(new Error('offline')) : normal(url) });
  await app.click('next-page');
  assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize))); assert.equal(app.errorVisible(), true);
  assert.equal(app.location.search, '');
  const links = app.elements.get('load-error').children.filter(node => node.tagName === 'A');
  assert.deepEqual(links.map(link => link.href), rows.slice(pageSize, 2 * pageSize).map(row => row.archive + '#' + row.id));
  failed = false; await app.retry(); assertPage(app, rows, 2); assert.equal(app.errorVisible(), false);
});

test('manifest and search failures can be retried safely', async () => {
  for (const target of [config.manifestUrl, manifest.searchUrl]) {
    let fail = true;
    const app = browser('/technology-updates?q=深部だけの語', { fetch: (url, normal) => url === target && fail ? Promise.resolve({ ok: false }) : normal(url) });
    await app.settle(); assert.equal(app.errorVisible(), true); assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize)));
    fail = false; await app.retry(); assertPage(app, [rows[143]]);
  }
});

test('a stale chunk response cannot overwrite a newer filter result or URL', async () => {
  const gate = deferred();
  const app = browser('/technology-updates', { fetch: async (url, normal) => { if (url === root + 'cards-1.json') await gate.promise; return normal(url); } });
  app.elements.get('next-page').dispatch('click'); await flush();
  await app.change('query', '深部だけの語'); assertPage(app, [rows[143]]);
  const url = app.location.href; gate.resolve(); await flush();
  assertPage(app, [rows[143]]); assert.equal(app.location.href, url); assert.equal(app.errorVisible(), false);
});

test('input invalidates an older result during the debounce window', async () => {
  const gate = deferred();
  const app = browser('/technology-updates', { fetch: async (url, normal) => { if (url === root + 'cards-1.json') await gate.promise; return normal(url); } });
  app.elements.get('next-page').dispatch('click'); await flush();
  app.startChange('query', '深部だけの語', 'input'); gate.resolve(); await flush();
  assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize)));
  await app.settle(); assertPage(app, [rows[143]]);
});

test('LRU eviction bounds chunk retention and refetches an evicted old page', async () => {
  const app = browser();
  for (let page = 2; page <= 13; page++) { await app.click('next-page'); assertPage(app, rows, page); }
  for (let page = 12; page >= 2; page--) { await app.click('previous-page'); assertPage(app, rows, page); }
  assert.ok(app.requestedUrls.filter(url => url === root + 'cards-1.json').length >= 2);
  assert.equal(app.requestedUrls.filter(url => url === config.manifestUrl).length, 1);
  assert.ok(!app.requestedUrls.includes(manifest.searchUrl));
});

test('invalid inline configuration hides unusable controls while keeping static content', async () => {
  for (const invalid of ['{', { ...config, version: 2 }, { ...config, pageSize: 999 }, { ...config, total: 1 }, { ...config, manifestUrl: 'https://evil.example/manifest.json' }, { ...config, initialIds: [...config.initialIds].reverse() }]) {
    const app = browser('/technology-updates', { config: invalid }); await app.settle();
    assert.equal(app.elements.get('filters').hidden, true); assert.equal(app.elements.get('pagination').hidden, true);
    assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize))); assert.deepEqual(app.requestedUrls, []);
  }
});

test('malformed manifests, cross-origin assets, and invalid dates fail without partial rendering', async () => {
  const mutations = [
    data => { data.version = 2; },
    data => { data.rows[15].id = data.rows[14].id; },
    data => { data.rows[15].date = '2026-02-30'; },
    data => { data.rows[15].tags = [{ ...tags[0], label: 'changed' }]; },
    data => { data.rows[15].chunk = 'https://evil.example/card.json'; },
    data => { data.rows[15].archive = '//evil.example/archive'; },
    data => { data.searchUrl = root + '../search.json'; },
    data => { data.months = ['2026-13']; },
    data => { data.rows.reverse(); },
  ];
  for (const mutate of mutations) {
    const malformed = clone(manifest); mutate(malformed);
    const app = browser('/technology-updates?page=2', { fetch: (url, normal) => url === config.manifestUrl ? Promise.resolve({ ok: true, json: async () => malformed }) : normal(url) });
    await app.settle(); assert.equal(app.errorVisible(), true); assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize)));
    assert.deepEqual(app.requestedUrls, [config.manifestUrl]);
  }
});

test('missing search entries fail instead of silently omitting old records', async () => {
  const malformed = clone(files.get(manifest.searchUrl)); delete malformed['record-143'];
  const app = browser('/technology-updates?q=深部だけの語', { fetch: (url, normal) => url === manifest.searchUrl ? Promise.resolve({ ok: true, json: async () => malformed }) : normal(url) });
  await app.settle(); assert.equal(app.errorVisible(), true); assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize)));
});

test('chunk schema and exact selected article IDs are validated before DOM replacement', async () => {
  const mutations = [
    data => { data.version = 2; },
    data => { data.cards.pop(); },
    data => { data.cards[0].id = 'record-143'; },
    data => { data.cards[0].html = data.cards[0].html.replace('record-012', 'record-143'); },
    data => { data.cards[0].html += '<article class="update" id="injected">extra</article>'; },
    data => { data.cards[0].html = data.cards[0].html.replace('<h3>', '<h3 onclick="alert(1)">'); },
    data => { data.cards[0].html = data.cards[0].html.replace('</footer>', '<script>alert(1)</script></footer>'); },
    data => { data.cards[0].html = data.cards[0].html.replace('https://example.org/primary', 'javascript:alert(1)'); },
    data => { data.cards[0].html = data.cards[0].html.replace('<p>', '<p id="filters">'); },
    data => { data.cards[0].html = data.cards[0].html.replace('<article ', '<article aria-labelledby="title-record-012" '); },
    data => { data.cards[0].html = data.cards[0].html.replace('<h3>', '<h3 id="title-record-012">'); },
  ];
  for (const mutate of mutations) {
    const malformed = clone(files.get(root + 'cards-1.json')); mutate(malformed);
    const app = browser('/technology-updates?page=2', { fetch: (url, normal) => url === root + 'cards-1.json' ? Promise.resolve({ ok: true, json: async () => malformed }) : normal(url) });
    await app.settle(); assert.equal(app.errorVisible(), true); assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize)));
  }
});

test('redirected responses and non-JSON responses fail safely', async () => {
  for (const response of [
    { ok: true, url: 'https://evil.example/manifest.json', json: async () => clone(manifest) },
    { ok: true, headers: { get: name => name === 'content-type' ? 'text/html' : null }, json: async () => clone(manifest) },
  ]) {
    const app = browser('/technology-updates?page=2', { fetch: async () => response }); await app.settle();
    assert.equal(app.errorVisible(), true); assert.deepEqual(app.visibleIds(), ids(rows.slice(0, pageSize)));
  }
});

// These regression checks consume the real generator output, including its
// aria-labelledby/title-* relationship and original author-provided links.
const generatedHtml = await readFile(new URL('../public/technology-updates.html', import.meta.url), 'utf8');
const generatedConfig = JSON.parse(generatedHtml.match(/id="technology-view-data">([\s\S]*?)<\/script>/)[1]);
const generatedManifest = JSON.parse(await readFile(new URL('../public' + generatedConfig.manifestUrl, import.meta.url), 'utf8'));
const generatedFiles = new Map([[generatedConfig.manifestUrl, generatedManifest]]);
for (const url of [generatedManifest.searchUrl, ...new Set(generatedManifest.rows.map(row => row.chunk))]) generatedFiles.set(url, JSON.parse(await readFile(new URL('../public' + url, import.meta.url), 'utf8')));
const generatedOptions = {
  config: generatedConfig, files: generatedFiles,
  initialCards: [...generatedHtml.matchAll(/<article\b[^>]*class="update"[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]),
  categories: ['', ...new Set(generatedManifest.rows.map(row => row.category))],
};

test('real generated initial page remains lazy, then pages with its labelled headings intact', async () => {
  const app = browser('/technology-updates', generatedOptions); await app.settle();
  assertPage(app, generatedManifest.rows); assert.deepEqual(app.requestedUrls, []);
  await app.focus('tag'); assert.equal(app.errorVisible(), false); assertPage(app, generatedManifest.rows);
  if (generatedConfig.total > pageSize) {
    await app.click('next-page'); assert.equal(app.errorVisible(), false); assertPage(app, generatedManifest.rows, 2);
    for (const card of app.elements.get('update-cards').children) {
      assert.equal(card.getAttribute('aria-labelledby'), 'title-' + card.id);
      assert.ok(card.descendants.some(node => node.tagName === 'H3' && node.id === 'title-' + card.id));
    }
  }
});

test('real generated legacy anchor and historical full-body search resolve successfully', async () => {
  const last = generatedManifest.rows.at(-1);
  const app = browser('/technology-updates?category=invalid#' + last.id, generatedOptions); await app.settle();
  assert.equal(app.errorVisible(), false); assertPage(app, generatedManifest.rows, Math.ceil(generatedConfig.total / pageSize));
  assert.ok(app.elements.get('update-cards').children.find(card => card.id === last.id).scrolled);
  await app.change('query', last.title);
  const words = last.title.normalize('NFKC').toLocaleLowerCase('ja').trim().split(/\s+/).filter(Boolean);
  const text = generatedFiles.get(generatedManifest.searchUrl);
  assert.equal(app.errorVisible(), false); assertPage(app, generatedManifest.rows.filter(row => words.every(word => text[row.id].includes(word))));
});

test('unknown URL filter values are safely removed after loading metadata', async () => {
  const app = browser('/technology-updates?category=unknown&tag=missing&month=2026-01'); await app.settle();
  assertPage(app, rows); assert.equal(app.location.search, '');
});

test('old title-* fragments reveal the historical record, clear conflicts, and retain the literal heading fragment', async () => {
  const last = generatedManifest.rows.at(-1);
  const heading = 'title-' + last.id;
  const conflictingCategory = generatedManifest.rows.find(row => row.category !== last.category)?.category || '';
  const conflictingTag = generatedManifest.tags.find(tag => !last.tags.some(existing => existing.id === tag.id))?.id || '';
  const app = browser('/technology-updates?category=' + encodeURIComponent(conflictingCategory) + '&tag=' + encodeURIComponent(conflictingTag) + '&month=' + generatedManifest.months[0] + '#' + heading, generatedOptions); await app.settle();
  assert.equal(app.errorVisible(), false); assertPage(app, generatedManifest.rows, Math.ceil(generatedConfig.total / pageSize));
  assert.equal(app.location.hash, '#' + heading);
  assert.equal(app.location.searchParams.has('category'), false); assert.equal(app.location.searchParams.has('tag'), false); assert.equal(app.location.searchParams.has('month'), false);
  const card = app.elements.get('update-cards').children.find(card => card.id === last.id);
  assert.equal(card.descendants.find(node => node.id === heading).scrolled, true);
  await app.change('query', last.title); assert.equal(app.location.hash, '');
});

test('title-* aliases on the initial page stay lazy and hash changes resolve either alias', async () => {
  const first = generatedManifest.rows[0];
  const app = browser('/technology-updates#title-' + first.id, generatedOptions); await app.settle();
  assert.deepEqual(app.requestedUrls, []);
  assert.equal(app.elements.get('update-cards').children[0].descendants.find(node => node.id === 'title-' + first.id).scrolled, true);
  const last = generatedManifest.rows.at(-1);
  await app.hash('title-' + last.id); assertPage(app, generatedManifest.rows, Math.ceil(generatedConfig.total / pageSize));
  assert.equal(app.errorVisible(), false); assert.equal(app.location.hash, '#title-' + last.id);
  await app.hash(first.id); assertPage(app, generatedManifest.rows);
});

test('the generated sitewide headline search result opens its historical card target', async () => {
  const indexHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const searchPath = indexHtml.match(/data-index="([^"]+)"/)[1];
  const searchIndex = prepareIndex(JSON.parse(await readFile(new URL('../public' + searchPath, import.meta.url), 'utf8')));
  const result = searchDocuments(searchIndex, 'Workers OAuth Provider').find(result => result.route === '/technology-updates');
  assert.ok(result, 'The real search index includes the old headline');
  assert.ok(result.section.anchor, 'The headline result has a fragment target');
  const app = browser(result.route + '#' + encodeURIComponent(result.section.anchor), generatedOptions); await app.settle();
  assert.equal(app.errorVisible(), false);
  assert.ok(app.visibleIds().includes('cloudflare-oauth-v1'));
  assert.equal(app.location.hash, '#' + encodeURIComponent(result.section.anchor));
  const card = app.elements.get('update-cards').children.find(card => card.id === 'cloudflare-oauth-v1');
  const target = card.id === result.section.anchor ? card : card.descendants.find(node => node.id === result.section.anchor);
  assert.equal(target.scrolled, true);
});
