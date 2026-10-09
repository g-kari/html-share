import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeHTML } from "entities";
import { scanTags, addSocialMetadata, escapeHtml } from "./social-metadata.mjs";
import { addFeedDiscovery } from "./rss-feed.mjs";
import { automaticTags } from "./technology-tags.mjs";

export const TECHNOLOGY_SOURCE_PATH = "reports/technology-updates.source.html";
export const TECHNOLOGY_PAGE_SIZE = 12;
const ASSET_DIR = "assets/technology-updates";
const BASE = "/technology-updates";
const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c") + "\n";
export const isTechnologyArchive = (relative) => /^technology-updates\/(?:archive|history)(?:\/|\.html)/.test(relative);
const groups = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export function splitTechnologySource(source) {
  const register = scanTags(source).find((tag) => tag.name === "script" && !tag.closing && tag.attrs.get("id")?.value === "technology-update-data");
  if (!register) throw new Error("Missing technology-update-data register.");
  const ending = source.indexOf("</script", register.end);
  const data = JSON.parse(source.slice(register.end, ending));
  if (data.schema_version !== 1 || !Array.isArray(data.records) || !data.records.length || !Array.isArray(data.changes)) throw new Error("Invalid technology update register.");
  const body = source.slice(0, register.start);
  const cards = [...body.matchAll(/<article\b[^>]*class="update"[^>]*>[\s\S]*?<\/article>/g)].map((match) => {
    const attrs = scanTags(match[0])[0].attrs;
    const id = attrs.get("id")?.value;
    const record = data.records.find((row) => row.id === id);
    const date = record && new Date(record.date + "T00:00:00Z");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id || "") || !record || typeof record.title !== "string" || !record.title || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || "") || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.date) throw new Error(`Invalid technology record: ${id}`);
    if (attrs.get("data-category")?.value !== record.category) throw new Error(`Technology category mismatch: ${id}`);
    const tags = automaticTags(record);
    const links = tags.map((tag) => `<a class="auto-tag" href="${BASE}?tag=${encodeURIComponent(tag.id)}#updates" data-tag-kind="${tag.kind}">${escapeHtml(tag.label)}</a>`).join("");
    const html = match[0].replace(/(<div class="record-meta">[\s\S]*?)(<\/div>)/, `$1${links}$2`)
      .replace(/(<a\b[^>]*class="permalink"[^>]*\bhref=")#[^"]*(")/, `$1${BASE}#${id}$2`);
    const text = decodeHTML(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("ja");
    return { id, title: record.title, date: record.date, category: record.category, tags, html, text };
  });
  if (cards.length !== data.records.length || new Set(cards.map((card) => card.id)).size !== cards.length || new Set(data.records.map((row) => row.id)).size !== data.records.length) throw new Error("Technology HTML cards and JSON register must have the same unique IDs.");
  const matches = [...body.matchAll(/<article\b[^>]*class="update"[^>]*>[\s\S]*?<\/article>/g)];
  const first = matches[0].index;
  const last = matches.at(-1).index + matches.at(-1)[0].length;
  if (/<article\b/.test(body.slice(first, last).replace(/<article\b[^>]*class="update"[^>]*>[\s\S]*?<\/article>/g, ""))) throw new Error("Unexpected article between technology cards.");
  return { data, cards, prefix: body.slice(0, first), tail: body.slice(last) };
}

const css = `.tools{grid-template-columns:repeat(2,minmax(0,1fr));align-items:end}.tools button{justify-self:start}.auto-tag{font-size:12px;padding:3px 8px;border:1px solid var(--line);border-radius:4px;text-decoration:none;min-height:30px}.pagination,.archive-nav{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:20px 0}.pagination button{min-height:44px;background:#fff;color:var(--ink);border:1px solid #949db6;border-radius:5px;padding:8px 14px;cursor:pointer}.pagination button:disabled{opacity:.55;cursor:default}.load-error{padding:16px;background:var(--alertbg);border:1px solid #bd8d2b;margin:16px 0}.load-error button{min-height:44px}.archive-list{padding:24px;background:#fff;border:1px solid var(--line);border-radius:var(--radius)}.archive-list li{margin:12px 0}.updates:empty{display:none}@media(max-width:560px){.tools{grid-template-columns:1fr}}`;
const nav = (previous, next, label = "ページ送り") => `<nav class="archive-nav" aria-label="${label}"><a href="${BASE}">最近の更新・全件検索</a><a href="${BASE}/archive">月別アーカイブ</a>${previous ? `<a href="${previous}" rel="prev">前のページ</a>` : ""}${next ? `<a href="${next}" rel="next">次のページ</a>` : ""}</nav>`;
const historyItems = (tail) => tail.match(/<section class="history"[\s\S]*?<ul>([\s\S]*?)<\/ul>/)?.[1].match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || [];
const replaceHistory = (tail, items, all = true) => tail.replace(/(<section class="history"[\s\S]*?<ul>)[\s\S]*?(<\/ul>)/, `$1${items.join("\n")}$2${all ? `<p><a href="${BASE}/history">更新・訂正履歴をすべて読む</a></p>` : ""}`);
const staticDocument = (prefix, body, tail, relative, title) => addFeedDiscovery(addSocialMetadata(prefix.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`).replace(/<form\b[\s\S]*?<\/form>/, "") + body + tail + "</body></html>\n", relative));

export async function generateSplitTechnologyUpdates(root) {
  let source;
  try { source = await readFile(path.join(root, TECHNOLOGY_SOURCE_PATH), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const { data, cards, prefix, tail } = splitTechnologySource(source);
  const sorted = [...cards].sort((a, b) => b.date.localeCompare(a.date));
  const files = new Map();
  const months = [...new Set(sorted.map((card) => card.date.slice(0, 7)))];
  const rows = [];
  const archivePaths = new Map();
  const decoratedPrefix = prefix.replace("</style>", `${css}</style>`)
    .replace(/\d+項目 \/ \d+分野/, `${cards.length}項目 / ${new Set(cards.map((card) => card.category)).size}分野`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript><p>JavaScriptが無効でも、このページの本文と<a href="${BASE}/archive">月別アーカイブ</a>から全更新・一次資料を読めます。</p></noscript>`);
  const history = historyItems(tail);
  const shortTail = replaceHistory(tail, history.slice(0, 5));
  for (const month of months) {
    const pages = groups(sorted.filter((card) => card.date.startsWith(month)), TECHNOLOGY_PAGE_SIZE);
    for (const [page, selected] of pages.entries()) {
      const archive = `${BASE}/archive/${month}${page ? `-${page + 1}` : ""}`;
      for (const card of selected) archivePaths.set(card.id, archive);
    }
  }
  // A chunk has at most 12 complete cards. Neither the source register nor all
  // historical card bodies are embedded/preloaded on the recent landing page.
  for (const selected of groups(sorted, TECHNOLOGY_PAGE_SIZE)) {
    const content = json({ version: 1, cards: selected.map(({ id, html }) => ({ id, html })) });
    const chunk = `/${ASSET_DIR}/chunk-${digest(content)}.json`;
    files.set(chunk.slice(1), content);
    for (const { id, title, date, category, tags } of selected) rows.push({ id, title, date, category, tags, chunk, archive: archivePaths.get(id) });
  }
  const search = json(Object.fromEntries(sorted.map(({ id, text }) => [id, text])));
  const searchUrl = `/${ASSET_DIR}/search-${digest(search)}.json`;
  files.set(searchUrl.slice(1), search);
  const tags = [...new Map(rows.flatMap((row) => row.tags).map((tag) => [tag.id, tag])).values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const manifest = { version: 1, pageSize: TECHNOLOGY_PAGE_SIZE, searchUrl, rows, tags, months };
  const manifestContent = json(manifest);
  const manifestUrl = `/${ASSET_DIR}/manifest-${digest(manifestContent)}.json`;
  files.set(manifestUrl.slice(1), manifestContent);
  const extraFilters = '<div><label for="tag">自動タグ（製品・分野・変更）</label><select id="tag" name="tag"><option value="">すべてのタグ</option></select></div><div><label for="month">発表月</label><select id="month" name="month"><option value="">すべての月</option></select></div>';
  const first = sorted.slice(0, TECHNOLOGY_PAGE_SIZE);
  const pager = `<nav id="pagination" class="pagination" hidden aria-label="更新一覧のページ送り"><button type="button" id="previous-page">前の12件</button><span id="page-status"></span><button type="button" id="next-page">次の12件</button></nav><div id="load-error" class="load-error" role="alert" hidden></div>`;
  const fallback = `<p class="archive-nav">最近の${first.length}件を表示。過去の本文・一次資料は<a href="${BASE}/archive">月別アーカイブ</a>から、JavaScriptなしでも読めます。</p>`;
  let mainPrefix = decoratedPrefix.replace('<button type="reset">', `${extraFilters}<button type="reset">`).replace('<div class="updates">', `${fallback}<div class="updates" id="update-cards">`).replace(/(<p class="filter-status"[^>]*>)[\s\S]*?(<\/p>)/, `$1${first.length} / ${cards.length}件を表示$2`);
  const config = { version: 1, pageSize: TECHNOLOGY_PAGE_SIZE, total: cards.length, manifestUrl, initialIds: first.map((card) => card.id) };
  const insertBeforeEmpty = (html, content) => html.replace(/<p\b[^>]*\bid="empty"[^>]*>/, (tag) => content + tag);
  const mainTail = insertBeforeEmpty(shortTail, pager);
  files.set("technology-updates.html", `${mainPrefix}${first.map((card) => card.html).join("\n")}${mainTail}<script type="application/json" id="technology-view-data">${json(config)}</script><script type="module" src="/assets/technology-updates-view.js"></script></body></html>\n`);

  // Static pages keep every authored card and history entry, but each page and
  // archive directory view is bounded too, including a very long-lived report.
  const remap = (html) => html.replace(/href="#([a-z0-9-]+)"/g, (original, id) => archivePaths.has(id) ? `href="${archivePaths.get(id)}#${id}"` : original);
  for (const month of months) {
    const pages = groups(sorted.filter((card) => card.date.startsWith(month)), TECHNOLOGY_PAGE_SIZE);
    for (const [page, selected] of pages.entries()) {
      const route = archivePaths.get(selected[0].id);
      const relative = `${route.slice(1)}.html`;
      const previous = page ? `${BASE}/archive/${month}${page > 1 ? `-${page}` : ""}` : "";
      const next = page + 1 < pages.length ? `${BASE}/archive/${month}-${page + 2}` : "";
      const navigation = nav(previous, next, "月別本文ページ送り");
      const p = remap(decoratedPrefix).replace('<div class="updates">', `${navigation}<p>${month} 発表の更新 ${page * TECHNOLOGY_PAGE_SIZE + 1}–${page * TECHNOLOGY_PAGE_SIZE + selected.length}件。タグは掲載本文から自動生成しています。</p><div class="updates">`);
      const t = insertBeforeEmpty(shortTail, navigation);
      files.set(relative, staticDocument(p, selected.map((card) => card.html).join("\n"), remap(t), relative, `重要技術アップデート ${month} ${page + 1}/${pages.length}ページ`));
    }
  }
  const shellEnd = decoratedPrefix.indexOf('<section class="quick"');
  const shell = remap(shellEnd >= 0 ? decoratedPrefix.slice(0, shellEnd) : decoratedPrefix.slice(0, decoratedPrefix.indexOf('<section class="collection"')))
    .replace(/href="#(updates|method)"/g, (_, id) => `href="${BASE}#${id}"`)
    .replace(/href="#history"/g, `href="${BASE}/history#history"`);
  const closing = '</main><footer class="site-footer"><div class="wrap"><a href="/">共有ノート一覧</a></div></footer>';
  const monthPages = groups(months, 20);
  for (const [page, selection] of monthPages.entries()) {
    const route = `${BASE}/archive${page ? `/page-${page + 1}` : ""}`;
    const relative = `${route.slice(1)}.html`;
    const body = `<section class="archive-list"><h2>月別アーカイブ</h2><p>全${cards.length}件。各本文ページは12件まで。検索・タグ絞り込みは最近の更新ページから使えます。</p><ul>${selection.map((month) => `<li><a href="${BASE}/archive/${month}">${month}</a>（${sorted.filter((card) => card.date.startsWith(month)).length}件）</li>`).join("")}</ul></section>${nav(page ? `${BASE}/archive${page > 1 ? `/page-${page}` : ""}` : "", page + 1 < monthPages.length ? `${BASE}/archive/page-${page + 2}` : "", "月一覧ページ送り")}`;
    files.set(relative, staticDocument(shell, body, closing, relative, `重要技術アップデート 月別アーカイブ ${page + 1}`));
  }
  const historyPages = groups(history, 20);
  if (!historyPages.length) historyPages.push([]);
  for (const [page, items] of historyPages.entries()) {
    const route = `${BASE}/history${page ? `/page-${page + 1}` : ""}`;
    const relative = `${route.slice(1)}.html`;
    const body = `<section class="history" id="history"><h2>更新・訂正履歴</h2><ul>${items.join("\n")}</ul></section>${nav(page ? `${BASE}/history${page > 1 ? `/page-${page}` : ""}` : "", page + 1 < historyPages.length ? `${BASE}/history/page-${page + 2}` : "", "履歴ページ送り")}`;
    files.set(relative, staticDocument(shell, body, closing, relative, `重要技術アップデート 更新・訂正履歴 ${page + 1}`));
  }
  const publicDir = path.join(root, "public");
  for (const relative of files.keys()) await mkdir(path.dirname(path.join(publicDir, relative)), { recursive: true });
  for (const directory of [ASSET_DIR, "technology-updates/archive", "technology-updates/history"]) {
    await mkdir(path.join(publicDir, directory), { recursive: true });
    for (const name of await readdir(path.join(publicDir, directory))) {
      const relative = `${directory}/${name}`;
      if (/^(?:(?:chunk|search|manifest)-[a-f0-9]{16}\.json|(?:page-\d+|\d{4}-\d{2}(?:-\d+)?)\.html)$/.test(name) && !files.has(relative)) await rm(path.join(publicDir, relative));
    }
  }
  for (const [relative, content] of files) await writeFile(path.join(publicDir, relative), content, "utf8");
  return { source, data, manifest, config, files };
}
