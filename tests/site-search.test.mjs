import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publicSections, writeSearchIndex } from "../scripts/search-index.mjs";
import { normalizeSearch, prepareIndex, queryTerms, searchDocuments, snippet } from "../public/assets/site-search-core.js";
import { initSearch } from "../public/assets/site-search.js";

const html = (body, title = "Test") => `<html><head><title>${title}</title><meta name="description" content="説明"></head><body>${body}</body></html>`;
const data = (sections = [{ text: "本文だけのサーバー設定。これは検索の前後の文です。", anchor: "body-only" }]) => ({ version: 1, documents: [{ route: "/memo/page", title: "ページ", description: "説明", sections }] });

test("Japanese normalization handles width, case, kana, dakuten and compatibility forms", () => {
  assert.equal(normalizeSearch(" ＣＬＯＵＤＦＬＡＲＥ　ｻｰﾊﾞｰ ガイド "), "cloudflare さーばー がいど");
  assert.equal(normalizeSearch("か\u3099 ＡＷＳ\u200b"), "が aws");
  assert.deepEqual(queryTerms("検索　検索 AWS"), ["検索", "aws"]);
  const docs = prepareIndex(data());
  assert.equal(searchDocuments(docs, "さーばー 設定").length, 1);
  assert.equal(searchDocuments(docs, "設定 存在しない語").length, 0);
  assert.deepEqual(searchDocuments(docs, " \u200b "), []);
});

test("public extraction keeps body/inline/details text and existing anchors, excludes metadata/raw/hidden data", () => {
  const source = html(`<main id="main"><h2 id="本文">全文<strong>検索</strong></h2><p>A &amp; B &lt;img onerror=alert(1)&gt;</p><details><summary>開く</summary>折りたたみの本文</details><script type="application/json">PRIVATE_JSON</script><style>PRIVATE_CSS</style><!-- PRIVATE_COMMENT --><p hidden>PRIVATE_HIDDEN</p><p aria-hidden="true">PRIVATE_ARIA</p><template><body>PRIVATE_TEMPLATE</body></template><nav>PRIVATE_NAV</nav></main>`, "PRIVATE_HEAD");
  const sections = publicSections(source);
  const text = sections.map((section) => section.text).join(" ");
  assert.match(text, /全文検索/);
  assert.match(text, /A & B <img onerror=alert\(1\)>/);
  assert.match(text, /折りたたみの本文/);
  assert.doesNotMatch(text, /PRIVATE_/);
  assert.ok(sections.some((section) => section.anchor === "本文"));
  assert.deepEqual(publicSections('<html><head><template><body>INERT</body></template></head><body>本当の本文</body></html>'), [{ text: "本当の本文", anchor: "" }]);
  assert.deepEqual(publicSections('<body><noscript><body>INERT</body></noscript>省略可能な終了タグの前の本文'), [{ text: "省略可能な終了タグの前の本文", anchor: "" }]);
});

test("body-only matches and snippets use original text safely including normalized offsets", () => {
  const docs = prepareIndex(data([{ text: "前置き".repeat(80) + "半角ｻｰﾊﾞｰ・か\u3099・<img onerror=alert(1)>・後の文", anchor: "old-anchor" }]));
  const result = searchDocuments(docs, "サーバー")[0];
  assert.equal(result.section.anchor, "old-anchor");
  const detail = snippet(result.section.text, "サーバー");
  assert.equal(detail.before, true);
  assert.equal(detail.text.slice(...detail.ranges[0]), "ｻｰﾊﾞｰ");
  assert.equal(snippet("か\u3099", "ガ").text.slice(...snippet("か\u3099", "ガ").ranges[0]), "か\u3099");
  assert.equal(snippet("㍿", "株式会社").text.slice(...snippet("㍿", "株式会社").ranges[0]), "㍿");
  assert.match(snippet(result.section.text, "<img").text, /<img onerror=alert\(1\)>/);
  assert.deepEqual(snippet("🚀本文", "missing").ranges, []);
});

test("search index rejects unsafe link destinations and ranks title/body deterministically", () => {
  for (const route of ["https://evil.invalid", "//evil.invalid", "/path\\evil", "/path?q=x", "/path#x"]) {
    const value = data(); value.documents[0].route = route;
    assert.throws(() => prepareIndex(value), /Invalid/);
  }
  const value = data([{ text: "検索語がある長い導入".repeat(40), anchor: "main" }, { text: "検索語がある具体的な本文", anchor: "record" }]);
  value.documents.push({ route: "/title", title: "検索語", description: "", sections: [] });
  const results = searchDocuments(prepareIndex(value), "検索語");
  assert.equal(results[0].route, "/title");
  assert.equal(results[1].section.anchor, "record");
});

test("generation uses only public HTML and groups all public archive articles under the original report route", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "html-share-search-"));
  try {
    await mkdir(path.join(root, "public/vulnerabilities/archive"), { recursive: true });
    await mkdir(path.join(root, "reports"));
    const sources = new Map([
      ["public/vulnerabilities.html", html('<p>公開の導入</p><article class="advisory" id="one">公開一件目</article>')],
      ["public/vulnerabilities/archive/page-2.html", html('<p>ARCHIVE_CHROME</p><article class="advisory" id="old-record">本文だけの非常に珍しい語</article>')],
      ["public/large.html", html('<p>' + '大きな本文。'.repeat(40000) + '末尾だけのキーワード</p><script>PRIVATE_SCRIPT</script>')],
      ["reports/vulnerabilities.source.html", html("PRIVATE_SOURCE_SENTINEL")],
      ["public/index.html", html("OLD_INDEX_SENTINEL")],
    ]);
    for (const [file, content] of sources) await writeFile(path.join(root, file), content);
    const url = await writeSearchIndex(root, [...sources.keys()].map((file) => path.join(root, file)));
    const bytes = await readFile(path.join(root, "public", url), "utf8");
    assert.doesNotMatch(bytes, /PRIVATE_|OLD_INDEX_SENTINEL|ARCHIVE_CHROME/);
    const docs = prepareIndex(JSON.parse(bytes));
    assert.equal(docs.length, 2);
    assert.equal(searchDocuments(docs, "非常に珍しい語")[0].route, "/vulnerabilities");
    assert.equal(searchDocuments(docs, "非常に珍しい語")[0].section.anchor, "old-record");
    assert.equal(searchDocuments(docs, "末尾だけのキーワード")[0].route, "/large");
    assert.ok(docs.every((doc) => doc.sections.every((section) => section.text.length <= 2401)));
    assert.equal(await writeSearchIndex(root, [...sources.keys()].map((file) => path.join(root, file))), url);
    assert.equal((await readdir(path.join(root, "public/assets/search"))).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

class Element {
  constructor(tag = "div") { this.tagName = tag; this.children = []; this.listeners = {}; this.hidden = false; this.value = ""; this.dataset = {}; this.attrs = {}; this.focused = false; this._text = ""; }
  set textContent(value) { this._text = value; this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this._text = ""; this.children = items; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  dispatch(name) { this.listeners[name]?.({ preventDefault() {} }); }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  focus() { this.focused = true; }
  querySelector(tag) { return this.children.find((child) => child.tagName === tag); }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(fetch) {
  const ids = Object.fromEntries(["site-search", "search-query", "search-clear", "search-status", "search-results", "page-list", "search-more"].map((id) => [id, new Element()]));
  ids["site-search"].dataset.index = "/assets/search/index-1234567890abcdef.json";
  const document = { getElementById: (id) => ids[id], createElement: (tag) => new Element(tag), createTextNode: (text) => { const node = new Element("text"); node.textContent = text; return node; } };
  const listeners = {};
  const timers = new Map();
  const history = [];
  const window = { location: { href: "https://share.0g0.xyz/" }, fetch, history: {}, addEventListener: (name, fn) => { listeners[name] = fn; }, setTimeout: (fn) => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id) };
  for (const name of ["pushState", "replaceState"]) window.history[name] = (_, __, url) => { history.push([name, String(url)]); window.location.href = String(url); };
  const controls = initSearch(document, window, fetch);
  return { ids, document, window, listeners, timers, history, ...controls };
}

test("UI lazy-loads once, safely renders marks/links, clears with keyboard focus and restores URL history", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return { ok: true, json: async () => data([{ text: '本文 <img src=x onerror=alert(1)> サーバー', anchor: 'old anchor' }]) }; });
  assert.equal(calls, 0);
  f.ids["search-query"].value = "さーばー";
  await f.run(true);
  assert.equal(calls, 1);
  assert.equal(f.ids["page-list"].hidden, true);
  assert.equal(f.ids["search-results"].children[0].children[0].href, "/memo/page#old%20anchor");
  const summary = f.ids["search-results"].children[0].children[0].children[1];
  assert.match(summary.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.ok(summary.children.some((node) => node.tagName === "mark"));
  assert.ok(summary.children.every((node) => ["text", "mark"].includes(node.tagName)));
  f.ids["search-query"].value = "見つからない";
  await f.run();
  assert.equal(calls, 1);
  assert.match(f.ids["search-status"].textContent, /見つかりません/);
  f.ids["search-clear"].dispatch("click");
  assert.equal(f.ids["page-list"].hidden, false);
  assert.equal(f.ids["search-query"].focused, true);
  assert.equal(new URL(f.window.location.href).searchParams.has("q"), false);
  f.window.location.href = "https://share.0g0.xyz/?q=サーバー";
  f.listeners.popstate(); await tick();
  assert.equal(f.ids["search-query"].value, "サーバー");
  assert.equal(f.ids["search-results"].children.length, 1);
});

test("UI preserves page list on failure, retries downloads, and prevents stale response/IME races", async () => {
  let calls = 0;
  let resolve;
  const f = fixture(async () => { calls++; if (calls === 1) throw new Error("offline"); return new Promise((done) => { resolve = done; }); });
  f.ids["search-query"].value = "サーバー";
  await f.run();
  assert.equal(f.ids["page-list"].hidden, false);
  assert.match(f.ids["search-status"].textContent, /再試行/);
  const pending = f.run(); await tick();
  f.ids["search-query"].dispatch("compositionstart");
  f.ids["search-query"].value = "設定";
  f.ids["search-query"].dispatch("input");
  assert.equal(f.timers.size, 0);
  resolve({ ok: true, json: async () => data() }); await pending;
  assert.equal(f.ids["search-results"].children.length, 0);
  f.ids["search-query"].dispatch("compositionend"); await tick();
  assert.equal(f.ids["search-results"].children.length, 1);
  assert.equal(calls, 2);
  assert.equal(f.ids["search-results"].attrs["aria-busy"], undefined);
});

test("UI bounds result DOM to 20 and moves keyboard focus to newly displayed results", async () => {
  const value = data();
  value.documents = Array.from({ length: 45 }, (_, index) => ({ ...value.documents[0], route: `/page-${index}` }));
  const f = fixture(async () => ({ ok: true, json: async () => value }));
  f.ids["search-query"].value = "サーバー"; await f.run();
  assert.equal(f.ids["search-results"].children.length, 20);
  assert.equal(f.ids["search-more"].hidden, false);
  f.ids["search-more"].dispatch("click");
  assert.equal(f.ids["search-results"].children.length, 40);
  assert.equal(f.ids["search-results"].children[20].children[0].focused, true);
  f.ids["search-more"].dispatch("click");
  assert.equal(f.ids["search-results"].children.length, 45);
  assert.equal(f.ids["search-more"].hidden, true);
});

test("submitted queries create useful history even after live input updated the URL", async () => {
  const f = fixture(async () => ({ ok: true, json: async () => data() }));
  f.ids["search-query"].value = "サーバー"; await f.run();
  assert.equal(f.history.at(-1)[0], "replaceState");
  await f.run(true);
  assert.equal(f.history.at(-2)[1], "https://share.0g0.xyz/");
  assert.equal(f.history.at(-1)[0], "pushState");
  const previous = f.window.location.href;
  f.ids["search-query"].value = "設定"; await f.run(); await f.run(true);
  assert.equal(f.history.at(-2)[1], previous);
  assert.equal(f.history.at(-1)[0], "pushState");
  f.window.location.href = previous; f.listeners.popstate(); await tick();
  assert.equal(f.ids["search-query"].value, "サーバー");
});
