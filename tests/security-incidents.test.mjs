import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { decodeHTML } from 'entities';

const html = await readFile(new URL('../public/security-incidents.html', import.meta.url), 'utf8');
const register = JSON.parse(html.match(/<script id="incident-register" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const types = ['external_attack', 'insider_abuse', 'operational_error', 'unknown'];
const byId = new Map(register.incidents.map(item => [item.id, item]));

function elements(pattern) {
  return [...html.matchAll(pattern)].map(match => ({
    dataset: Object.fromEntries([...match[1].matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(([, key, value]) => [key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), decodeHTML(value)])),
    hidden: false,
  }));
}
const cardElements = elements(/<article class="card" ([^>]+)>/g);
const rowElements = elements(/<tr (data-cause-types="[^>]+)>/g);
const sourceUrls = register.incidents.flatMap(item => item.sources.map(source => source.url));
function canonicalJSON(value) {
  if (Array.isArray(value)) return '['+value.map(canonicalJSON).join(', ')+']';
  if (value !== null && typeof value === 'object') return '{'+Object.keys(value).sort().map(key => JSON.stringify(key)+': '+canonicalJSON(value[key])).join(', ')+'}';
  return JSON.stringify(value);
}

test('cause taxonomy covers each unique incident and counts overlapping membership', () => {
  assert.equal(byId.size, register.incidents.length);
  assert.equal(register.cause_taxonomy.categories.length, 4);
  assert.equal(cardElements.length, register.incidents.length);
  assert.equal(rowElements.length, register.incidents.length);
  for (const item of register.incidents) {
    assert.ok(item.cause_types.length > 0, item.id);
    assert.equal(new Set(item.cause_types).size, item.cause_types.length, item.id);
    assert.ok(item.cause_types.every(type => types.includes(type)), item.id);
    assert.ok(!item.cause_types.includes('unknown') || item.cause_types.length === 1, item.id);
    assert.ok(item.cause_type_basis.status && item.cause_type_basis.note, item.id);
    const official = item.sources.filter(source => source.type === 'official').map(source => source.url);
    assert.ok(item.cause_type_basis.source_urls.length > 0, item.id);
    assert.ok(item.cause_type_basis.source_urls.every(url => official.includes(url)), item.id);
    const canonical = Object.fromEntries(Object.entries(item).filter(([key]) => !['fingerprint','checked_at','last_content_change'].includes(key)));
    assert.equal(item.fingerprint, createHash('sha256').update(canonicalJSON(canonical)).digest('hex'), item.id);
  }
  for (const type of types) assert.equal(register.cause_taxonomy.counts[type], register.incidents.filter(item => item.cause_types.includes(type)).length);
  assert.equal(register.cause_taxonomy.multiple_category_cases, register.incidents.filter(item => item.cause_types.length > 1).length);
  assert.equal(register.coverage.source_entries, sourceUrls.length);
  assert.equal(register.coverage.unique_sources, new Set(sourceUrls).size);
});

test('important examples separate malicious activity, accidents, and explicitly reported mixed causes', () => {
  for (const id of ['toppan-misdelivery-20260901','line-games-ad-20220525','tokyo-tda-2026']) assert.deepEqual(byId.get(id).cause_types, ['operational_error']);
  assert.deepEqual(byId.get('ntt-west-insider-20231017').cause_types, ['insider_abuse','operational_error']);
  for (const id of ['campfire-2026','coastline-sumareji-app-2026','shueisha-hpc-20260909']) assert.deepEqual(byId.get(id).cause_types, ['external_attack','operational_error']);
  for (const id of ['lawson-2026-mail','digital-gss-20260625','gyazo-20260911','ieej-m365-20260729']) assert.deepEqual(byId.get(id).cause_types, ['external_attack']);
  assert.match(byId.get('shueisha-hpc-20260909').cause_type_basis.status, /暫定/);
  assert.match(byId.get('equifax-20170513').cause_type_basis.status, /申立て/);
  assert.equal(byId.get('lawson-2026-mail').cause_key, 'unknown');
});

test('cards and table rows have matching classification/search data and visible labels', () => {
  for (let index = 0; index < register.incidents.length; index++) {
    const item = register.incidents[index];
    assert.deepEqual(cardElements[index].dataset, rowElements[index].dataset, item.id);
    assert.deepEqual(cardElements[index].dataset.causeTypes.split(' '), item.cause_types, item.id);
    for (const type of item.cause_types) assert.ok(cardElements[index].dataset.search.includes(register.cause_taxonomy.categories.find(category => category.id === type).label.toLowerCase()), item.id);
    const card = html.match(new RegExp('<article class="card" id="'+item.id+'"[\\s\\S]*?<\\/article>'))[0];
    assert.match(card, /class="tag cause-type /);
    assert.match(card, /原因の確度：/);
    assert.match(card, /分類の根拠：/);
  }
  assert.match(html, /<label for="cause-type">原因の種類<select id="cause-type" name="cause-type" aria-describedby="cause-type-help">/);
  assert.match(html, /id="result-count"|aria-live="polite"/);
  assert.match(html, /<noscript>/);
});

test('every cause type composes with region, certainty, year/month, and normalized search', () => {
  const handlers = new Map();
  function control(id, value = 'all') {
    return { value, textContent:'', hidden:false, addEventListener(event, handler) { handlers.set(id+':'+event,handler); } };
  }
  const controls = Object.fromEntries(['search','period','month','cause-type','result-count','empty','reset'].map(id => [id,control(id,id === 'search' ? '' : 'all')]));
  const buttons = [...html.matchAll(/<button[^>]*data-filter="([^"]+)" data-filter-group="([^"]+)"[^>]*>/g)].map(([,value,group]) => ({ dataset:{filter:value,filterGroup:group}, pressed:value === 'all', setAttribute(key,value) { this.pressed=value==='true'; }, addEventListener(event,handler) { this.click=handler; } }));
  const document = { documentElement:{classList:{add(){}}}, getElementById(id){return controls[id];}, querySelectorAll(selector){return selector==='[data-filter]' ? buttons : selector==='.card' ? cardElements : selector==='tbody tr' ? rowElements : [];} };
  const context = vm.createContext({ document });
  const script = html.match(/<script>\s*(document.documentElement.classList.add\('js'\);[\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  function click(group,value) { buttons.find(button => button.dataset.filterGroup===group && button.dataset.filter===value).click(); }
  for (const type of ['all', ...types, 'multiple']) {
    for (const region of ['all','日本','海外']) {
      for (const certainty of ['all','known','unknown']) {
        for (const scope of ['all','2026','historical']) {
          for (const month of ['all','2026-04','2026-09','2026-10']) {
            controls['cause-type'].value=type; controls.period.value=scope; controls.month.value=month;
            click('region',region); click('certainty',certainty);
            const expected=register.incidents.filter(item => (type==='all'||(type==='multiple'?item.cause_types.length>1:item.cause_types.includes(type)))&&(region==='all'||item.region===region)&&(certainty==='all'||item.cause_key===certainty)&&(scope==='all'||item.scope===scope)&&(month==='all'||item.catalog_month===month)).length;
            assert.equal(cardElements.filter(card=>!card.hidden).length,expected,JSON.stringify({type,region,certainty,scope,month}));
            assert.equal(rowElements.filter(row=>!row.hidden).length,expected);
            assert.equal(controls.empty.hidden, expected>0);
          }
        }
      }
    }
  }
  handlers.get('reset:click')();
  controls.search.value='ＩＮＦＯＱ';handlers.get('search:input')();assert.equal(cardElements.filter(card=>!card.hidden).length,1);
  controls.search.value='not-a-real-incident';handlers.get('search:input')();assert.equal(cardElements.filter(card=>!card.hidden).length,0);
  handlers.get('reset:click')();assert.equal(cardElements.filter(card=>!card.hidden).length,register.incidents.length);
  assert.equal(controls['cause-type'].value,'all');
  assert.ok(buttons.filter(button=>button.dataset.filter==='all').every(button=>button.pressed));
});
