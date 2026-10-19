import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addSocialMetadata, escapeHtml, pageDetails, routeFor } from "./social-metadata.mjs";
import { addFeedDiscovery, writeFeed } from "./rss-feed.mjs";
import { REPORT_FEEDS, writeReportFeeds } from "./report-feeds.mjs";
import { authoredReportSource } from "./report-source.mjs";
import { generateSplitVulnerabilities, isReportArchive } from "./split-vulnerabilities.mjs";
import { generateSplitTechnologyUpdates, isTechnologyArchive } from "./split-technology-updates.mjs";
import { writeSearchIndex } from "./search-index.mjs";

const publicDir = path.resolve("public");
const outputFile = path.join(publicDir, "index.html");
await generateSplitVulnerabilities(path.resolve("."));
await generateSplitTechnologyUpdates(path.resolve("."));

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

const allFiles = (await walk(publicDir))
  .filter((file) => path.resolve(file) !== path.resolve(outputFile))
  .sort((a, b) => a.localeCompare(b, "ja"));
const files = allFiles
  .filter((file) => path.resolve(file) !== path.resolve(outputFile))
  .filter((file) => !isReportArchive(path.relative(publicDir, file).split(path.sep).join("/")))
  .filter((file) => !isTechnologyArchive(path.relative(publicDir, file).split(path.sep).join("/")))
  .sort((a, b) => a.localeCompare(b, "ja"));

const pages = [];

for (const file of files) {
  const relativePath = path.relative(publicDir, file);
  const html = await authoredReportSource(path.resolve("."), relativePath, await readFile(file, "utf8"));
  const route = routeFor(relativePath);
  const fallbackTitle = path.basename(file, ".html");
  const details = pageDetails(html, fallbackTitle);

  pages.push({
    route,
    relativePath: relativePath.split(path.sep).join("/"),
    source: html,
    ...details,
  });
}

const searchUrl = await writeSearchIndex(path.resolve("."), allFiles);

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
    .rss { color: var(--accent); text-underline-offset: .2em; }
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
    .site-guide { margin: 20px 0; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    .guide-item + .guide-item { border-top: 1px solid var(--border); }
    .guide-heading { margin: 0; font-size: 1rem; }
    .guide-trigger, .site-guide summary { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 18px; min-height: 48px; border: 0; border-radius: 0; background: var(--panel); text-align: left; cursor: pointer; font-weight: 650; }
    .site-guide summary { display: list-item; list-style-position: inside; }
    .guide-trigger[data-state="open"] .guide-chevron { transform: rotate(180deg); }
    .guide-inner, .site-guide details > div { padding: 0 18px 14px; }
    .site-guide p { color: var(--sub); margin: 12px 0; }
    .site-guide ul { padding-left: 20px; margin: 0; }
    .site-guide a { display: inline-block; color: var(--accent); padding: 6px 0; text-underline-offset: .2em; overflow-wrap: anywhere; }
    .guide-panel { overflow: hidden; }

    [hidden] { display: none !important; }
    .search { margin: 24px 0 20px; }
    .search label { display: block; font-weight: 650; margin-bottom: 8px; }
    .search-controls { display: flex; flex-wrap: wrap; gap: 8px; }
    .search input { flex: 1 1 260px; min-width: 0; width: 100%; }
    .search input, button { border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--text); font: inherit; padding: 10px 14px; min-height: 44px; }
    button { cursor: pointer; }
    .search-help, .search-status { color: var(--sub); font-size: .95rem; margin: 8px 0 0; }
    .search-status { min-height: 1.65em; }
    :focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
    .card h2, .card p, .result-route { overflow-wrap: anywhere; }
    .result-route { color: var(--accent); font-size: .9rem; }
    mark { background: #ffdb83; color: #1a1720; border-radius: 2px; }
    #search-more { margin-top: 16px; }
    @media (max-width: 480px) { main { padding-top: 28px; } .card a { padding: 16px; } }
    @media (prefers-reduced-motion: reduce) { .card { transition: none; } .card:hover { transform: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>HTML Share</h1>
      <p class="lead">共有ページ一覧</p>
      <p><a class="rss" href="/feed.xml">RSSで新規公開・更新を購読</a></p>
      <p>${REPORT_FEEDS.map((feed) => `<a class="rss" href="${feed.path}">${escapeHtml(feed.title)}を購読</a>`).join(" · ")}</p>
      <p class="count">${pages.length} page${pages.length === 1 ? "" : "s"}</p>
    </header>
    <div id="site-guide-fallback" class="site-guide" aria-label="ページの探し方と購読">
      <details class="guide-item" data-guide-section="reports"><summary>よく読むレポートへ</summary><div><p>更新を追いたいページを直接開けます。</p><ul><li><a href="/technology-updates">技術アップデート</a></li><li><a href="/vulnerabilities">重要な脆弱性</a></li><li><a href="/security-incidents">情報流出・セキュリティ事案</a></li></ul></div></details>
      <details class="guide-item" data-guide-section="search"><summary>本文まで探す・更新を受け取る</summary><div><p>下の検索はスペース区切りのAND検索です。RSSは申込みなしで購読アプリに追加できます。</p><ul><li><a href="#site-search">本文を検索する</a></li><li><a href="/feed.xml">全ページの更新RSS</a></li><li><a href="/vulnerabilities-feed.xml">脆弱性の更新RSS</a></li><li><a href="/security-incidents-feed.xml">事案の更新RSS</a></li></ul></div></details>
    </div>
    <div id="site-guide-enhanced" aria-label="ページの探し方と購読" hidden></div>
    <form id="site-search" class="search" role="search" data-index="${searchUrl}" hidden>
      <label for="search-query">タイトル・本文を検索</label>
      <div class="search-controls">
        <input id="search-query" name="q" type="search" placeholder="例：Cloudflare 日本語" maxlength="200" enterkeyhint="search" autocomplete="off" aria-describedby="search-help search-status">
        <button type="submit">検索</button>
        <button id="search-clear" type="button" hidden>クリア</button>
      </div>
      <p id="search-help" class="search-help">スペース区切りで複数の言葉を検索できます。全角・半角、ひらがな・カタカナを区別しません。</p>
      <p id="search-status" class="search-status" role="status" aria-live="polite" aria-atomic="true">タイトルと本文を検索できます。</p>
    </form>
    <noscript><p class="search-help">全文検索にはJavaScriptが必要です。下の一覧から各ページを開けます。</p></noscript>
    <section id="search-results" class="grid" aria-label="検索結果" hidden></section>
    <button id="search-more" type="button" hidden>さらに20件を表示</button>
    <section id="page-list" class="grid" aria-label="共有ページ一覧">
${cards}
    </section>
  </main>
  <script type="module" src="/assets/site-search.js"></script>
  <script type="module" src="/assets/site-guide-loader.js"></script>
</body>
</html>
`;

// Fail the build rather than publish a broken common preview image.
const image = await readFile(path.join(publicDir, "assets/html-share-card-v1.png"));
if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    image.length < 24 || image.readUInt32BE(16) !== 1200 || image.readUInt32BE(20) !== 630) {
  throw new Error("The common social image must be a 1200×630 PNG.");
}
await writeReportFeeds(path.resolve("."), pages);
await writeFeed(path.resolve("."), pages);
await writeFile(outputFile, addFeedDiscovery(addSocialMetadata(html, "index.html"), REPORT_FEEDS), "utf8");
for (const file of files) {
  const source = await readFile(file, "utf8");
  const relativePath = path.relative(publicDir, file).split(path.sep).join("/");
  const generated = addFeedDiscovery(addSocialMetadata(source, relativePath), REPORT_FEEDS.filter((feed) => feed.relativePath === relativePath));
  if (generated !== source) await writeFile(file, generated, "utf8");
}
console.log(`Generated index, lazy full-text search, general/report RSS feeds and social metadata for ${pages.length} page(s).`);


