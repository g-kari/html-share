(() => {
  'use strict';
  const form = document.getElementById('filters');
  const list = document.getElementById('advisories');
  let view;
  try {
    view = JSON.parse(document.getElementById('vulnerability-view-data').textContent);
    if (view.version !== 1 || !Array.isArray(view.rows) || view.pageSize !== 20) return;
  } catch { return; } // Keep the static first page and archive usable.
  const controls = ['q', 'product', 'exploitation', 'severity', 'sort'];
  const byId = new Map(view.rows.map(row => [row.id, row]));
  const cards = new Map([...list.querySelectorAll('.advisory')].map(el => [el.id, el.outerHTML]));
  const requests = new Map();
  const pagination = document.getElementById('pagination');
  const failure = document.getElementById('load-error');
  let page = 1;
  let generation = 0;
  let text;
  let debounce;
  // Legacy fragment targets in the static archive index must not duplicate cards.
  document.querySelectorAll('[data-fallback-id]').forEach(el => el.removeAttribute('id'));
  async function getJson(url) {
    if (!requests.has(url)) {
      const promise = fetch(url).then(response => {
        if (!response.ok) throw new Error('Failed to load');
        return response.json();
      }).catch(error => { requests.delete(url); throw error; });
      requests.set(url, promise);
    }
    return requests.get(url);
  }
  function readUrl() {
    const params = new URLSearchParams(location.search);
    for (const name of controls) {
      const el = document.getElementById(name);
      el.value = params.get(name) ?? (name === 'sort' ? 'priority' : '');
      if (el.tagName === 'SELECT' && !el.value) el.value = name === 'sort' ? 'priority' : '';
    }
    page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  }
  function syncUrl(push, keepRecordHash) {
    const url = new URL(location.href);
    if (!keepRecordHash && byId.has(hashId())) url.hash = '';
    for (const name of controls) {
      const value = document.getElementById(name).value;
      if (value && (name !== 'sort' || value !== 'priority')) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    if (page > 1) url.searchParams.set('page', page); else url.searchParams.delete('page');
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  function hashId() {
    try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
  }
  function showFailure(rows, sync, push, revealHash) {
    failure.replaceChildren(document.createTextNode('本文を読み込めませんでした。再試行するか、静的な分割ページで読めます。 '));
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '再試行'; retry.addEventListener('click', () => update(sync, push, revealHash)); failure.append(retry);
    for (const row of rows) {
      const link = document.createElement('a'); link.href = row.archive + '#' + row.id; link.textContent = row.title; failure.append(document.createElement('br'), link);
    }
    failure.hidden = false;
  }
  async function update(sync = true, push = false, revealHash = false) {
    const token = ++generation;
    const values = Object.fromEntries(controls.map(name => [name, document.getElementById(name).value]));
    const words = values.q.trim().toLocaleLowerCase('ja').split(/\s+/).filter(Boolean);
    list.setAttribute('aria-busy', 'true'); failure.hidden = true;
    let selected = [];
    try {
      if (words.length && !text) text = await getJson(view.searchUrl);
      if (token !== generation) return;
      let filtered = view.rows.filter(row => words.every(word => text[row.id].includes(word)) && (!values.product || row.category === values.product) && (!values.exploitation || row.exploitation === values.exploitation) && (!values.severity || row.severity === values.severity));
      const compare = (a, b) => values.sort === 'date' ? b.date.localeCompare(a.date) : values.sort === 'severity' ? b.cvss - a.cvss : a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date);
      filtered = [...filtered].sort(compare);
      const id = revealHash ? hashId() : '';
      if (byId.has(id)) {
        if (!filtered.some(row => row.id === id)) {
          for (const name of controls) document.getElementById(name).value = name === 'sort' ? 'priority' : '';
          filtered = [...view.rows].sort((a, b) => a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date));
          sync = true;
        }
        page = Math.floor(filtered.findIndex(row => row.id === id) / view.pageSize) + 1;
      }
      const pages = Math.max(1, Math.ceil(filtered.length / view.pageSize));
      page = Math.min(Math.max(1, page), pages);
      selected = filtered.slice((page - 1) * view.pageSize, page * view.pageSize);
      await Promise.all([...new Set(selected.filter(row => !cards.has(row.id)).map(row => row.chunk))].map(async url => {
        const data = await getJson(url);
        if (data.version !== 1 || !Array.isArray(data.cards)) throw new Error('Invalid details');
        for (const card of data.cards) if (byId.has(card.id) && typeof card.html === 'string') cards.set(card.id, card.html);
      }));
      if (token !== generation) return;
      if (selected.some(row => !cards.has(row.id))) throw new Error('Missing details');
      for (const el of list.querySelectorAll('.advisory')) cards.set(el.id, el.outerHTML);
      list.innerHTML = selected.map(row => cards.get(row.id)).join('\n');
      document.getElementById('result-count').textContent = filtered.length.toLocaleString('ja-JP') + '件が一致 / 全' + view.rows.length + '件（このページ ' + selected.length + '件）';
      document.getElementById('empty').hidden = filtered.length > 0;
      document.getElementById('page-status').textContent = page + ' / ' + pages + 'ページ';
      document.getElementById('previous-page').disabled = page <= 1;
      document.getElementById('next-page').disabled = page >= pages;
      pagination.hidden = filtered.length <= view.pageSize;
      if (sync) syncUrl(push, revealHash);
      if (id) document.getElementById(id)?.scrollIntoView();
    } catch {
      if (token === generation) {
        document.getElementById('result-count').textContent = '読み込みに失敗しました。表示済みの本文と分割ページは読めます。';
        showFailure(selected.length ? selected : [byId.get(hashId())].filter(Boolean), sync, push, revealHash);
      }
    } finally { if (token === generation) list.removeAttribute('aria-busy'); }
  }
  function changed(event) {
    clearTimeout(debounce); page = 1;
    if (event.type === 'input' && event.target.id === 'q') debounce = setTimeout(() => update(), 160);
    else update();
  }
  readUrl(); form.hidden = false; document.body.classList.add('js'); update(false, false, true);
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);
  form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounce); page = 1; update(); });
  form.addEventListener('reset', () => { clearTimeout(debounce); setTimeout(() => { page = 1; update(); }, 0); });
  document.getElementById('previous-page').addEventListener('click', () => { page--; update(true, true); document.getElementById('advisories-heading').scrollIntoView(); });
  document.getElementById('next-page').addEventListener('click', () => { page++; update(true, true); document.getElementById('advisories-heading').scrollIntoView(); });
  window.addEventListener('popstate', () => { clearTimeout(debounce); readUrl(); update(false, false, true); });
  window.addEventListener('hashchange', () => { clearTimeout(debounce); update(false, false, true); });
})();
