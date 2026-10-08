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
const pagination = (total, current) => `<nav class="archive-pages" aria-label="本文の分割ページ"><a href="/vulnerabilities">検索・絞り込みへ</a>${Array.from({ length: total }, (_, index) => `<a href="/vulnerabilities/archive/page-${index + 1}"${current === index + 1 ? ' aria-current="page"' : ""}>${index + 1}ページ</a>`).join("")}</nav>`;
const extraCss = '.pagination{display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin:1rem 0}.pagination[hidden]{display:none}.archive-pages{margin:1rem 0}.archive-index li{margin:.35rem 0}.load-error{padding:1rem;border:1px solid #b66100;background:#fff4dd}.load-error[hidden]{display:none}.archive-index{margin:1.5rem 0}.advisory{content-visibility:auto;contain-intrinsic-size:auto 750px}';

// Generate all public pieces from a non-served, byte-preserved authored source.
// The source is also the RSS input, so a representation change is not news.
export async function generateSplitVulnerabilities(root) {
  let source;
  try { source = await readFile(path.join(root, SOURCE_PATH), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const { cards, prefix, tail } = splitVulnerabilitySource(source);
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
  const basePrefix = prefix.replace("</style>", `${extraCss}\n  </style>`);
  const nav = pagination(chunks.length, 0);
  const index = `<details class="archive-index" id="archive-index"><summary>全${cards.length}項目の一覧・JavaScriptなしで読む</summary><ol>${rows.map(({ id, title, archive }) => `<li${chunks[0].selected.some((card) => card.id === id) ? "" : ` id="${id}"`} data-fallback-id="${id}"><a href="${archive}#${id}">${escapeHtml(title)}</a></li>`).join("")}</ol></details>`;
  const controls = '<div id="pagination" class="pagination" hidden><button type="button" id="previous-page">前の20件</button><span id="page-status"></span><button type="button" id="next-page">次の20件</button></div><div id="load-error" class="load-error" role="alert" hidden></div>';
  const mainTail = tail.replace('<p id="empty"', `${controls}${nav}${index}<p id="empty"`);
  const main = `${basePrefix}${chunks[0].selected.map((card) => card.html).join("\n")}${mainTail}<script type="application/json" id="vulnerability-view-data">${json(manifest)}</script>\n<script src="/assets/vulnerabilities-view.js" defer></script>\n</body>\n</html>\n`;
  files.set("vulnerabilities.html", main);
  for (const [index, { selected }] of chunks.entries()) {
    const relativePath = `${ARCHIVE_DIR}/page-${index + 1}.html`;
    let archivePrefix = basePrefix.replace(/<title>[\s\S]*?<\/title>/, `<title>脆弱性レポート ${index + 1}/${chunks.length}ページ | 本文・一次資料</title>`);
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
