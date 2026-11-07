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
          for (const month of ['all','2026-04','2026-09','2026-10','2026-11']) {
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

test('November 6 additions distinguish publication dates, contract counts and possible exposure', () => {
  const docomo = byId.get('docomo-online-mydocomo-20261104');
  const muji = byId.get('ryohin-muji-app-store-20261030');
  const blast = byId.get('rakus-blastmail-20261020');
  for (const item of [docomo, muji, blast]) {
    assert.ok(item);
    assert.ok(item.sources.every(source => source.type === 'official'));
    assert.ok(html.includes(`id="${item.id}"`));
    assert.doesNotMatch(JSON.stringify(item), /turn\d+(search|view)\d+|L\d+-L\d+/);
  }
  assert.equal(docomo.disclosed, '2026-11-05');
  assert.match(docomo.count, /最大約30万件.*30万人とはしない/);
  assert.equal(muji.disclosed, '2026-10-30');
  assert.equal(muji.updated, '2026-11-04');
  assert.match(muji.count, /2,726万件.*109万件.*34.5万件.*120件.*非加算/);
  assert.match(muji.impact_status, /可能性/);
  assert.equal(blast.catalog_month, '2026-10');
  assert.match(blast.count, /421件.*契約件数/);
  assert.match(blast.response, /11月11日頃.*変動.*OEM.*未定/);
});

test('November 6 follow-ups separate restoration, corrected fields and authentication exposure', () => {
  const shippio = byId.get('shippio-platform-20261030');
  const pcs = byId.get('prestige-pcs-20261029');
  const chainalysis = byId.get('chainalysis-internal-tools-202610');
  assert.match(shippio.response, /11月5日9:20.*順次再開/);
  assert.match(shippio.impact, /ユーザー電話番号.*保有せず漏えいなし.*会社電話/);
  assert.deepEqual(pcs.cause_types, ['external_attack', 'operational_error']);
  assert.match(pcs.cause_type_basis.note, /PCSからの報告.*設定不備/);
  assert.match(pcs.count, /550万件.*6.5万件.*非加算/);
  assert.match(chainalysis.count, /全ユーザー.*パスワードハッシュ.*live token/);
  assert.match(chainalysis.impact, /不正アクセスがあったとみられる.*全ユーザーの平文パスワード窃取とは説明していない/);
  assert.match(chainalysis.timeline.find(event => event.date === '2026-11-05').text, /復旧開始を予定.*復旧実績は未確認/);
  assert.match(chainalysis.response, /段階的なアクセス復旧を開始.*Reactor・Data Solutionsは復旧作業中/);
});

test('November 7 domestic additions preserve counts, uncertainty and regulator-report timing', () => {
  const jnsa = byId.get('jnsa-literacy-check-20261030');
  const iris = byId.get('irisplaza-cloud-20261028');
  const smbc = byId.get('smbccf-guarantee-20261102');
  const lottery = byId.get('takarakuji-account-login-202611');
  const docomo = byId.get('docomo-online-mydocomo-20261104');
  assert.match(jnsa.count, /最大15,128件.*確定流出人数に読み替えない/);
  assert.match(jnsa.response, /個人情報保護委員会.*予定.*完了は未確認/);
  assert.equal(iris.disclosed, '2026-10-29');
  assert.match(iris.count, /580万人.*190万人.*770万人分.*実際.*調査中/);
  assert.match(iris.impact_status, /可能性/);
  assert.match(smbc.count, /最大320,118名.*加算しない/);
  assert.match(smbc.impact_status, /外部送信を確認.*調査中/);
  assert.match(lottery.count, /非公表/);
  assert.match(lottery.impact_status, /パスワード変更を確認.*閲覧の可能性/);
  assert.match(docomo.impact, /本人確認書類/);
  assert.match(docomo.count, /30万件.*30万人とはしない/);
  for (const item of [jnsa, iris, smbc, lottery, docomo]) {
    assert.ok(item.sources.every(source => source.type === 'official'));
    assert.ok(html.includes('id="' + item.id + '"'));
  }
});

test('November 7 overseas follow-ups preserve attribution, limited verification and history links', () => {
  const workos = byId.get('workos-sales-support-20261030');
  const phrase = byId.get('phrase-account-takeover-202608');
  const trigger = byId.get('triggerdev-environment-variables-20261101');
  assert.match(JSON.stringify(workos), /研究者.*AI/);
  assert.match(workos.impact, /顧客アカウント履歴/);
  assert.deepEqual(workos.cause_types, ['external_attack', 'operational_error']);
  assert.equal(phrase.disclosed, '2026-11-06');
  assert.match(phrase.impact_status, /全対象.*未確認/);
  for (const field of ['occurred', 'cause', 'count']) {
    assert.match(trigger[field], /11月6日の詳細報告本文は今回未確認/);
  }
  const changes = register.changes.filter(change => change.date === '2026-11-07' && change.kind !== 'official_maru_club_additions');
  assert.equal(changes.length, 3);
  const ids = new Set(changes.flatMap(change => change.incident_ids));
  assert.equal(ids.size, 11);
  for (const id of [
    'jnsa-literacy-check-20261030', 'irisplaza-cloud-20261028',
    'smbccf-guarantee-20261102', 'takarakuji-account-login-202611',
    'docomo-online-mydocomo-20261104', 'mdaq-wallex-20261028',
    'phrase-account-takeover-202608', 'chainalysis-internal-tools-202610',
    'northflank-control-plane-20261030', 'workos-sales-support-20261030',
    'triggerdev-environment-variables-20261101'
  ]) assert.ok(ids.has(id), id);
});

test('Maru-Jan and Club Tourism preserve distinct confirmed and possible exposure and restart scope', () => {
  const maru = byId.get('signaltalk-maru-jan-20261104');
  const club = byId.get('club-tourism-members-20261030');
  assert.equal(maru.disclosed, '2026-11-06');
  assert.match(maru.relevance, /詳報は11月7日/);
  assert.match(maru.count, /185万5578人分.*全会員.*メールアドレスは登録済み/);
  assert.match(maru.impact_status, /流出を確認/);
  assert.match(maru.impact, /保存形式は公表していない/);
  assert.match(maru.response, /11月7日16時.*再開.*旧パスワード.*他サービス.*変更/);
  assert.equal(club.disclosed, '2026-10-31');
  assert.equal(club.catalog_month, '2026-10');
  assert.match(club.count, /約432万件.*可能性.*確定流出人数に読み替えない/);
  assert.match(club.occurred, /5:45.*検知.*侵入開始日時ではない/);
  assert.match(club.impact, /ログインパスワード、旅券・カード情報、金融機関口座番号は含まれない/);
  assert.match(club.response, /写真大募集ページ.*停止継続.*新たな手続きは不要/);
  assert.match(club.relevance, /URLに1102.*本文の日付.*2024年の別事案/);
  const change = register.changes.find(item => item.kind === 'official_maru_club_additions');
  assert.deepEqual(new Set(change.incident_ids), new Set([maru.id, club.id]));
  for (const item of [maru, club]) {
    assert.deepEqual(item.cause_types, ['external_attack']);
    assert.ok(item.sources.every(source => source.type === 'official'));
  }
});

test('visible coverage agrees with the unique incident register', () => {
  const current = register.incidents.filter(item => item.scope === '2026').length;
  const domestic = register.incidents.filter(item => item.region === '日本').length;
  const overseas = register.incidents.filter(item => item.region === '海外').length;
  assert.equal(register.coverage.current_year_cases, current);
  assert.equal(register.coverage.domestic_cases, domestic);
  assert.equal(register.coverage.overseas_cases, overseas);
  assert.ok(html.includes(`計${register.incidents.length}件（国内${domestic}・海外${overseas}）。2026年の公表・続報・通知${current}件`));
});
