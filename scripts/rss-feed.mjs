import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addSocialMetadata, escapeHtml, headTags, SITE_NAME, SITE_URL } from "./social-metadata.mjs";
import { committedReportSource, reportSourcePaths } from "./report-source.mjs";

export const FEED_PATH = "/feed.xml";
export const STATE_FILE = ".feed-state.json";
const START = "<!-- html-share: rss discovery -->";
const END = "<!-- /html-share: rss discovery -->";

// Use parsed, active head comments only. Strings, body comments and inert
// templates resembling our markers must never erase authored content.
function stripBlock(source, startMarker, endMarker) {
  const comments = headTags(source).tags.filter((tag) => tag.name === "#comment");
  const ranges = [];
  for (let index = 0; index < comments.length; index++) {
    const comment = comments[index];
    if (source.slice(comment.start, comment.end) !== startMarker) continue;
    const ending = comments.slice(index + 1).find((tag) => source.slice(tag.start, tag.end) === endMarker);
    if (!ending) throw new Error(`Unclosed generated metadata block: ${startMarker}`);
    let start = comment.start;
    while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
    let end = ending.end;
    while (/[ \t]/.test(source[end] || "!")) end++;
    if (source.slice(end, end + 2) === "\r\n") end += 2;
    else if (source[end] === "\n") end++;
    ranges.push({ start, end });
    index = comments.indexOf(ending);
  }
  let result = source;
  for (const { start, end } of ranges.reverse()) result = result.slice(0, start) + result.slice(end);
  return result;
}

export function addFeedDiscovery(source, extraFeeds = []) {
  const html = stripBlock(source, START, END);
  const { tags, closing } = headTags(html);
  const feeds = [{ path: FEED_PATH, title: `${SITE_NAME} RSS` }, ...extraFeeds];
  const missing = feeds.filter((feed) => !tags.some((tag) => {
    if (tag.name !== "link" || tag.closing ||
        !tag.attrs.get("rel")?.value.toLowerCase().split(/\s+/).includes("alternate") ||
        tag.attrs.get("type")?.value.toLowerCase() !== "application/rss+xml") return false;
    try { return new URL(tag.attrs.get("href")?.value || "", SITE_URL).href === SITE_URL + feed.path; }
    catch { return false; } // Preserve malformed authored alternatives; still add ours.
  }));
  if (!missing.length) return html;
  const block = `  ${START}\n${missing.map((feed) => `  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(feed.title)}" href="${SITE_URL}${escapeHtml(feed.path)}">`).join("\n")}\n  ${END}\n`;
  return html.slice(0, closing.start).replace(/[ \t]*$/, "") + block + html.slice(closing.start);
}

export function contentFingerprint(source, relativePath) {
  // Social URL normalization is also applied before hashing so its first build
  // cannot masquerade as a page edit. Generated blocks do not affect dates.
  const normalized = stripBlock(stripBlock(addSocialMetadata(source, relativePath),
    "<!-- html-share: social metadata -->", "<!-- /html-share: social metadata -->"), START, END);
  return createHash("sha256").update(normalized).digest("hex");
}

export function escapeXml(value) {
  const valid = Array.from(String(value), (char) => {
    const code = char.codePointAt(0);
    return code === 9 || code === 10 || code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff) ? char : "\ufffd";
  }).join("");
  return valid.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid RSS timestamp: ${value}`);
  }
  return new Date(value).toISOString();
}

export async function readFeedState(root) {
  let data;
  try { data = JSON.parse(await readFile(path.join(root, STATE_FILE), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, pages: {} }; throw error; }
  if (data.version !== 1 || !data.pages || typeof data.pages !== "object" || Array.isArray(data.pages)) throw new Error("Invalid RSS state file.");
  for (const record of Object.values(data.pages)) {
    if (!/^[a-f0-9]{64}$/.test(record.fingerprint)) throw new Error("Invalid RSS content fingerprint.");
    if (Date.parse(timestamp(record.published)) > Date.parse(timestamp(record.updated))) throw new Error("RSS publication is later than update.");
  }
  return data;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

export function pageDates(root, relativePath, fingerprint, previous) {
  if (previous?.fingerprint === fingerprint) return previous;
  const repositoryPath = `public/${relativePath}`;
  let history = [];
  try {
    history = git(root, ["log", "--format=%H%x09%cI", "--", ...reportSourcePaths(relativePath)]).trim().split("\n").filter(Boolean)
      .map((line) => { const [sha, date] = line.split("\t"); return { sha, date: timestamp(date) }; });
  } catch { /* A source export can reuse the saved state or SOURCE_DATE_EPOCH. */ }
  let updated;
  // The oldest commit in the current identical-content streak is the edit
  // date; a later metadata-only bot commit must not reset it.
  for (const commit of history) {
    let committed;
    try { committed = contentFingerprint(committedReportSource((args) => git(root, args), relativePath, commit.sha), relativePath); }
    catch { break; }
    if (committed !== fingerprint) break;
    updated = commit.date;
  }
  if (!updated && /^\d+$/.test(process.env.SOURCE_DATE_EPOCH || "")) {
    updated = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  }
  if (!updated) throw new Error(`Cannot date ${repositoryPath}. Commit the page first, or set SOURCE_DATE_EPOCH for a local source export. Do not use file mtimes/build time.`);
  const published = previous?.published || history.at(-1)?.date || updated;
  if (Date.parse(updated) < Date.parse(published) || (previous && Date.parse(updated) < Date.parse(previous.updated))) {
    throw new Error(`RSS date moved backwards for ${repositoryPath}. Check commit timestamps.`);
  }
  return { fingerprint, published, updated };
}

export function renderFeed(pages) {
  const ordered = [...pages].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated) || a.route.localeCompare(b.route, "en"));
  const items = ordered.map(({ route, title, description, published, updated }) => {
    const url = SITE_URL + route;
    // RSS descriptions allow HTML. Encode the public summary as plain text
    // inside that HTML representation before escaping it for the XML envelope.
    const summary = escapeHtml(description || `${title}をHTML Shareで共有しています。`);
    return `    <item>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(url)}</link>\n      <guid isPermaLink="true">${escapeXml(url)}</guid>\n      <description>${escapeXml(summary)}</description>\n      <pubDate>${new Date(timestamp(updated)).toUTCString()}</pubDate>\n      <dcterms:created>${timestamp(published)}</dcterms:created>\n      <dcterms:modified>${timestamp(updated)}</dcterms:modified>\n    </item>`;
  }).join("\n");
  const newest = ordered[0]?.updated;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/">\n  <channel>\n    <title>${SITE_NAME}</title>\n    <link>${SITE_URL}/</link>\n    <description>HTML Shareの共有ページの新規公開・更新</description>\n    <language>ja</language>\n    <atom:link href="${SITE_URL}${FEED_PATH}" rel="self" type="application/rss+xml"/>\n    <ttl>5</ttl>\n${newest ? `    <lastBuildDate>${new Date(timestamp(newest)).toUTCString()}</lastBuildDate>\n` : ""}${items}${items ? "\n" : ""}  </channel>\n</rss>\n`;
}

export async function writeFeed(root, pages) {
  const previous = await readFeedState(root);
  const records = {};
  const entries = pages.map(({ relativePath, source, ...details }) => {
    const fingerprint = contentFingerprint(source, relativePath);
    const dates = pageDates(root, relativePath, fingerprint, previous.pages[relativePath]);
    records[relativePath] = dates;
    return { ...details, ...dates };
  });
  await writeFile(path.join(root, "public", FEED_PATH.slice(1)), renderFeed(entries), "utf8");
  await writeFile(path.join(root, STATE_FILE), JSON.stringify({ version: 1, pages: records }, null, 2) + "\n", "utf8");
}

