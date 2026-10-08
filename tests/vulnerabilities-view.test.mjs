import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';
import vm from 'node:vm';

const publicRoot = new URL('../public/', import.meta.url);
const html = await readFile(new URL('vulnerabilities.html', publicRoot), 'utf8');
const viewCode = await readFile(new URL('assets/vulnerabilities-view.js', publicRoot), 'utf8');
const view = JSON.parse(html.match(/id="vulnerability-view-data">([\s\S]*?)<\/script>/)[1]);
const pageSize = view.pageSize;
const origin = 'https://share.0g0.xyz';
const articlePattern = /<article\b[^>]*class="advisory"[^>]*>[\s\S]*?<\/article>/g;
const initialCards = [...html.matchAll(articlePattern)].map(match => match[0]);
const selectOptions = Object.fromEntries(
  [...html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
    .map(([, id, contents]) => [id, [...contents.matchAll(/<option value="([^"]*)"/g)].map(match => match[1])]),
);
const archiveIndexHtml = html.match(/<details class="archive-index"[^>]*>([\s\S]*?)<\/details>/)[1];
const archivePageHtml = html.match(/<nav class="archive-pages"[^>]*>([\s\S]*?)<\/nav>/)[1];
const staticArchiveLinks = [...(archivePageHtml + archiveIndexHtml).matchAll(/<a href="([^"]+)"/g)]
  .map(match => match[1]);

const comparators = {
  priority: (a, b) => a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date),
  date: (a, b) => b.date.localeCompare(a.date),
  severity: (a, b) => b.cvss - a.cvss,
};
const priorityRows = [...view.rows].sort(comparators.priority);
const ids = rows => rows.map(row => row.id);
const pageRows = (rows, page = 1) => rows.slice((page - 1) * pageSize, page * pageSize);

// This small DOM implements only the APIs used by the view. Every test runs the
// unmodified production script in a fresh VM and serves the generated JSON files.
class Element {
  constructor(id = '', tagName = 'DIV', options) {
    this.id = id;
    this.tagName = tagName;
    this.options = options;
    this.listeners = new Map();
    this.attributes = new Map();
    this.children = [];
    this.hidden = true;
    this.disabled = false;
    this.textContent = '';
    this.value = id === 'sort' ? 'priority' : '';
  }

  get value() { return this.currentValue; }
  set value(value) {
    this.currentValue = this.options && !this.options.includes(value) ? '' : value;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type, target = this) {
    if (type === 'click' && this.disabled) return;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type, target, preventDefault() {} });
    }
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
  }

  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  scrollIntoView() { this.scrolled = true; }
  querySelectorAll(selector) {
    assert.equal(selector, '.advisory');
    return this.children.filter(child => child instanceof Card);
  }

  set innerHTML(markup) {
    this.children = [...markup.matchAll(articlePattern)].map(match => new Card(match[0]));
  }
}

class Card extends Element {
  constructor(markup) {
    super(markup.match(/\bid="([^"]+)"/)[1], 'ARTICLE');
    this.markup = markup;
    this.details = { open: /<details\b[^>]*\bopen\b/.test(markup) };
  }

  get outerHTML() {
    // Native <details> changes appear in outerHTML when the view saves a card.
    return this.markup.replace(/<details\b[^>]*>/, this.details.open ? '<details open>' : '<details>');
  }

  querySelector(selector) {
    assert.equal(selector, 'details');
    return this.details;
  }
}

const jsonFiles = new Map();
async function readJson(url) {
  if (!jsonFiles.has(url)) {
    assert.ok(url.startsWith('/assets/vulnerabilities/'), `Unexpected data URL: ${url}`);
    jsonFiles.set(url, readFile(new URL(url.slice(1), publicRoot), 'utf8').then(JSON.parse));
  }
  return jsonFiles.get(url);
}
const searchText = await readJson(view.searchUrl);

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function flushUpdates() {
  await nextTurn();
  await nextTurn();
}

async function createBrowser(start = '/vulnerabilities', { fetchOverride, manifest = view } = {}) {
  const elements = new Map();
  for (const id of [
    'filters', 'advisories', 'vulnerability-view-data', 'pagination', 'load-error',
    'result-count', 'empty', 'page-status', 'previous-page', 'next-page', 'advisories-heading', 'archive-index',
    'pagination-top', 'previous-page-top', 'next-page-top', 'page-status-top',
  ]) {
    elements.set(id, new Element(id, id.endsWith('-page') ? 'BUTTON' : 'DIV'));
  }
  elements.set('q', new Element('q', 'INPUT'));
  for (const [id, options] of Object.entries(selectOptions)) {
    elements.set(id, new Element(id, 'SELECT', options));
  }
  elements.get('archive-index').setAttribute('open', '');
  elements.get('vulnerability-view-data').textContent = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  elements.get('advisories').innerHTML = initialCards.join('\n');

  const fallbackTargets = [...archiveIndexHtml.matchAll(/<li\b([^>]*data-fallback-id="[^"]+"[^>]*)>([\s\S]*?)<\/li>/g)]
    .map(([, attributes, contents]) => {
      const element = new Element(attributes.match(/(?:^|\s)id="([^"]+)"/)?.[1] ?? '', 'LI');
      element.setAttribute('data-fallback-id', attributes.match(/data-fallback-id="([^"]+)"/)[1]);
      const link = new Element('', 'A');
      link.href = contents.match(/<a href="([^"]+)"/)[1];
      element.append(link);
      return element;
    });
  const archivePageLinks = [...archivePageHtml.matchAll(/<a href="([^"]+)"/g)].map(([, href]) => {
    const link = new Element('', 'A');
    link.href = href;
    return link;
  });
  const location = new URL(start, origin);
  const historyEntries = [location.href];
  let historyPosition = 0;
  const windowListeners = new Map();
  const requests = [];
  const realFetch = async url => ({ ok: true, json: async () => readJson(url) });
  let fetchMode = fetchOverride;
  const fetch = async url => {
    requests.push(url);
    return fetchMode ? fetchMode(url, realFetch) : realFetch(url);
  };
  const document = {
    getElementById: id => elements.get(id) ?? elements.get('advisories').children.find(card => card.id === id),
    querySelectorAll(selector) {
      assert.equal(selector, '[data-fallback-id]');
      return fallbackTargets;
    },
    body: { classList: { add() {} } },
    createTextNode: text => ({ textContent: text }),
    createElement: tag => new Element('', tag.toUpperCase()),
  };
  const context = {
    URL, URLSearchParams, Map, setTimeout, clearTimeout, document, fetch, location,
    history: {
      pushState(_state, _title, url) {
        location.href = new URL(url, location).href;
        historyEntries.splice(++historyPosition);
        historyEntries.push(location.href);
      },
      replaceState(_state, _title, url) {
        location.href = new URL(url, location).href;
        historyEntries[historyPosition] = location.href;
      },
    },
    window: {
      addEventListener(type, listener) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(listener);
      },
    },
  };
  vm.runInNewContext(viewCode, context, { filename: 'vulnerabilities-view.js' });

  const browser = {
    elements, requests, location, fallbackTargets,
    get archiveLinks() {
      return [...archivePageLinks, ...fallbackTargets.flatMap(target => target.children)].map(link => link.href);
    },
    get historyEntries() { return [...historyEntries]; },
    get historyPosition() { return historyPosition; },
    setFetch(override) { fetchMode = override; },
    cards() { return elements.get('advisories').children; },
    visibleIds() { return this.cards().map(card => card.id); },
    errorVisible() { return !elements.get('load-error').hidden; },
    async settle() {
      const deadline = Date.now() + 3_000;
      while (elements.get('advisories').getAttribute('aria-busy')) {
        assert.ok(Date.now() < deadline, 'The view did not finish updating');
        await nextTurn();
      }
      await flushUpdates();
    },
    startChange(id, value) {
      elements.get(id).value = value;
      elements.get('filters').dispatch('change', elements.get(id));
    },
    async change(id, value) {
      this.startChange(id, value);
      await this.settle();
    },
    startClick(id) { elements.get(id).dispatch('click'); },
    async click(id) {
      this.startClick(id);
      await this.settle();
    },
    async retry() {
      const button = elements.get('load-error').children.find(child => child.tagName === 'BUTTON');
      assert.ok(button, 'A failed request must offer Retry');
      button.dispatch('click');
      await this.settle();
    },
    async traverseHistory(offset) {
      assert.ok(historyPosition + offset >= 0 && historyPosition + offset < historyEntries.length);
      historyPosition += offset;
      location.href = historyEntries[historyPosition];
      for (const listener of windowListeners.get('popstate') ?? []) listener();
      await this.settle();
    },
    async back() { await this.traverseHistory(-1); },
    async forward() { await this.traverseHistory(1); },
  };
  await browser.settle();
  return browser;
}

function assertPage(browser, rows, page = 1) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  assert.deepEqual(browser.visibleIds(), ids(pageRows(rows, page)));
  for (const suffix of ['', '-top']) {
    assert.equal(browser.elements.get('page-status' + suffix).textContent, `${page} / ${pages}ページ`);
    assert.equal(browser.elements.get('previous-page' + suffix).disabled, page === 1);
    assert.equal(browser.elements.get('next-page' + suffix).disabled, page === pages);
    assert.equal(browser.elements.get('pagination' + suffix).hidden, rows.length <= pageSize);
  }
  assert.equal(browser.elements.get('empty').hidden, rows.length > 0);
  assert.equal(browser.elements.get('previous-page').disabled, page === 1);
  assert.equal(browser.elements.get('next-page').disabled, page === pages);
  assert.equal(browser.elements.get('pagination').hidden, rows.length <= pageSize);
  assert.equal(browser.errorVisible(), false);
}

async function readAllPages(browser, expectedRows) {
  const collected = [];
  const pages = Math.max(1, Math.ceil(expectedRows.length / pageSize));
  for (let page = 1; page <= pages; page++) {
    assertPage(browser, expectedRows, page);
    collected.push(...browser.visibleIds());
    if (page < pages) await browser.click('next-page');
  }
  assert.deepEqual(collected, ids(expectedRows), 'No omissions, duplicates, or unstable ties across pages');
}

test('the initial view uses the static first page without any fetch', async () => {
  const browser = await createBrowser();
  assert.deepEqual(browser.requests, []);
  assertPage(browser, priorityRows);
  assert.equal(browser.elements.get('filters').hidden, false);
  assert.equal(browser.location.href, `${origin}/vulnerabilities`);
  assert.equal(browser.fallbackTargets.length, view.rows.length);
  assert.ok(browser.fallbackTargets.every(target => target.id === ''), 'Enhanced cards own the legacy IDs');
  assert.deepEqual(browser.archiveLinks, staticArchiveLinks);
});

test('all metadata filter values work without loading the full-text index', async t => {
  for (const name of ['product', 'exploitation', 'severity']) {
    for (const value of selectOptions[name]) {
      await t.test(`${name}=${value || '(all)'}`, async () => {
        const browser = await createBrowser(`/vulnerabilities?${new URLSearchParams({ [name]: value })}`);
        const field = name === 'product' ? 'category' : name;
        const expected = priorityRows.filter(row => !value || row[field] === value);
        await readAllPages(browser, expected);
        assert.ok(!browser.requests.includes(view.searchUrl));
      });
    }
  }
});

test('all sort modes preserve source order for equal keys across the complete dataset', async t => {
  for (const sort of selectOptions.sort) {
    await t.test(sort, async () => {
      const browser = await createBrowser(`/vulnerabilities?sort=${sort}`);
      await readAllPages(browser, [...view.rows].sort(comparators[sort]));
      assert.ok(!browser.requests.includes(view.searchUrl));
    });
  }
});

test('full-text search matches bodies and sources, uses AND, and handles no results', async t => {
  for (const q of ['chrome', 'CVE-2026', 'GitHub CNA', '32-bit', 'not-a-real-term']) {
    await t.test(q, async () => {
      const words = q.toLocaleLowerCase('ja').split(/\s+/);
      const expected = priorityRows.filter(row => words.every(word => searchText[row.id].includes(word)));
      if (q === 'GitHub CNA') {
        assert.ok(expected.length > 0);
        assert.ok(expected.some(row => !row.title.toLocaleLowerCase('ja').includes('github')),
          'The query must exercise source/body text beyond card titles');
        const anyWord = priorityRows.filter(row => words.some(word => searchText[row.id].includes(word)));
        assert.ok(anyWord.length > expected.length, 'The query distinguishes AND from OR');
      }
      const browser = await createBrowser(`/vulnerabilities?${new URLSearchParams({ q })}`);
      await readAllPages(browser, expected);
      assert.equal(browser.requests.filter(url => url === view.searchUrl).length, 1);
      if (!expected.length) assert.equal(browser.elements.get('result-count').textContent,
        `0件が一致 / 全${view.rows.length}件（このページ 0件）`);
    });
  }
});

test('a legacy record anchor opens its page, then Next clears the hash and Back/Forward stay correct', async () => {
  const target = priorityRows[pageSize].id;
  const anchoredUrl = `${origin}/vulnerabilities#${target}`;
  const browser = await createBrowser(`/vulnerabilities#${target}`);
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.href, anchoredUrl);
  assert.ok(browser.cards().find(card => card.id === target).scrolled);

  await browser.click('next-page');
  assertPage(browser, priorityRows, 3);
  assert.equal(browser.location.hash, '', 'The old record anchor must not override later page navigation');
  assert.equal(browser.location.search, '?page=3');
  assert.deepEqual(browser.historyEntries, [anchoredUrl, `${origin}/vulnerabilities?page=3`]);

  await browser.back();
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.href, anchoredUrl);
  await browser.forward();
  assertPage(browser, priorityRows, 3);
  assert.equal(browser.location.hash, '');
});

test('pagination retains a non-record section hash through Back and Forward', async () => {
  const browser = await createBrowser('/vulnerabilities#coverage-heading');
  await browser.click('next-page');
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.href, `${origin}/vulnerabilities?page=2#coverage-heading`);
  await browser.back();
  assertPage(browser, priorityRows);
  assert.equal(browser.location.hash, '#coverage-heading');
  await browser.forward();
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.hash, '#coverage-heading');
});

test('opened and subsequently closed disclosure details survive card reconstruction', async () => {
  const browser = await createBrowser();
  const target = browser.cards()[0].id;
  browser.cards()[0].querySelector('details').open = true;
  await browser.click('next-page');
  await browser.click('previous-page');
  assert.equal(browser.cards().find(card => card.id === target).querySelector('details').open, true);
  browser.cards().find(card => card.id === target).querySelector('details').open = false;
  await browser.click('next-page');
  await browser.click('previous-page');
  assert.equal(browser.cards().find(card => card.id === target).querySelector('details').open, false);
});

test('failed page chunks preserve visible cards and static links; Retry commits page=2 with valid history', async () => {
  const browser = await createBrowser();
  const firstPageHtml = browser.cards().map(card => card.outerHTML);
  let fail = true;
  browser.setFetch((url, realFetch) => fail ? { ok: false } : realFetch(url));
  await browser.click('next-page');

  assert.equal(browser.errorVisible(), true);
  assert.deepEqual(browser.cards().map(card => card.outerHTML), firstPageHtml);
  assert.deepEqual(browser.archiveLinks, staticArchiveLinks);
  const recoveryLinks = browser.elements.get('load-error').children.filter(child => child.tagName === 'A');
  assert.deepEqual(recoveryLinks.map(link => link.href),
    pageRows(priorityRows, 2).map(row => `${row.archive}#${row.id}`));
  assert.deepEqual(browser.historyEntries, [`${origin}/vulnerabilities`], 'Failed navigation is not committed');

  fail = false;
  await browser.retry();
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.href, `${origin}/vulnerabilities?page=2`);
  assert.deepEqual(browser.historyEntries, [`${origin}/vulnerabilities`, `${origin}/vulnerabilities?page=2`]);
  assert.equal(browser.historyPosition, 1);
  const failedChunk = priorityRows[pageSize].chunk;
  assert.equal(browser.requests.filter(url => url === failedChunk).length, 2, 'Failed fetches are evicted for Retry');
  await browser.back();
  assertPage(browser, priorityRows);
  await browser.forward();
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.search, '?page=2');
});

test('Retry preserves a failed search query from either the URL or a changed control', async t => {
  const q = 'GitHub CNA';
  const expected = priorityRows.filter(row => q.toLocaleLowerCase('ja').split(/\s+/)
    .every(word => searchText[row.id].includes(word)));
  for (const fromUrl of [true, false]) {
    await t.test(fromUrl ? 'initial URL search' : 'changed search control', async () => {
      let fail = true;
      const fetchOverride = (url, realFetch) => url === view.searchUrl && fail ? { ok: false } : realFetch(url);
      const browser = await createBrowser(fromUrl ? `/vulnerabilities?${new URLSearchParams({ q })}` : '/vulnerabilities',
        { fetchOverride });
      if (!fromUrl) await browser.change('q', q);
      assert.equal(browser.errorVisible(), true);
      assert.equal(browser.elements.get('q').value, q);
      assert.deepEqual(browser.visibleIds(), ids(pageRows(priorityRows)));
      fail = false;
      await browser.retry();
      assertPage(browser, expected);
      assert.equal(browser.elements.get('q').value, q);
      assert.equal(browser.location.search, `?${new URLSearchParams({ q })}`);
      assert.equal(browser.historyEntries.length, 1, 'Search retry replaces the current entry');
      assert.equal(browser.requests.filter(url => url === view.searchUrl).length, 2);
    });
  }
});

test('a stale full-text index response cannot overwrite a newer cleared search', { timeout: 3_000 }, async () => {
  const browser = await createBrowser();
  const pending = deferred();
  const started = deferred();
  const response = { ok: true, json: async () => searchText };
  browser.setFetch((url, realFetch) => {
    if (url !== view.searchUrl) return realFetch(url);
    started.resolve();
    return pending.promise;
  });
  browser.startChange('q', 'chrome');
  await started.promise;
  await browser.change('q', '');
  assertPage(browser, priorityRows);
  pending.resolve(response);
  await flushUpdates();
  assertPage(browser, priorityRows);
  assert.equal(browser.location.search, '');
  assert.equal(browser.elements.get('q').value, '');
});

test('a stale page chunk cannot overwrite a newer metadata filter', { timeout: 3_000 }, async () => {
  const browser = await createBrowser();
  const chunkUrl = priorityRows[pageSize].chunk;
  const chunk = await readJson(chunkUrl);
  const pending = deferred();
  const started = deferred();
  browser.setFetch((url, realFetch) => {
    if (url !== chunkUrl) return realFetch(url);
    started.resolve();
    return pending.promise;
  });
  browser.startClick('next-page');
  await started.promise;
  browser.startChange('product', 'windows');
  pending.resolve({ ok: true, json: async () => chunk });
  await browser.settle();
  await flushUpdates();
  const expected = priorityRows.filter(row => row.category === 'windows');
  assertPage(browser, expected);
  assert.equal(browser.location.search, '?product=windows');
  assert.equal(browser.elements.get('product').value, 'windows');
  assert.equal(browser.historyEntries.length, 1, 'The superseded page request must not push history');
});

test('a validated interactive view collapses the initially open static archive', async () => {
  const browser = await createBrowser();
  assert.equal(browser.elements.get('archive-index').getAttribute('open'), undefined);
  assert.deepEqual(browser.archiveLinks, staticArchiveLinks);
  assert.equal(browser.requests.length, 0);
});

test('invalid manifest leaves the static legacy targets open and readable', async t => {
  for (const manifest of ['invalid JSON', { ...view, version: 2 }]) {
    await t.test(typeof manifest === 'string' ? 'malformed JSON' : 'unsupported schema', async () => {
      const browser = await createBrowser('/vulnerabilities#cve-2026-18022', { manifest });
      assert.equal(browser.elements.get('archive-index').getAttribute('open'), '');
      assert.ok(browser.fallbackTargets.some(target => target.id === 'cve-2026-18022'));
      assert.deepEqual(browser.archiveLinks, staticArchiveLinks);
      assert.equal(browser.elements.get('filters').hidden, true);
      assert.equal(browser.requests.length, 0);
    });
  }
});


test('upper and lower pagers share query, sorting, disabled boundaries and history', async () => {
  const browser = await createBrowser();
  assertPage(browser, priorityRows);
  await browser.click('previous-page-top');
  assertPage(browser, priorityRows);
  assert.equal(browser.historyEntries.length, 1);
  await browser.click('next-page-top');
  assertPage(browser, priorityRows, 2);
  assert.equal(browser.location.search, '?page=2');
  await browser.click('next-page');
  assertPage(browser, priorityRows, 3);
  await browser.back();
  assertPage(browser, priorityRows, 2);
  await browser.forward();
  assertPage(browser, priorityRows, 3);
  await browser.change('product', 'windows');
  assertPage(browser, priorityRows.filter(row => row.category === 'windows'));
  await browser.change('sort', 'severity');
  assertPage(browser, [...view.rows].filter(row => row.category === 'windows').sort(comparators.severity));
  await browser.change('product', '');
  await browser.change('sort', 'priority');
  await browser.change('q', 'not-a-real-term');
  assertPage(browser, []);
  await browser.change('q', '');
  assertPage(browser, priorityRows);
  const last = Math.ceil(priorityRows.length / pageSize);
  while (browser.elements.get('page-status-top').textContent !== `${last} / ${last}ページ`) await browser.click('next-page-top');
  assertPage(browser, priorityRows, last);
  const before = browser.historyEntries;
  await browser.click('next-page-top');
  assertPage(browser, priorityRows, last);
  assert.deepEqual(browser.historyEntries, before);
});
