import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeHTML } from "entities";
import { pageDetails, routeFor, scanTags } from "./social-metadata.mjs";
import { isReportArchive } from "./split-vulnerabilities.mjs";
import { isTechnologyArchive } from "./split-technology-updates.mjs";

const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const excluded = new Set("head script style template noscript textarea nav form button select option".split(" "));
const blocks = new Set("article section header footer main div p li ul ol dl dt dd table tr td th h1 h2 h3 h4 h5 h6 pre blockquote br hr".split(" "));
const clean = (text) => decodeHTML(text).replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/gu, " ").trim();

// Read only visible public HTML text. Never inspect JSON, attributes, head
// metadata, private report sources, Git history, or any non-public directory.
export function publicSections(html) {
  const sections = [];
  const stack = [];
  let inBody = false;
  let cursor = 0;
  let buffer = "";
  let anchor = "";
  let headingAnchor = "";
  let templateDepth = 0;
  const flush = () => {
    const text = clean(buffer);
    if (text) sections.push({ text, anchor });
    buffer = "";
  };
  const activeAnchor = () => [...stack].reverse().find((item) => item.id)?.id || headingAnchor;
  const append = (text) => {
    if (!inBody || stack.some((item) => item.excluded)) return;
    const nextAnchor = activeAnchor();
    if (anchor !== nextAnchor) { flush(); anchor = nextAnchor; }
    buffer += text;
    // Bound snippet work even for a giant text node. An overlap at least as
    // long as the supported query retains phrases across chunk boundaries.
    while (buffer.length > 2400) {
      let end = 2400;
      if (/[\uDC00-\uDFFF]/.test(buffer[end])) end++;
      const text = clean(buffer.slice(0, end));
      if (text) sections.push({ text, anchor });
      let start = end - 200;
      if (/[\uDC00-\uDFFF]/.test(buffer[start])) start--;
      buffer = buffer.slice(start);
    }
  };
  for (const tag of scanTags(html)) {
    append(html.slice(cursor, tag.start));
    cursor = tag.end;
    if (tag.name === "#comment") continue;
    const inTemplate = templateDepth > 0;
    if (tag.name === "template") templateDepth = Math.max(0, templateDepth + (tag.closing ? -1 : 1));
    if (tag.name === "body") {
      if (inTemplate || stack.some((item) => item.excluded)) continue;
      if (tag.closing) { flush(); inBody = false; stack.length = 0; }
      else inBody = true;
      continue;
    }
    if (!inBody) continue;
    if (blocks.has(tag.name)) append(" ");
    if (tag.closing) {
      const index = stack.findLastIndex((item) => item.name === tag.name);
      if (index >= 0) stack.splice(index);
    } else if (!voidTags.has(tag.name)) {
      const id = tag.attrs.get("id")?.value || "";
      const hidden = tag.attrs.has("hidden") || tag.attrs.get("aria-hidden")?.value === "true" || id === "archive-index";
      stack.push({ name: tag.name, id, excluded: hidden || excluded.has(tag.name) });
      if (/^h[1-6]$/.test(tag.name) && id && !stack.some((item) => item.excluded)) headingAnchor = id;
    }
  }
  append(html.slice(cursor));
  flush();
  return sections;
}

function publicArticles(html, className = "advisory") {
  const sections = [];
  let start = null;
  let depth = 0;
  for (const tag of scanTags(html)) {
    if (tag.name !== "article") continue;
    if (!tag.closing) {
      if (start === null && tag.attrs.get("class")?.value.split(/\s+/).includes(className)) start = tag.start;
      if (start !== null) depth++;
    } else if (start !== null && --depth === 0) {
      sections.push(...publicSections(`<body>${html.slice(start, tag.end)}</body>`));
      start = null;
    }
  }
  return sections;
}

export async function writeSearchIndex(root, htmlFiles) {
  const publicDir = path.join(root, "public");
  const documents = [];
  const archives = [];
  const technologyArchives = [];
  for (const file of htmlFiles) {
    const relative = path.relative(publicDir, file).split(path.sep).join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative) || relative === "index.html") continue;
    const html = await readFile(file, "utf8");
    if (isReportArchive(relative)) { archives.push(...publicArticles(html)); continue; }
    if (isTechnologyArchive(relative)) {
      if (relative.startsWith("technology-updates/archive/")) technologyArchives.push(...publicArticles(html, "update"));
      if (relative.startsWith("technology-updates/history")) {
        const section = html.match(/<section class="history"[\s\S]*?<\/section>/)?.[0];
        // A historical correction may be absent from the bounded recent shell.
        // Link its match to the actual static history page that contains it.
        if (section) documents.push({ route: routeFor(relative), ...pageDetails(html, "更新・訂正履歴"), sections: publicSections(`<body>${section}</body>`) });
      }
      continue;
    }
    documents.push({ route: routeFor(relative), ...pageDetails(html, path.basename(relative, ".html")), sections: publicSections(html) });
  }
  const vulnerabilities = documents.find((document) => document.route === "/vulnerabilities");
  if (vulnerabilities) vulnerabilities.sections.push(...archives);
  const technology = documents.find((document) => document.route === "/technology-updates");
  if (technology) technology.sections.push(...technologyArchives);
  for (const document of documents) {
    const seen = new Set();
    document.sections = document.sections.filter((section) => {
      const key = `${section.anchor}\0${section.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const content = JSON.stringify({ version: 1, documents }).replace(/</g, "\\u003c") + "\n";
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const name = `index-${hash}.json`;
  const assetDir = path.join(publicDir, "assets/search");
  await mkdir(assetDir, { recursive: true });
  await writeFile(path.join(assetDir, name), content, "utf8");
  for (const old of await readdir(assetDir)) {
    if (/^index-[a-f0-9]{16}\.json$/.test(old) && old !== name) await rm(path.join(assetDir, old));
  }
  return `/assets/search/${name}`;
}
