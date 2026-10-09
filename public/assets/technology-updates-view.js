(() => {
  'use strict';
  const form = document.getElementById('filters');
  const list = document.getElementById('update-cards');
  const status = document.getElementById('filter-status');
  const empty = document.getElementById('empty');
  const failure = document.getElementById('load-error');
  const pager = document.getElementById('pagination');
  const previous = document.getElementById('previous-page');
  const next = document.getElementById('next-page');
  const pageStatus = document.getElementById('page-status');
  const fields = { q: document.getElementById('query'), category: document.getElementById('category'), tag: document.getElementById('tag'), month: document.getElementById('month') };
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ja');
  const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(value);
  const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const shortString = (value, limit = 240) => typeof value === 'string' && value.length > 0 && value.length <= limit;
  const dataRoot = '/assets/technology-updates/';
  const chunkLimit = 8;
  let config;
  let initialCards;
  function dataUrl(value) {
    if (typeof value !== 'string') throw new Error('Invalid data URL');
    const url = new URL(value, location.href);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== location.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(dataRoot) || !url.pathname.endsWith('.json')) throw new Error('Invalid data URL');
    return url.pathname;
  }
  function archiveUrl(value) {
    if (typeof value !== 'string') throw new Error('Invalid archive URL');
    const url = new URL(value, location.href);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== location.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith('/technology-updates')) throw new Error('Invalid archive URL');
    return url.pathname;
  }
  try {
    config = JSON.parse(document.getElementById('technology-view-data').textContent);
    if (!form || !list || !status || !empty || !failure || !pager || !previous || !next || !pageStatus || Object.values(fields).some(field => !field) || !plainObject(config) || config.version !== 1 || config.pageSize !== 12 || !Number.isSafeInteger(config.total) || config.total < 0 || config.total > 100000 || !Array.isArray(config.initialIds) || config.initialIds.length !== Math.min(config.total, config.pageSize) || config.initialIds.some(id => !validId(id)) || new Set(config.initialIds).size !== config.initialIds.length) throw new Error('Invalid view configuration');
    config.manifestUrl = dataUrl(config.manifestUrl);
    const initial = [...list.querySelectorAll('.update')];
    if (initial.length !== config.initialIds.length || initial.some((card, index) => card.id !== config.initialIds[index])) throw new Error('Invalid initial cards');
    initialCards = new Map(initial.map(card => [card.id, card.outerHTML]));
  } catch {
    if (form) form.hidden = true;
    if (pager) pager.hidden = true;
    return; // The static first page and archive remain available.
  }

  let manifest;
  let manifestRequest;
  let search;
  let searchRequest;
  const chunkCache = new Map();
  const requests = new Map();
  let generation = 0;
  let debounce;
  let current = readUrl();
  let visibleCards = new Map(initialCards);
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  pageStatus.setAttribute('aria-live', 'polite');
  failure.setAttribute('role', 'alert');

  function readUrl() {
    const params = new URLSearchParams(location.search);
    const rawPage = params.get('page') || '1';
    return {
      q: (params.get('q') || '').slice(0, 300),
      category: (params.get('category') || '').slice(0, 120),
      tag: (params.get('tag') || '').slice(0, 120),
      month: (params.get('month') || '').slice(0, 7),
      page: /^\d+$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Math.max(1, Number(rawPage)) : 1,
    };
  }
  function applyControls(values) {
    for (const name of Object.keys(fields)) fields[name].value = values[name];
  }
  function hashId() {
    try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
  }
  function recordId(id, byId = manifest?.byId) {
    if (byId?.has(id) || initialCards.has(id)) return id;
    const alias = id.startsWith('title-') ? id.slice(6) : '';
    return alias && (byId?.has(alias) || initialCards.has(alias)) ? alias : '';
  }
  function hasCriteria(values) { return Boolean(values.q.trim() || values.category || values.tag || values.month || values.page !== 1); }
  function syncUrl(values, push, keepHash) {
    const url = new URL(location.href);
    for (const name of Object.keys(fields)) {
      const value = name === 'q' ? values[name].trim() : values[name];
      if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
    }
    if (values.page > 1) url.searchParams.set('page', String(values.page)); else url.searchParams.delete('page');
    if (!keepHash && recordId(hashId())) url.hash = '';
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  async function getJson(url) {
    if (!requests.has(url)) {
      const promise = (async () => {
        const response = await fetch(url, { credentials: 'same-origin', mode: 'same-origin', redirect: 'error' });
        if (!response.ok || (response.url && dataUrl(response.url) !== url)) throw new Error('Failed to load data');
        const type = response.headers?.get('content-type');
        if (type && !/^(?:application\/(?:json|[a-z0-9.+-]+\+json))(?:\s*;|$)/i.test(type)) throw new Error('Invalid data type');
        const length = Number(response.headers?.get('content-length') || 0);
        if (length > 50000000) throw new Error('Data is too large');
        return response.json();
      })();
      requests.set(url, promise);
      promise.finally(() => { if (requests.get(url) === promise) requests.delete(url); }).catch(() => {});
    }
    return requests.get(url);
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validateManifest(data) {
    if (!plainObject(data) || data.version !== 1 || data.pageSize !== config.pageSize || !Array.isArray(data.rows) || data.rows.length !== config.total || !Array.isArray(data.tags) || !Array.isArray(data.months)) throw new Error('Invalid manifest');
    const tags = new Map();
    for (const tag of data.tags) {
      if (!plainObject(tag) || !validId(tag.id) || !shortString(tag.label, 120) || !shortString(tag.kind, 80) || tags.has(tag.id)) throw new Error('Invalid tags');
      tags.set(tag.id, { id: tag.id, label: tag.label, kind: tag.kind });
    }
    if (data.months.some(month => typeof month !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) || new Set(data.months).size !== data.months.length) throw new Error('Invalid months');
    const byId = new Map();
    const byChunk = new Map();
    const rows = data.rows.map(row => {
      if (!plainObject(row) || !validId(row.id) || byId.has(row.id) || !shortString(row.title, 1000) || !validDate(row.date) || !shortString(row.category, 120) || !Array.isArray(row.tags) || !data.months.includes(row.date.slice(0, 7))) throw new Error('Invalid record metadata');
      const rowTags = new Set();
      for (const tag of row.tags) {
        const canonical = plainObject(tag) && tags.get(tag.id);
        if (!canonical || canonical.label !== tag.label || canonical.kind !== tag.kind || rowTags.has(tag.id)) throw new Error('Invalid record tags');
        rowTags.add(tag.id);
      }
      const result = { id: row.id, title: row.title, date: row.date, category: row.category, tags: row.tags.map(tag => tags.get(tag.id)), chunk: dataUrl(row.chunk), archive: archiveUrl(row.archive) };
      byId.set(row.id, result);
      if (!byChunk.has(result.chunk)) byChunk.set(result.chunk, new Set());
      byChunk.get(result.chunk).add(result.id);
      return result;
    }).sort((a, b) => b.date.localeCompare(a.date));
    if (config.initialIds.some((id, index) => rows[index]?.id !== id)) throw new Error('Manifest does not match initial cards');
    return { rows, byId, byChunk, tags: [...tags.values()], months: [...data.months], searchUrl: dataUrl(data.searchUrl) };
  }
  function fillOptions(field, values, label) {
    const all = document.createElement('option');
    all.value = ''; all.textContent = label;
    const options = values.map(value => {
      const option = document.createElement('option');
      option.value = typeof value === 'string' ? value : value.id;
      option.textContent = typeof value === 'string' ? value : value.label;
      return option;
    });
    field.replaceChildren(all, ...options);
  }
  async function getManifest() {
    if (manifest) return manifest;
    if (!manifestRequest) {
      manifestRequest = getJson(config.manifestUrl).then(validateManifest).then(data => {
        manifest = data;
        fillOptions(fields.tag, data.tags, 'すべてのタグ');
        fillOptions(fields.month, data.months, 'すべての月');
        applyControls(current);
        return data;
      }).catch(error => { manifestRequest = undefined; throw error; });
    }
    return manifestRequest;
  }
  async function getSearch(data) {
    if (search) return search;
    if (!searchRequest) {
      searchRequest = getJson(data.searchUrl).then(value => {
        if (!plainObject(value) || Object.keys(value).length !== data.rows.length) throw new Error('Invalid search data');
        const result = new Map();
        for (const [id, text] of Object.entries(value)) {
          if (!data.byId.has(id) || typeof text !== 'string' || text.length > 200000) throw new Error('Invalid search text');
          result.set(id, normalize(text));
        }
        search = result;
        return result;
      }).catch(error => { searchRequest = undefined; throw error; });
    }
    return searchRequest;
  }
  function parseCard(html, id) {
    if (typeof html !== 'string' || html.length > 200000) throw new Error('Invalid card body');
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const roots = [...template.content.childNodes].filter(node => node.nodeType !== 8 && !(node.nodeType === 3 && !node.textContent.trim()));
    const article = roots[0];
    if (roots.length !== 1 || article.nodeType !== 1 || article.tagName !== 'ARTICLE' || article.id !== id || !article.classList.contains('update')) throw new Error('Invalid card root');
    const allowed = new Set(['ARTICLE', 'HEADER', 'FOOTER', 'DIV', 'SPAN', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'A', 'TIME', 'STRONG', 'EM', 'B', 'I', 'SMALL', 'BR', 'CODE', 'PRE', 'DETAILS', 'SUMMARY', 'CITE', 'BLOCKQUOTE']);
    const titleId = `title-${id}`;
    const labelledBy = article.getAttribute('aria-labelledby');
    if (labelledBy && labelledBy !== titleId) throw new Error('Invalid card label');
    let titleCount = 0;
    for (const node of [article, ...article.querySelectorAll('*')]) {
      if (!allowed.has(node.tagName) || (node !== article && node.tagName === 'ARTICLE')) throw new Error('Invalid card contents');
      if (node !== article && node.id) {
        if (node.tagName !== 'H3' || node.id !== titleId || labelledBy !== titleId || ++titleCount !== 1) throw new Error('Invalid card heading');
      }
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || ['src', 'srcdoc', 'style', 'action', 'formaction'].includes(attribute.name.toLowerCase())) throw new Error('Invalid card attribute');
        if (attribute.name.toLowerCase() === 'href') {
          const url = new URL(attribute.value, location.href);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid card link');
        }
      }
    }
    if (labelledBy && titleCount !== 1) throw new Error('Missing card heading');
    return article;
  }
  async function getChunk(url, data) {
    if (chunkCache.has(url)) {
      const result = chunkCache.get(url);
      chunkCache.delete(url); chunkCache.set(url, result);
      return result;
    }
    const value = await getJson(url);
    const expected = data.byChunk.get(url);
    if (!plainObject(value) || value.version !== 1 || !Array.isArray(value.cards) || value.cards.length !== expected.size || value.cards.length > config.pageSize) throw new Error('Invalid card chunk');
    const cards = new Map();
    for (const card of value.cards) {
      if (!plainObject(card) || !expected.has(card.id) || cards.has(card.id)) throw new Error('Invalid chunk card');
      parseCard(card.html, card.id);
      cards.set(card.id, card.html);
    }
    chunkCache.delete(url); chunkCache.set(url, cards);
    while (chunkCache.size > chunkLimit) chunkCache.delete(chunkCache.keys().next().value);
    return cards;
  }
  function renderPager(count, page) {
    const pages = Math.max(1, Math.ceil(count / config.pageSize));
    pageStatus.textContent = `${page} / ${pages}ページ`;
    previous.disabled = page <= 1;
    next.disabled = page >= pages;
    pager.hidden = count <= config.pageSize;
  }
  function showFailure(rows, values, options) {
    failure.replaceChildren(document.createTextNode('読み込めませんでした。表示済みの記事はそのまま読めます。再試行するか、静的な月別アーカイブをご利用ください。 '));
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = '再試行';
    retry.addEventListener('click', () => update(values, options));
    failure.append(retry);
    for (const row of rows) {
      const link = document.createElement('a');
      link.href = row.archive + '#' + row.id; link.textContent = row.title;
      failure.append(document.createElement('br'), link);
    }
    failure.hidden = false;
    status.textContent = '読み込みに失敗しました。表示済みの記事と月別アーカイブは読めます。';
  }
  async function update(values = current, options = {}) {
    const token = ++generation;
    const wanted = { ...values };
    let selected = [];
    list.setAttribute('aria-busy', 'true');
    failure.hidden = true;
    status.textContent = '記事を読み込んでいます…';
    try {
      const data = await getManifest();
      if (token !== generation) return;
      // Unknown URL filter values are discarded only after lazy metadata is ready.
      if (!data.rows.some(row => row.category === wanted.category)) wanted.category = '';
      if (!data.tags.some(tag => tag.id === wanted.tag)) wanted.tag = '';
      if (!data.months.includes(wanted.month)) wanted.month = '';
      const words = normalize(wanted.q).trim().split(/\s+/).filter(Boolean);
      const text = words.length ? await getSearch(data) : undefined;
      if (token !== generation) return;
      let filtered = data.rows.filter(row => (!wanted.category || row.category === wanted.category) && (!wanted.tag || row.tags.some(tag => tag.id === wanted.tag)) && (!wanted.month || row.date.startsWith(wanted.month)) && words.every(word => text.get(row.id).includes(word)));
      const id = options.revealHash ? hashId() : '';
      let forceSync = ['category', 'tag', 'month'].some(name => wanted[name] !== values[name]);
      const targetId = recordId(id, data.byId);
      if (targetId) {
        if (!filtered.some(row => row.id === targetId)) {
          wanted.q = wanted.category = wanted.tag = wanted.month = '';
          filtered = data.rows;
          forceSync = true;
        }
        wanted.page = Math.floor(filtered.findIndex(row => row.id === targetId) / config.pageSize) + 1;
      }
      const pages = Math.max(1, Math.ceil(filtered.length / config.pageSize));
      const clamped = Math.min(Math.max(1, wanted.page), pages);
      if (clamped !== wanted.page) forceSync = true;
      wanted.page = clamped;
      selected = filtered.slice((wanted.page - 1) * config.pageSize, wanted.page * config.pageSize);
      // Only retain a single visible page, the initial page, and eight generated chunks.
      visibleCards = new Map([...list.querySelectorAll('.update')].map(card => [card.id, card.outerHTML]));
      for (const [id, html] of visibleCards) if (initialCards.has(id)) initialCards.set(id, html);
      const needed = [...new Set(selected.filter(row => !visibleCards.has(row.id) && !initialCards.has(row.id)).map(row => row.chunk))];
      const loaded = new Map(await Promise.all(needed.map(async url => [url, await getChunk(url, data)])));
      if (token !== generation) return;
      const bodies = selected.map(row => visibleCards.get(row.id) || initialCards.get(row.id) || loaded.get(row.chunk)?.get(row.id));
      const articles = bodies.map((html, index) => parseCard(html, selected[index].id));
      if (token !== generation) return;
      list.replaceChildren(...articles);
      visibleCards = new Map(selected.map((row, index) => [row.id, bodies[index]]));
      current = wanted;
      applyControls(current);
      status.textContent = `${filtered.length.toLocaleString('ja-JP')}件が一致 / 全${config.total.toLocaleString('ja-JP')}件（このページ ${selected.length}件）`;
      empty.hidden = filtered.length > 0;
      renderPager(filtered.length, current.page);
      if (options.sync !== false || forceSync) syncUrl(current, Boolean(options.push) && !forceSync, Boolean(options.revealHash));
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
      if (options.scroll) document.getElementById('updates')?.scrollIntoView({ block: 'start' });
    } catch {
      if (token === generation) showFailure(selected.length ? selected : [manifest?.byId.get(recordId(hashId()))].filter(Boolean), wanted, options);
    } finally {
      if (token === generation) list.removeAttribute('aria-busy');
    }
  }
  function changed(event) {
    const name = Object.keys(fields).find(name => fields[name] === event.target);
    if (!name) return;
    clearTimeout(debounce);
    ++generation; // Invalidate pending responses immediately, including during debounce.
    failure.hidden = true;
    current = { ...current, [name]: event.target.value.slice(0, name === 'q' ? 300 : 120), page: 1 };
    if (event.type === 'input' && name === 'q') {
      list.setAttribute('aria-busy', 'true');
      debounce = setTimeout(() => update(current, { push: false }), 160);
    } else update(current, { push: true });
  }
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  form.addEventListener('focusin', event => {
    if (!manifest && (event.target === fields.tag || event.target === fields.month)) {
      clearTimeout(debounce);
      update(current, { sync: false });
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault(); clearTimeout(debounce);
    current = { ...current, page: 1 };
    update(current, { push: true });
  });
  form.addEventListener('reset', () => {
    clearTimeout(debounce); ++generation;
    list.setAttribute('aria-busy', 'true');
    setTimeout(() => {
      current = { q: '', category: '', tag: '', month: '', page: 1 };
      applyControls(current); update(current, { push: true });
    }, 0);
  });
  previous.addEventListener('click', () => { clearTimeout(debounce); current = { ...current, page: current.page - 1 }; update(current, { push: true, scroll: true }); });
  next.addEventListener('click', () => { clearTimeout(debounce); current = { ...current, page: current.page + 1 }; update(current, { push: true, scroll: true }); });
  window.addEventListener('popstate', () => { clearTimeout(debounce); current = readUrl(); applyControls(current); update(current, { sync: false, revealHash: true }); });
  window.addEventListener('hashchange', () => { clearTimeout(debounce); update(current, { sync: false, revealHash: true }); });
  applyControls(current);
  form.hidden = false;
  renderPager(config.total, 1);
  empty.hidden = config.total > 0;
  status.textContent = `全${config.total.toLocaleString('ja-JP')}件（このページ ${config.initialIds.length}件）`;
  const id = hashId();
  if (hasCriteria(current) || (id && !document.getElementById(id))) update(current, { sync: false, revealHash: true });
  else if (recordId(id)) document.getElementById(id)?.scrollIntoView({ block: 'start' });
})();
