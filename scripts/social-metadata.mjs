import path from "node:path";
import { decodeHTML, decodeHTMLAttribute } from "entities";

export const SITE_URL = "https://share.0g0.xyz";
export const SITE_NAME = "HTML Share";
export const DEFAULT_IMAGE = `${SITE_URL}/assets/html-share-card-v1.png`;
const START = "<!-- html-share: social metadata -->";
const END = "<!-- /html-share: social metadata -->";

export const decodeHtmlEntities = decodeHTML;

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// A small HTML tag scanner, not a document serializer: keep every source byte
// outside generated metadata intact. Quoted '>' and raw-text elements are safe.
export function scanTags(html) {
  const tags = [];
  const opener = /<!--|<![^>]*>|<\/?[a-z][\w:-]*\b/gi;
  let match;
  while ((match = opener.exec(html))) {
    if (match[0] === "<!--") {
      const end = html.indexOf("-->", opener.lastIndex);
      if (end >= 0) tags.push({ name: "#comment", closing: false, attrs: new Map(), start: match.index, end: end + 3 });
      opener.lastIndex = end < 0 ? html.length : end + 3;
      continue;
    }
    if (match[0].startsWith("<!")) continue;
    let end = opener.lastIndex;
    let quote = "";
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end === html.length) break;
    const name = match[0].replace(/^<\/?/, "").toLowerCase();
    const closing = match[0].startsWith("</");
    const attrs = new Map();
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
    const attrSource = html.slice(opener.lastIndex, end);
    let attribute;
    while ((attribute = attrPattern.exec(attrSource))) {
      const raw = attribute[2] ?? "";
      const quoted = raw.startsWith('"') || raw.startsWith("'");
      const key = attribute[1].toLowerCase();
      if (!attrs.has(key)) attrs.set(key, {
        value: decodeHTMLAttribute(quoted ? raw.slice(1, -1) : raw),
        start: opener.lastIndex + attribute.index + attribute[0].length - raw.length,
        end: opener.lastIndex + attribute.index + attribute[0].length,
      });
    }
    tags.push({ name, closing, attrs, start: match.index, end: end + 1 });
    opener.lastIndex = end + 1;
    if (!closing && /^(script|style|title|textarea)$/.test(name)) {
      const close = new RegExp(`</${name}\\s*>`, "gi");
      close.lastIndex = opener.lastIndex;
      const found = close.exec(html);
      opener.lastIndex = found ? found.index : html.length;
    }
  }
  return tags;
}

function headTags(html) {
  // Template contents are inert: their tags must never suppress real metadata.
  let templateDepth = 0;
  const tags = scanTags(html).filter((tag) => {
    if (tag.name === "template") {
      templateDepth = Math.max(0, templateDepth + (tag.closing ? -1 : 1));
      return false;
    }
    return templateDepth === 0;
  });
  const opening = tags.find((tag) => tag.name === "head" && !tag.closing);
  const closing = tags.find((tag) => tag.name === "head" && tag.closing && tag.start > opening?.end);
  if (!opening || !closing) throw new Error("Shared HTML must contain an explicit <head>...</head>.");
  return { tags: tags.filter((tag) => tag.start >= opening.end && tag.end <= closing.start), closing };
}

export function pageDetails(html, fallbackTitle) {
  const { tags } = headTags(html);
  const titleTag = tags.find((tag) => tag.name === "title" && !tag.closing);
  const titleEnd = titleTag && tags.find((tag) => tag.name === "title" && tag.closing && tag.start >= titleTag.end);
  const title = titleEnd ? decodeHtmlEntities(html.slice(titleTag.end, titleEnd.start)).replace(/\s+/g, " ").trim() : "";
  const descriptionTag = tags.find((tag) => tag.name === "meta" && tag.attrs.get("name")?.value.toLowerCase() === "description");
  return { title: title || fallbackTitle, description: descriptionTag?.attrs.get("content")?.value.trim() || "" };
}

export function routeFor(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const route = normalized === "index.html" ? "" : normalized.endsWith("/index.html")
    ? normalized.slice(0, -"index.html".length) : normalized.replace(/\.html$/, "");
  return "/" + route.split("/").map(encodeURIComponent).join("/");
}

function absoluteUrl(value, base) {
  const url = new URL(value, base);
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Social metadata URL must use HTTP(S): ${value}`);
  return url.href;
}

export function addSocialMetadata(source, relativePath) {
  // Only our marked block is replaced. Authored tags remain authoritative.
  let html = source;
  const comments = headTags(source).tags.filter((tag) => tag.name === "#comment");
  const blocks = [];
  for (let index = 0; index < comments.length; index++) {
    const comment = comments[index];
    if (source.slice(comment.start, comment.end) !== START) continue;
    const ending = comments.slice(index + 1).find((tag) => source.slice(tag.start, tag.end) === END);
    if (!ending) throw new Error("Unclosed generated social metadata block.");
    let start = comment.start;
    while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
    let end = ending.end;
    while (/[ \t]/.test(source[end] || "!")) end++;
    if (source.slice(end, end + 2) === "\r\n") end += 2;
    else if (source[end] === "\n") end++;
    blocks.push({ start, end });
    index = comments.indexOf(ending);
  }
  for (const { start, end } of blocks.reverse()) html = html.slice(0, start) + html.slice(end);
  // Empty authored tags contain no override. Remove them so crawlers do not
  // choose an empty first value, and regenerated defaults can still refresh.
  const managed = /^(og:(type|site_name|title|description|url|image(:url|:secure_url|:type|:width|:height|:alt)?)|twitter:(card|title|description|image(:src|:alt)?))$/;
  const empty = headTags(html).tags.filter((tag) =>
    (tag.name === "meta" && managed.test(tag.attrs.get("property")?.value.toLowerCase() || tag.attrs.get("name")?.value.toLowerCase() || "") && !tag.attrs.get("content")?.value.trim()) ||
    (tag.name === "link" && tag.attrs.get("rel")?.value.toLowerCase().split(/\s+/).includes("canonical") && !tag.attrs.get("href")?.value.trim())
  );
  for (const tag of empty.reverse()) html = html.slice(0, tag.start) + html.slice(tag.end);
  let { tags } = headTags(html);
  const routeUrl = SITE_URL + routeFor(relativePath);
  const getMeta = (key) => tags.find((tag) => tag.name === "meta" &&
    (tag.attrs.get("property")?.value.toLowerCase() === key || tag.attrs.get("name")?.value.toLowerCase() === key));
  const canonical = tags.find((tag) => tag.name === "link" && tag.attrs.get("rel")?.value.toLowerCase().split(/\s+/).includes("canonical"));
  const replacements = [];
  for (const [tag, attr] of [[canonical, "href"], ...tags.filter((tag) => tag.name === "meta" &&
    /^(og:url|og:image|og:image:url|og:image:secure_url|twitter:image|twitter:image:src)$/.test(
      tag.attrs.get("property")?.value.toLowerCase() || tag.attrs.get("name")?.value.toLowerCase() || ""
    )).map((tag) => [tag, "content"])]) {
    const value = tag?.attrs.get(attr);
    if (value?.value) replacements.push({ ...value, replacement: `"${escapeHtml(absoluteUrl(value.value, routeUrl))}"` });
  }
  for (const { start, end, replacement } of replacements.sort((a, b) => b.start - a.start)) {
    html = html.slice(0, start) + replacement + html.slice(end);
  }
  ({ tags } = headTags(html));
  const details = pageDetails(html, path.posix.basename(relativePath, ".html"));
  const content = (key) => getMeta(key)?.attrs.get("content")?.value || "";
  const url = canonical?.attrs.get("href")?.value ? absoluteUrl(canonical.attrs.get("href").value, routeUrl) : content("og:url") || routeUrl;
  const title = content("og:title") || details.title;
  const description = content("og:description") || details.description || `${details.title}をHTML Shareで共有しています。`;
  const imageRoots = tags.filter((tag) => tag.name === "meta" && /^(og:image|og:image:url)$/.test(tag.attrs.get("property")?.value.toLowerCase() || tag.attrs.get("name")?.value.toLowerCase() || ""));
  const image = imageRoots[0]?.attrs.get("content")?.value || DEFAULT_IMAGE;
  const firstImageGroup = imageRoots.length ? tags.slice(tags.indexOf(imageRoots[0]) + 1, imageRoots[1] ? tags.indexOf(imageRoots[1]) : tags.length) : [];
  const authoredAlt = firstImageGroup.find((tag) => tag.name === "meta" && (tag.attrs.get("property")?.value.toLowerCase() || tag.attrs.get("name")?.value.toLowerCase()) === "og:image:alt")?.attrs.get("content")?.value;
  const defaultAlt = "HTML Shareのロゴと共有ページを表すカード";
  const imageAlt = authoredAlt || (image === DEFAULT_IMAGE ? defaultAlt : title);
  const twitterImage = content("twitter:image") || content("twitter:image:src") || image;
  const twitterAlt = twitterImage === image ? imageAlt : twitterImage === DEFAULT_IMAGE ? defaultAlt : title;
  const lines = [];
  if (!canonical) lines.push(`<link rel="canonical" href="${escapeHtml(url)}">`);
  function meta(key, value, property = true) {
    if (!getMeta(key)) lines.push(`<meta ${property ? "property" : "name"}="${key}" content="${escapeHtml(value)}">`);
  }
  meta("og:type", relativePath === "index.html" ? "website" : "article");
  meta("og:site_name", SITE_NAME);
  meta("og:title", title);
  meta("og:description", description);
  meta("og:url", url);
  meta("og:image", image);
  // Do not mislabel the size/type of an explicitly supplied custom image.
  const imageCount = imageRoots.length;
  if (image === DEFAULT_IMAGE && imageCount <= 1) {
    meta("og:image:type", "image/png");
    meta("og:image:width", "1200");
    meta("og:image:height", "630");
  }
  // With multiple authored images, appending a structured property would
  // describe the last image rather than the first. Keep their groups intact.
  if (imageCount <= 1) meta("og:image:alt", imageAlt);
  meta("twitter:card", "summary_large_image", false);
  meta("twitter:title", title, false);
  meta("twitter:description", description, false);
  meta("twitter:image", twitterImage, false);
  meta("twitter:image:alt", twitterAlt, false);
  const { closing } = headTags(html);
  const block = `  ${START}\n${lines.map((line) => `  ${line}`).join("\n")}\n  ${END}\n`;
  return html.slice(0, closing.start).replace(/[ \t]*$/, "") + block + html.slice(closing.start);
}
