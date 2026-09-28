import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve("public");
const outputFile = path.join(publicDir, "index.html");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }

  return files;
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractTitle(html, fallback) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim()) : fallback;
}

function extractDescription(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const name =
      tag.match(/\bname\s*=\s*"([^"]*)"/i)?.[1] ??
      tag.match(/\bname\s*=\s*'([^']*)'/i)?.[1];

    if (name?.toLowerCase() !== "description") continue;

    const content =
      tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ??
      tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];

    if (content) return decodeHtmlEntities(content.trim());
  }

  return "";
}

function routeFor(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");

  if (normalized === "index.html") return "/";

  if (normalized.endsWith("/index.html")) {
    return "/" + normalized.slice(0, -"index.html".length);
  }

  return "/" + normalized.slice(0, -".html".length);
}

const files = (await walk(publicDir))
  .filter((file) => path.resolve(file) !== path.resolve(outputFile))
  .sort((a, b) => a.localeCompare(b, "ja"));

const pages = [];

for (const file of files) {
  const relativePath = path.relative(publicDir, file);
  const html = await readFile(file, "utf8");
  const route = routeFor(relativePath);
  const fallbackTitle = path.basename(file, ".html");

  pages.push({
    route,
    title: extractTitle(html, fallbackTitle),
    description: extractDescription(html),
  });
}

const cards = pages.length
  ? pages.map(({ route, title, description }) => `
      <article class="card">
        <a href="${escapeHtml(route)}">
          <h2>${escapeHtml(title)}</h2>
          ${description ? `<p>${escapeHtml(description)}</p>` : ""}
          <code>${escapeHtml(route)}</code>
        </a>
      </article>`
    ).join("\n")
  : '<p class="empty">まだ共有ページはありません。</p>';

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="ChatGPTで生成したHTMLを共有するためのページ一覧です。">
  <title>HTML Share</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f1115;
      --panel: #171a21;
      --border: #2b313d;
      --text: #f2f4f8;
      --sub: #aeb6c5;
      --accent: #8eb0ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
      line-height: 1.65;
    }
    main {
      width: min(900px, calc(100% - 32px));
      margin: 0 auto;
      padding: 56px 0 80px;
    }
    header { margin-bottom: 32px; }
    h1 { margin: 0 0 8px; font-size: clamp(2rem, 6vw, 3.5rem); }
    .lead { margin: 0; color: var(--sub); }
    .count { margin-top: 12px; color: var(--sub); font-size: .95rem; }
    .grid { display: grid; gap: 14px; }
    .card {
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--panel);
      transition: transform .12s ease, border-color .12s ease;
    }
    .card:hover { transform: translateY(-2px); border-color: #46516a; }
    .card a {
      display: block;
      padding: 20px;
      color: inherit;
      text-decoration: none;
    }
    .card h2 { margin: 0 0 8px; font-size: 1.15rem; }
    .card p { margin: 0 0 12px; color: var(--sub); }
    code { color: var(--accent); }
    .empty { color: var(--sub); }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>HTML Share</h1>
      <p class="lead">共有ページ一覧</p>
      <p class="count">${pages.length} page${pages.length === 1 ? "" : "s"}</p>
    </header>
    <section class="grid">
${cards}
    </section>
  </main>
</body>
</html>
`;

await writeFile(outputFile, html, "utf8");
console.log(`Generated public/index.html with ${pages.length} page(s).`);
