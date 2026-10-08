import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeHTML } from "entities";
import { scanTags, addSocialMetadata, escapeHtml } from "./social-metadata.mjs";
import { addFeedDiscovery } from "./rss-feed.mjs";
import { REPORT_FEEDS, reportData } from "./report-feeds.mjs";

export const SOURCE_PATH = "reports/vulnerabilities.source.html";
export const PAGE_SIZE = 20;
const ASSET_DIR = "assets/vulnerabilities";
const ARCHIVE_DIR = "vulnerabilities/archive";
const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
export const isReportArchive = (relativePath) => relativePath.startsWith(`${ARCHIVE_DIR}/`);

export function splitVulnerabilitySource(source) {
  const feed = REPORT_FEEDS[0];
  const data = reportData(source, feed);
  const register = scanTags(source).find((tag) => tag.name === "script" && !tag.closing && tag.attrs.get("id")?.value === feed.scriptId);
  const body = source.slice(0, register.start);
  const cards = [...body.matchAll(/<article\b[^>]*class="advisory"[^>]*>[\s\S]*?<\/article>/g)].map((match) => {
    const attrs = scanTags(match[0])[0].attrs;
    const attr = (key) => attrs.get(key)?.value || "";
    const id = attr("id");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Unsafe vulnerability anchor: ${id}`);
    const title = decodeHTML(match[0].match(/<h3>[\s\S]*?<\/h3>/)?.[0].replace(/<[^>]*>/g, "") || id);
    return { id, title, category: attr("data-category"), severity: attr("data-severity"), exploitation: attr("data-exploitation"), priority: attr("data-priority"), date: attr("data-date"), cvss: Number(attr("data-cvss")), html: match[0], text: decodeHTML(match[0].replace(/<[^>]*>/g, "")).toLocaleLowerCase("ja") };
  });
  if (!cards.length || cards.length !== data.records.length || new Set(cards.map((card) => card.id)).size !== cards.length || data.records.some((record) => !cards.some((card) => card.id === record.id))) throw new Error("The vulnerability cards and JSON register must have the same unique IDs.");
  const first = body.indexOf(cards[0].html);
  const last = body.lastIndexOf(cards.at(-1).html) + cards.at(-1).html.length;
  const prefix = body.slice(0, first).replace(/<noscript>[\s\S]*?<\/noscript>/, '<noscript><p class="tiny">JavaScriptが無効でも、下の分割ページと全項目一覧から全件の本文・出典を読めます。</p></noscript>');
  return { data, cards, prefix, tail: body.slice(last) };
}

const compare = (a, b) => a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date);
export function compactLeadPrefix(prefix, cards, data, leadHref = (id) => `/vulnerabilities#${id}`) {
  const match = prefix.match(/(<section class="brief"><h2>いま先に確認したいこと<\/h2>)(<ul>[\s\S]*?<\/ul>)(<\/section>)/);
  if (!match) return prefix;
  const records = new Map(data.records.map((record) => [record.id, record]));
  const first = [...cards].sort(compare).slice(0, 3).map((card) => records.get(card.id));
  const cues = new Map([
    ['windows-exploited-eop', ['Windows', '該当系列・条件を照合して対処を確認']],
    ['zammad-exploited-chain', ['Zammad', '対象版・修正状況を分けて確認']],
    ['fortimail-exploited-file-write', ['FortiMail', 'Cloud/applianceの対処を分けて確認']],
  ]);
  const lines = first.map((record) => {
    const [product, cue] = cues.get(record.id) || [Array.from(record.product || record.title).slice(0, 24).join(''), '利用・版・構成が該当する場合の対処へ'];
    return `<li data-lead-record="${record.id}"><a href="${escapeHtml(leadHref(record.id))}" aria-label="${escapeHtml(`${record.product}：${record.title}`)}">${escapeHtml(product)}</a>：${escapeHtml(cue)}</li>`;
  }).join('');
  const evidence = first.every((record) => record.exploitation === 'confirmed') ? '実悪用の一次資料あり。' : '悪用・修正の状況は各本文を確認。';
  const count = [...match[2].matchAll(/<li\b/g)].length;
  return prefix.replace(match[0], `${match[1]}<ul class="lead-summary">${lines}</ul><p class="tiny">${evidence}製品の利用状況は未確認。</p><details class="lead-more"><summary>詳しい確認ポイント・これまでの補足（${count}件）</summary>${match[2]}</details>${match[3]}`);
}
const pagination = (total, current) => `<nav class="archive-pages" aria-label="本文の分割ページ"><a href="/vulnerabilities">検索・絞り込みへ</a>${Array.from({ length: total }, (_, index) => `<a href="/vulnerabilities/archive/page-${index + 1}"${current === index + 1 ? ' aria-current="page"' : ""}>${index + 1}ページ</a>`).join("")}</nav>`;
const extraCss = '.pagination{display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin:1rem 0}.pagination[hidden]{display:none}body.js .static-pagination{display:none}.archive-pages{margin:1rem 0}.archive-index li{margin:.35rem 0}.load-error{padding:1rem;border:1px solid #b66100;background:#fff4dd}.load-error[hidden]{display:none}.archive-index{margin:1.5rem 0}.lead-more{margin-top:.8rem}.advisory{content-visibility:auto;contain-intrinsic-size:auto 750px}';

// Generate all public pieces from a non-served, byte-preserved authored source.
// The source is also the RSS input, so a representation change is not news.
export async function generateSplitVulnerabilities(root) {
  let source;
  try { source = await readFile(path.join(root, SOURCE_PATH), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const { data, cards, prefix, tail } = splitVulnerabilitySource(source);
  const publicDir = path.join(root, "public");
  const sorted = [...cards].sort(compare);
  const chunks = [];
  const rows = [];
  const files = new Map();
  for (let offset = 0; offset < sorted.length; offset += PAGE_SIZE) {
    const selected = sorted.slice(offset, offset + PAGE_SIZE);
    const content = json({ version: 1, cards: selected.map(({ id, html }) => ({ id, html })) }) + "\n";
    const chunk = `/${ASSET_DIR}/chunk-${digest(content)}.json`;
    const archive = `/vulnerabilities/archive/page-${chunks.length + 1}`;
    files.set(chunk.slice(1), content);
    chunks.push({ selected, archive });
    for (const { id, title, category, severity, exploitation, priority, date, cvss } of selected) rows.push({ id, title, category, severity, exploitation, priority, date, cvss, chunk, archive });
  }
  const search = json(Object.fromEntries(cards.map(({ id, text }) => [id, text]))) + "\n";
  // Preserve source ordering as the stable tie-breaker for all three sorts.
  rows.sort((a, b) => cards.findIndex((card) => card.id === a.id) - cards.findIndex((card) => card.id === b.id));
  const searchUrl = `/${ASSET_DIR}/search-${digest(search)}.json`;
  files.set(searchUrl.slice(1), search);
  const manifest = { version: 1, pageSize: PAGE_SIZE, searchUrl, rows };
  const basePrefix = compactLeadPrefix(prefix, cards, data).replace("</style>", `${extraCss}\n  </style>`);
  const archiveById = new Map(rows.map(({ id, archive }) => [id, archive]));
  const archiveBasePrefix = compactLeadPrefix(prefix, cards, data, (id) => `${archiveById.get(id)}#${id}`).replace("</style>", `${extraCss}\n  </style>`);
  const nav = pagination(chunks.length, 0);
  const index = `<details class="archive-index" id="archive-index" open><summary>全${cards.length}項目の一覧・JavaScriptなしで読む</summary><ol>${rows.map(({ id, title, archive }) => `<li${chunks[0].selected.some((card) => card.id === id) ? "" : ` id="${id}"`} data-fallback-id="${id}"><a href="${archive}#${id}">${escapeHtml(title)}</a></li>`).join("")}</ol></details>`;
  const pager = (top) => `<nav id="pagination${top ? '-top' : ''}" class="pagination" hidden aria-label="一覧${top ? '上部' : '下部'}のページ送り"><button type="button" id="previous-page${top ? '-top' : ''}">前の20件</button><span id="page-status${top ? '-top' : ''}"></span><button type="button" id="next-page${top ? '-top' : ''}">次の20件</button></nav>`;
  const controls = pager(false) + '<div id="load-error" class="load-error" role="alert" hidden></div>';
  const staticTop = pagination(chunks.length, 1).replace('class="archive-pages"', 'class="archive-pages static-pagination"').replace('aria-label="本文の分割ページ"', 'aria-label="JavaScriptなしの上部ページ送り"');
  const mainPrefix = basePrefix.replace('<div id="advisories">', `${pager(true)}${staticTop}<div id="advisories">`);
  const mainTail = tail.replace('<p id="empty"', `${controls}${nav}${index}<p id="empty"`);
  const main = `${mainPrefix}${chunks[0].selected.map((card) => card.html).join("\n")}${mainTail}<script type="application/json" id="vulnerability-view-data">${json(manifest)}</script>\n<script src="/assets/vulnerabilities-view.js" defer></script>\n</body>\n</html>\n`;
  files.set("vulnerabilities.html", main);
  for (const [index, { selected }] of chunks.entries()) {
    const relativePath = `${ARCHIVE_DIR}/page-${index + 1}.html`;
    let archivePrefix = archiveBasePrefix.replace(/<title>[\s\S]*?<\/title>/, `<title>脆弱性レポート ${index + 1}/${chunks.length}ページ | 本文・一次資料</title>`);
    archivePrefix = archivePrefix.replace('<div id="advisories">', `${pagination(chunks.length, index + 1)}<p class="tiny">本文 ${index * PAGE_SIZE + 1}–${index * PAGE_SIZE + selected.length} / 全${cards.length}項目。全件の検索・絞り込みはレポートのトップで利用できます。</p><div id="advisories">`);
    const archiveTail = tail.replace('<p id="empty"', `${pagination(chunks.length, index + 1)}<p id="empty"`);
    const html = `${archivePrefix}${selected.map((card) => card.html).join("\n")}${archiveTail}</body>\n</html>\n`;
    files.set(relativePath, addFeedDiscovery(addSocialMetadata(html, relativePath), [REPORT_FEEDS[0]]));
  }
  // Only files owned by this generator are removed; authored pages are untouched.
  for (const directory of [ASSET_DIR, ARCHIVE_DIR]) {
    const full = path.join(publicDir, directory);
    await mkdir(full, { recursive: true });
    for (const name of await readdir(full)) {
      const relativePath = `${directory}/${name}`;
      if (/^(?:chunk-[a-f0-9]{16}\.json|search-[a-f0-9]{16}\.json|page-\d+\.html)$/.test(name) && !files.has(relativePath)) await rm(path.join(publicDir, relativePath));
    }
  }
  for (const [relativePath, content] of files) await writeFile(path.join(publicDir, relativePath), content, "utf8");
  return { source, manifest, files };
}
