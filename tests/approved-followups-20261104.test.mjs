import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const maintenance = JSON.parse(readFileSync('public/data/emergency-maintenance-20261021.json', 'utf8'));
const maintenanceHTML = readFileSync('public/php-emergency-maintenance.html', 'utf8');
const incidentHTML = readFileSync('public/security-incidents.html', 'utf8');
const incident = JSON.parse(incidentHTML.match(/<script id="incident-register" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const m = id => maintenance.confirmed.find(item => item.id === id);
const i = id => incident.incidents.find(item => item.id === id);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('four approved maintenance notices retain all old records and resolve only their two matching pending URLs', () => {
  assert.equal(maintenance.confirmed.length, 632);
  assert.equal(maintenance.confirmed.filter(item => item.restored).length, 133);
  assert.equal(maintenance.pending.length, 2044);
  assert.equal(maintenance.discovery.length, 2887);
  const batch = maintenance.collectionBatches.find(item => item.id === 'official-monitor-20261104-six-approved');
  assert.equal(batch.rowCount, 4);
  const resolved = maintenance.pendingResolutionHistory.filter(item => item.resolvedBatch === batch.id);
  assert.equal(resolved.length, 2);
  assert.deepEqual(resolved.map(item => item.originalPendingIndex).sort((a,b) => a-b), [2044,2045]);
  for (const item of resolved) assert.equal(maintenance.pending.some(row => row.url === item.originalPendingGroup.url), false);
  assert.equal(hash(maintenance.confirmed.slice(0, 576).map(item => maintenance.dailyOfficialFollowup20261105.previousRecords.find(previous => previous.id === item.id) ?? maintenance.dailyOfficialFollowup20261110.previousRecords.find(previous => previous.id === item.id) ?? item)), 'ec409102ada836a1277d2ab83140d27374b3de0d6c82079beb483f34dd00f482');
  assert.equal(hash(maintenance.discovery.slice(0, 2855)), '304c32a90e0e7790c92826b6471cb03f3b9c96f0b45e1b73fa09d2ee6d720e48');
  assert.match(maintenanceHTML, /11\/4 21:42 JSTの限定照合記録：/);
});

test('cancellation, entry reopening and scope-limited restoration do not become blanket service recovery', () => {
  const nara = m('nara-nice-maintenance-cancelled-20261031');
  assert.equal(nara.restored, false); assert.equal(nara.actualStopped, false);
  assert.equal(nara.noticeState, 'cancelled');
  const tokyo = m('tokyo-customer-harassment-entry-period-20261029');
  assert.equal(tokyo.restored, false); assert.equal(tokyo.reasonKey, 'security');
  assert.match(tokyo.status, /11\/4.*受付開始/); assert.match(tokyo.end, /11\/18 17時/);
  assert.match(tokyo.safe, /先着順ではなく/);
  const sompo = m('sompo-institute-plus-website-reopened-20261030');
  assert.equal(sompo.restored, true); assert.match(sompo.scope, /グループ全体.*ではない/);
  const phone = m('phone-appli-php-partial-restoration-20261030');
  assert.equal(phone.restored, false); assert.equal(phone.noticeState, 'partial');
  assert.match(phone.status, /k1\/k2.*停止継続/); assert.match(phone.safe, /11\/2.*別障害/);
});

test('two incident publication series retain prior cases and separate confirmed leakage groups from historical possibilities', () => {
  // Preserve the published 198 anchors while allowing sourced additions and follow-ups.
  const priorIds = [
  "saison-smart-realestate-member-platform-20261029",
  "nttdata-st-direct-vendor-digital-bonds-20261031",
  "connectwise-cloud-backup-20261016",
  "studio-cloud-20260930",
  "vercel-context-ai-202604",
  "ccq-cyberattack-20260824",
  "us-bnc-bae-202610",
  "wasabi-switch-orders-20261014",
  "gdo-servers-20261013",
  "ets-california-sftp-20260522",
  "westjet-social-engineering-20250612",
  "kingprinters-ai-abuse-20260910",
  "hachioji-gakuen-ransomware-20260708",
  "wasabi-development-db-20260704",
  "fivot-idare-20260810",
  "kindal-phishing-20260823",
  "toypo-api-20261004",
  "suzukiworld-form-20260729",
  "medley-atlink-20261011",
  "ntv-wands-faveconnect-20261011",
  "toppan-payments-20261014",
  "uk-laa-20250423",
  "certfr-refrigeration-20261012",
  "aena-ec-app-20261013",
  "arcadia-speecan-20261011",
  "siu-phishing-20260709",
  "shimonoseki-disaster-mail-20261013",
  "ahold-delhaize-cybersecurity-20261012",
  "nihracs-email-20261007",
  "blueberry-metabase-20260810",
  "resorttrust-web-20261005",
  "kissei-shoji-20261007",
  "egide-bollene-it-provider-20261006",
  "evotez-choisir2027-bots-20261009",
  "enecom-internal-network-20261006",
  "unirita-saas-documents-20260928",
  "bookoff-member-system-20261006",
  "newspicks-admin-tool-20261008",
  "paperlogic-cloud-20260827",
  "skyticket-three-paths-20261009",
  "commune-community-20261005",
  "coconala-resume-20261008",
  "daiichikosho-ncg-pc-20261002",
  "idcf-cloud-east1-20261007",
  "temairazu-202609",
  "frontline-education-202608",
  "abahouse-member-order-20260927",
  "sagawa-tracking-20260930",
  "ghostaction-actions-20260831",
  "publica-software-provider-202609",
  "otemae-hospital-mail-20261008",
  "photon-health-metabase-202608",
  "hachijuni-nagano-mail-20261007",
  "lawson-id-reservation-20260912",
  "luminis-health-cyber-2026",
  "italy-mfa-attempt-20261008",
  "hasbro-network-20260328",
  "toda-payment-employee-20261001",
  "daiwa-sc-inquiry-20261002",
  "saitama-shibusawa-mix-20261006",
  "gmo-trustlogin-storage-20260914",
  "his-thailand-files-20251211",
  "ceres-pointincome-20261005",
  "asahi-kasei-pharma-digital-20261002",
  "kuins-eportfolio-20260930",
  "denmark-cpr-202609",
  "mrmax-app-store-20261003",
  "nimoca-history-web-20261004",
  "asos-notification-20261006",
  "rakuten-drive-storage-20260129",
  "omu-ransomware-20261002",
  "advantest-network-20260215",
  "saltydog-googleads-mcc-20261005",
  "cinra-job-cloud-20260818",
  "evergreen-mail-20260626",
  "kawasaki-kbic-web-20260720",
  "doublecounter-metabase-cloud-20261004",
  "seicomart-app-20260924",
  "gmo-infoq-20261002",
  "rideon-express-server-20261007",
  "kufu-machitalk-20261002",
  "studysapuri-20260930",
  "monogatari-king-app-20261002",
  "daiki-app-20260915",
  "whiteessence-reservation-20260805",
  "osaka-redaction-20260608",
  "ifapme-database-202602",
  "nihonkotsu-malware-20260711",
  "iplug-offerbox-config-20261005",
  "nikkei-m365-20260930",
  "nikkei-workspace-202607",
  "nikkeibp-mail-phishing-20260930",
  "daiichilife-hr-20260924",
  "jogmec-20260909",
  "sammy-777conpass-20260925",
  "japantimes-group-server-20261002",
  "yamato-paylater-20260928",
  "ieej-m365-20260729",
  "applynow-analysis-20260809",
  "dtu-dtubasen-20261002",
  "irhythm-business-apps-20260603",
  "ikegami-server-20260921",
  "divd-zammad-20260921",
  "jaea-jrr3-support-20260925",
  "lawson-2026-mail",
  "lashinbang-20260914",
  "ozmall-20260926",
  "timescar-20260925",
  "aflac-japan-2026",
  "nipponrentacar-app-202609",
  "toyobo-mail-20260924",
  "ntt-west-insider-20231017",
  "voising-bi-20260810",
  "idscan-veriscan-cloud-20260404",
  "japanpost-app-20260925",
  "toppan-misdelivery-20260901",
  "gyazo-20260911",
  "eplus-refund-20260911",
  "instructure-canvas-20260429",
  "saga-nas-20260924",
  "shueisha-hpc-20260909",
  "tokyometro-metpo-20260927",
  "keio-ransomware-20260926",
  "fines-reservation-20260922",
  "arizona-courts-backups-20260924",
  "epark-peakmanager-20260727",
  "manage-my-health-202512",
  "relycomply-20260908",
  "kufu-zaim-write-20260918",
  "estore-shops-20260521",
  "nichirei-20260713",
  "murauchi-web-20260715",
  "odawara-mailbox-20260327",
  "digital-gss-20260625",
  "rext-ransomware-20260809",
  "sakura-systems-20260809",
  "casper-orthopedics-20260523",
  "cec-datacenter-20260805",
  "thinca-web-20260824",
  "visualarts-2026",
  "jst-mail-20260728",
  "kddi-isp-2026",
  "logicvein-vpn-20251208-update",
  "dotmoney-2026",
  "japan-shogi-web-202605",
  "sodick-2026",
  "chuden-credentials-20260729",
  "askul-20251019",
  "line-games-ad-20220525",
  "haicheese-photo-2026",
  "stryker-20260311",
  "zojirushi-taiwan-2026",
  "lycorp-20230914",
  "media4u-sms-20260624",
  "asahi-20250929",
  "icc-2026",
  "mercor-litellm-202603",
  "moneyforward-2026",
  "2rinkan-2026",
  "tohoku-university-2026",
  "upsider-2026",
  "nippontele-ransomware-20260309",
  "campfire-2026",
  "kitakyu-2026",
  "tokyo-tda-2026",
  "ycc-2026",
  "ielove-2026",
  "alpsalpine-2026",
  "cynd-beautymerit-2026",
  "murata-it-20260228",
  "espec-2026",
  "nyk-2026",
  "nms-musashikosugi-2026",
  "ec-europa-20260319",
  "mynavi-cloud-2026",
  "betterment-20260109",
  "zynas-joyfull-2026",
  "cac-academic-support-navi-2026",
  "mazda-warehouse-2026",
  "coastline-sumareji-app-2026",
  "ns-biojapan-2026",
  "trizetto-provider-202411",
  "athome-moving-2026",
  "canvass-ransomware-2026",
  "just-curtain-2026-update",
  "tokai-oneoffice-2026-update",
  "jmty-dev-environment-2026-update",
  "jr-kyushu-group-2026",
  "change-healthcare-20240212",
  "comhairle-cyberattack-20231107",
  "british-library-ransomware-20231028",
  "synnovis-cyber-202406",
  "iseto-20240526",
  "kadokawa-20240608",
  "nhs-wannacry-20170512",
  "sony-psn-qriocity-20110417",
  "equifax-20170513",
  "data-cymru-ogi-20241101"
];
  for (const id of priorIds) assert.ok(i(id), `missing published incident: ${id}`);
  assert.equal(hash(incident.changes.slice(0, 84)), 'fab2a7f1af653aeb2e858f7088f978da926dfcd59ca19f40abac027a3848ad55');
  const saison = i('saison-smart-realestate-member-platform-20261029');
  assert.match(saison.count, /1,889名.*39名.*1,850名/);
  assert.match(saison.relevance, /同一性は確認できておらず/);
  const ntt = i('nttdata-st-direct-vendor-digital-bonds-20261031');
  assert.equal(ntt.updated, '2026-11-02');
  assert.match(ntt.impact_status, /漏えいを確認.*継続調査/);
  assert.match(ntt.cause, /Securitize Japan.*認証機能/);
  assert.match(ntt.count, /111名.*2,678名.*合算せず/);
  assert.match(ntt.impact, /開始前の個別サービス/);
  assert.match(ntt.response, /停止継続.*再開日は未定/);
  assert.ok(ntt.sources.some(source => source.url === 'https://www.nttdata.com/global/ja/news/release/2026/110200/'));
  for (const item of [saison, ntt]) {
    assert.equal(item.checked_at, '2026-11-04');
    assert.deepEqual(item.cause_types, ['external_attack']);
    assert.ok(incidentHTML.includes(`id="${item.id}"`));
  }
});


test('November 5 incident additions retain units, provisional status and distinct event dates', () => {
  const added = [
  "arara-message-20261027",
  "istyle-cosme-members-20261028",
  "nojima-online-20261101",
  "prestige-pcs-20261029",
  "smartnews-systems-20261031",
  "cbcloud-pickgo-20261101",
  "shippio-platform-20261030",
  "getchu-members-20261028",
  "intage-survey-20261104",
  "gitbook-infrastructure-20261102",
  "chainalysis-internal-tools-202610",
  "northflank-control-plane-20261030",
  "workos-sales-support-20261030",
  "triggerdev-environment-variables-20261101"
];
  for (const id of added) {
    const item = i(id);
    assert.ok(item, id);
    assert.ok(incidentHTML.includes(`id="${id}"`));
    assert.ok(item.sources.some(source => source.type === 'official'));
    assert.ok(['known', 'unknown'].includes(item.cause_key));
  }
  assert.match(i('arara-message-20261027').timeline.find(row => row.date === '2026-10-31').text, /19:53.*停止/);
  assert.ok(i('arara-message-20261027').timeline.some(row => row.date === '2026-11-02' && /7,700万/.test(row.text)));
  assert.match(i('arara-message-20261027').count, /81,329,467.*おそれ.*人数ではない/);
  assert.match(i('prestige-pcs-20261029').count, /重複/);
  assert.match(i('nojima-online-20261101').count, /700万件/);
  assert.match(i('shippio-platform-20261030').count, /1,300.*1,100/);
  assert.match(i('cbcloud-pickgo-20261101').timeline.find(row => row.date === '2026-11-03').text, /取得.*判明/);
  assert.match(i('applynow-analysis-20260809').count, /396,920.*30,067/);
  assert.match(i('connectwise-cloud-backup-20261016').impact, /請求.*継続|残る請求/);
  assert.doesNotMatch(incidentHTML, /turn\d+(?:search|view)\d+|外部外部専門家/);
  assert.equal(incident.changes.slice(85,89).length, 4);
});
