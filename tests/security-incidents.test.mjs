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
  assert.match(chainalysis.timeline.find(event => event.date === '2026-11-06').text, /段階復旧開始.*Reactor・Data Solutionsの復旧作業は継続/);
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
  const priorSource = trigger.sources.find(source => source.checked_at === '2026-11-07');
  assert.match(priorSource.date_note, /本文は今回未確認/);
  assert.ok(trigger.timeline.some(event => /12:27 UTC.*本文は今回未確認/.test(event.text)));
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


test('November 8 portal reports separate records, investigated servers and partial financial fields', () => {
  const host = byId.get('tsukaeru-portal-20261106');
  const ms = byId.get('msins-contract-page-20261102');
  const aioi = byId.get('aioinissaydowa-contract-page-20261102');
  assert.equal(host.disclosed, '2026-11-07');
  assert.match(host.count, /127件.*調査対象.*侵入・漏えい確認件数ではない/);
  assert.match(host.impact, /バックアップ.*更新データ・送受信メール.*消失/);
  assert.equal(ms.disclosed, '2026-11-03');
  assert.equal(aioi.disclosed, '2026-11-03');
  assert.match(ms.count, /約3.7万件.*人数.*合算しない/);
  assert.match(ms.impact, /カード・口座情報を含まない/);
  assert.match(aioi.count, /約44.4万件.*3件.*19件.*加算.*置換はしない/);
  assert.match(aioi.impact, /下4桁.*下3桁を除く口座番号/);
  assert.match(aioi.relevance, /共通基盤・同一攻撃.*未確認/);
  for (const item of [host,ms,aioi]) assert.ok(item.sources.every(source=>source.type==='official'));
});

test('November 8 domestic followups retain scope and unfinished restoration', () => {
  const pcs = byId.get('prestige-pcs-20261029');
  const wasabi = byId.get('wasabi-switch-orders-20261014');
  const arara = byId.get('arara-message-20261027');
  assert.match(pcs.impact, /カード番号3件.*持ち出し.*損保ジャパン.*対象範囲に限る/);
  assert.match(pcs.count, /550万件.*6.5万件.*カード番号3件.*加算しない/);
  assert.match(wasabi.response, /暗号化.*完了.*futureshopは停止中/);
  assert.match(wasabi.unknown.join(' '), /BUYMA/);
  assert.match(arara.impact, /TKC.*未確認.*岡山県.*メールアドレス.*可能性/);
  assert.ok(arara.sources.some(source=>source.url==='https://www.pref.okayama.jp/site/presssystem/1064871.html'));
});

test('November 8 overseas updates distinguish restored products, key exposure and planned shutdown', () => {
  const chain = byId.get('chainalysis-internal-tools-202610');
  const trigger = byId.get('triggerdev-environment-variables-20261101');
  const gnosis = byId.get('gnosis-pay-legacy-cards-20261103');
  assert.match(chain.response, /11月7日13:50 EST.*18:50 UTC.*Reactor.*KYT.*Address Screening.*復帰/);
  assert.match(chain.response, /Data Solutionsの復旧完了.*記載がない/);
  assert.match(trigger.count, /全顧客.*0.66％.*実数.*非公表/);
  assert.match(trigger.impact, /root APIキー取得.*一覧取得.*セルフホスト.*個々の秘密情報.*非公表/);
  assert.match(trigger.response, /DBパスワード.*旧情報の失効/);
  assert.equal(gnosis.disclosed, '2026-11-06');
  assert.match(gnosis.count, /非公表/);
  assert.match(gnosis.response, /2時間以内に封じ込めを開始.*12月20日.*予定.*完了ではない/);
  assert.match(gnosis.impact, /同社は資金.*法人向け基盤.*影響を受けていないと説明/);
});

test('November 8 records have one explicit change summary and official sources', () => {
  const changes=register.changes.filter(x=>x.date==='2026-11-08');
  assert.equal(changes.length,3);
  const ids=changes.flatMap(x=>x.incident_ids);
  assert.equal(ids.length,9); assert.equal(new Set(ids).size,9);
  for(const id of ids){const item=byId.get(id);assert.ok(item);assert.ok(html.includes('id="'+id+'"'));assert.ok(item.sources.every(s=>s.type==='official'));}
});

test('November 9 domestic additions distinguish counts and information categories', () => {
  const rohto=byId.get('rohto-telephone-crm-20260910');
  assert.match(rohto.count,/2,797,545人/); assert.match(rohto.count,/9,715人/); assert.match(rohto.count,/合算しない/);
  const sonet=byId.get('sonynet-member-database-20261019');
  assert.match(sonet.count,/2,141,986件/); assert.match(sonet.count,/443,495件/);
  assert.match(sonet.impact,/通常会員.*パスワード.*対象外/); assert.match(sonet.impact,/4メールサービス.*パスワード.*流出/);
  const spirit=byId.get('teamspirit-development-cloud-20261027');
  assert.match(spirit.count,/28,824件/); assert.match(spirit.count,/35件.*含む/);
  const ele=byId.get('elestyle-oneqr-elepay-20261025');
  assert.match(ele.impact_status,/可能性/); assert.match(ele.count,/7,162件.*907件.*合算しない/);
});

test('new domestic cases retain possibility, independent-event and image exclusions',()=>{
 const aky=byId.get('euglena-akyrise-ec-20261104');
 assert.match(aky.count,/49万件.*90万件.*合算しない/);
 assert.ok(aky.sources.some(s=>s.date_note.includes('各々独立')));
 const fca=byId.get('shiseido-fca-20261027');
 assert.match(fca.count,/2,515件/); assert.match(fca.impact,/顔画像.*含まず/);
 const teket=byId.get('teket-ticket-platform-20261108');
 assert.match(teket.count,/調査中/); assert.match(teket.impact,/影響.*確認中/);
 assert.ok(teket.sources.every(s=> /tef.or.jp|kyoto.kenchikusai.jp/.test(new URL(s.url).hostname)));
});

test('Arara third report and Sagawa fifth report preserve scope and chronology',()=>{
 const arara=byId.get('arara-message-20261027');
 assert.match(arara.count,/81,329,467.*おそれ.*人数ではない/);
 assert.match(arara.count,/78,102,937.*2,842,400.*3,249,492.*非加算/);
 assert.match(arara.count,/380社.*61社/); assert.match(arara.occurred,/27日.*偵察.*28日/);
 assert.ok(arara.sources.some(s=>s.url.endsWith('20261106211906670s.pdf')));
 const sagawa=byId.get('sagawa-tracking-20260930');
 assert.match(sagawa.count,/5,323万件.*重複.*可能性/);
 assert.match(sagawa.response,/10月23日.*Web.*再開/);
 assert.match(sagawa.response,/同報時点.*API.*停止/);
 assert.ok(sagawa.sources.some(s=>s.url.endsWith('/detail/430/')));
});

test('new overseas records avoid turning potential scope into confirmed people',()=>{
 const railway=byId.get('railway-environment-variables-20261020');
 assert.match(railway.count,/1.85％.*100,000 workspaces/); assert.match(railway.impact_status,/一部復号確認/);
 assert.match(railway.impact,/ソースコード.*排除できていない/);
 const dream=byId.get('dreamhost-filemanager-20261023');
 assert.match(dream.impact_status,/認証情報取得確認.*メールボックス閲覧の可能性/);
 assert.match(dream.count,/10％.*下回る/);
 const nsw=byId.get('nsw-health-mndb-20261106');
 assert.deepEqual(nsw.cause_types,['unknown']); assert.match(nsw.count,/非公表/);
 assert.match(nsw.relevance,/診療情報流出と推定しない/);
});
