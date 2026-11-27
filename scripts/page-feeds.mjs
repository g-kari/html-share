import { writeFile } from "node:fs/promises";
import path from "node:path";
import { escapeHtml, pageImage, routeFor, scanTags, SITE_URL } from "./social-metadata.mjs";
import { escapeXml } from "./rss-feed.mjs";

// Page-level update feeds. Unlike the report feeds (one item per material
// update), each of these feeds carries a single item that represents the
// page itself: its description is rebuilt from the page's own update
// register (`changes`) so the newest update summary leads, and the page's
// social image travels with the item. The item GUID is the page URL, so a
// reader keeps one entry whose description and date advance with each
// recorded update.
export const PAGE_FEEDS = [
  { key: "emergency-maintenance", relativePath: "emergency-maintenance-2026-11.html", scriptId: "maintenance-update-data", path: "/emergency-maintenance-feed.xml", title: "緊急メンテナンス続報 更新RSS" },
];

const cleanText = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export function pageUpdateData(source, feed) {
  const scripts = scanTags(source).filter((tag) => tag.name === "script" && !tag.closing && tag.attrs.get("id")?.value === feed.scriptId && tag.attrs.get("type")?.value === "application/json");
  if (scripts.length !== 1) throw new Error(`Expected one ${feed.scriptId} JSON register.`);
  const start = scripts[0].end;
  const end = source.slice(start).search(/<\/script\s*>/i);
  if (end < 0) throw new Error(`Unclosed ${feed.scriptId} register.`);
  const data = JSON.parse(source.slice(start, start + end));
  if (!Array.isArray(data.changes)) throw new Error(`Invalid ${feed.key} update register.`);
  for (const change of data.changes) {
    if (!cleanText(change.summary)) throw new Error(`Missing ${feed.key} update summary.`);
    changeDate(change.date);
  }
  return data;
}

// A change date is either a JST calendar day or a full ISO timestamp. The
// label is the JST reading a subscriber should see; never invent a time
// for a day-precision entry.
export function changeDate(value) {
  if (/^\d{4}-\d\d-\d\d$/.test(value || "")) {
    const date = new Date(`${value}T00:00:00+09:00`);
    if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== value) throw new Error(`Invalid update date: ${value}`);
    return { published: date.toISOString(), precision: "day", label: `${Number(value.slice(0, 4))}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` };
  }
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid update timestamp: ${value}`);
  const published = new Date(value).toISOString();
  const jst = new Date(Date.parse(published) + 9 * 3600000);
  const label = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日 ${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
  return { published, precision: "second", label };
}

// Newest recorded change of any register that keeps `changes[].summary`
// (page update registers and the report registers share that shape).
export function latestChange(data) {
  let latest = null;
  for (const change of data.changes || []) {
    const summary = cleanText(change.summary);
    if (!summary) continue;
    const dated = { summary, ...changeDate(change.date) };
    if (!latest || Date.parse(dated.published) >= Date.parse(latest.published)) latest = dated;
  }
  return latest;
}

export function recentChanges(data, limit = 3) {
  return (data.changes || [])
    .map((change) => ({ summary: cleanText(change.summary), ...changeDate(change.date) }))
    .filter((change) => change.summary)
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .slice(0, limit);
}

export function updateDescription(changes) {
  const heads = ["最新の更新", "前回", "前々回"];
  return changes.map((change, index) => `${heads[index] || "以前"}（${change.label}）：${change.summary}`).join(" ");
}

export function renderPageFeed(feed, page) {
  const url = SITE_URL + routeFor(feed.relativePath);
  const items = page ? recentChanges(pageUpdateData(page.source, feed)) : [];
  const image = page ? pageImage(page.source, feed.relativePath) : null;
  const latest = items[0];
  const item = latest ? `    <item>
      <title>${escapeXml(page.title || feed.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(escapeHtml(updateDescription(items)))}</description>
      <pubDate>${new Date(latest.published).toUTCString()}</pubDate>
      <dcterms:modified>${latest.published}</dcterms:modified>
      <media:content url="${escapeXml(image.url)}" type="${escapeXml(image.type)}" medium="image"/>
      <media:thumbnail url="${escapeXml(image.url)}"/>
    </item>
` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(feed.title)}</title>
    <link>${escapeXml(url)}</link>
    <description>ページ単位の1項目で配信します。項目の説明には最新の更新内容を入れ、更新のたびに新しい内容へ差し替わります。日付はページの更新日時で、個別の障害・事件の発生日時ではありません。</description>
    <language>ja</language>
${image ? `    <image>
      <url>${escapeXml(image.url)}</url>
      <title>${escapeXml(feed.title)}</title>
      <link>${escapeXml(url)}</link>
    </image>
` : ""}    <atom:link href="${SITE_URL}${feed.path}" rel="self" type="application/rss+xml"/>
    <ttl>5</ttl>
${latest ? `    <lastBuildDate>${new Date(latest.published).toUTCString()}</lastBuildDate>
` : ""}${item}  </channel>
</rss>
`;
}

export async function writePageFeeds(root, pages) {
  for (const feed of PAGE_FEEDS) {
    const page = pages.find((candidate) => candidate.relativePath === feed.relativePath);
    // A missing page keeps an empty channel instead of stale promises,
    // mirroring how the report feeds retain their files through removal.
    await writeFile(path.join(root, "public", feed.path.slice(1)), renderPageFeed(feed, page || null), "utf8");
  }
}
