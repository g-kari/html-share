import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  linkifyHtml,
  loadGlossaryTerms,
  renderGlossaryTerms,
  unwrapGlossaryLinks,
  updateGlossaryPage,
} from "../scripts/glossary.mjs";
import { contentFingerprint } from "../scripts/rss-feed.mjs";

const terms = [
  { id: "ebpf", term: "eBPF", aliases: [], category: "土台", description: "カーネル内で小さなプログラムを動かす仕組み。" },
  { id: "verifier", term: "eBPF verifier", aliases: [], category: "土台", description: "eBPFプログラムを読み込み前に検査する仕組み。" },
  { id: "abi", term: "ABI", aliases: [], category: "土台", description: "プログラム同士の約束事。" },
  { id: "tpm", term: "TPM", aliases: [], category: "土台", description: "セキュリティ用のチップ。" },
  { id: "codepath", term: "コードパス", aliases: ["脆弱なコードパス"], category: "土台", description: "命令の道筋。" },
];

test("first occurrence only, longest match wins", () => {
  const html = "<html><body><p>eBPF verifierはeBPFを検査する。eBPFは繰り返し出ても1回だけ。</p></body></html>";
  const out = linkifyHtml(html, terms);
  assert.equal((out.match(/class="gloss"/g) || []).length, 2);
  assert.ok(out.includes('<a class="gloss" href="/glossary#term-verifier"'));
  assert.ok(out.includes('<a class="gloss" href="/glossary#term-ebpf"'));
});

test("abbreviations need a word boundary", () => {
  const html = "<html><body><p>XABIやABIsには付けず、 ABI には付ける。TPM 2.0も対象。</p></body></html>";
  const out = linkifyHtml(html, terms);
  assert.ok(!out.includes(">XABI<"));
  assert.ok(out.includes('<a class="gloss" href="/glossary#term-abi" title="プログラム同士の約束事。">ABI</a>'));
  assert.ok(out.includes('<a class="gloss" href="/glossary#term-tpm"'));
});

test("longer alias wins over the shorter term inside it", () => {
  const html = "<html><body><p>脆弱なコードパスを塞ぐ。</p></body></html>";
  const out = linkifyHtml(html, terms);
  assert.ok(out.includes('href="/glossary#term-codepath"'));
  assert.ok(out.includes(">脆弱なコードパス</a>"));
});

test("headings, links, code, captions and definition lists are skipped", () => {
  const html = `<html><body>
<h2>eBPFの見出し</h2>
<p><a href="https://example.com">eBPFリンク</a></p>
<pre>eBPFコード</pre>
<p><code>eBPF</code></p>
<figure><figcaption>eBPFの図</figcaption></figure>
<dl><dt>eBPF</dt><dd>eBPFの説明</dd></dl>
<p>本文のeBPFだけ付く。</p>
</body></html>`;
  const out = linkifyHtml(html, terms);
  assert.equal((out.match(/class="gloss"/g) || []).length, 1);
  assert.ok(out.includes("本文の<a class=\"gloss\""));
});

test("an article's own glossary section is skipped", () => {
  const html = `<html><body>
<p>eBPFは本文で付く。</p>
<h2 id="glossary">用語補足</h2>
<p>eBPFの補足では付けない。</p>
<h2 id="sources">一次資料</h2>
<p>TPMはここでは付く。</p>
</body></html>`;
  const out = linkifyHtml(html, terms);
  assert.equal((out.match(/class="gloss"/g) || []).length, 2);
  assert.ok(out.includes("<p>eBPFの補足では付けない。</p>"));
  assert.ok(out.includes('<a class="gloss" href="/glossary#term-tpm"'));
});

test("terms already linked by hand are not linked again", () => {
  const html = `<html><body><p><a href="#term-ebpf">eBPF</a>は手作業リンク済み。素のeBPFにも付けない。</p></body></html>`;
  const out = linkifyHtml(html, terms);
  assert.equal((out.match(/class="gloss"/g) || []).length, 0);
});

test("opt-out comment disables linkification", () => {
  const html = "<html><body><!-- glossary: off --><p>eBPF</p></body></html>";
  assert.equal(linkifyHtml(html, terms), html);
});

test("linkification is idempotent and unwrap restores the source", () => {
  const html = "<html><body><p>eBPFとTPM。</p></body></html>";
  const once = linkifyHtml(html, terms);
  assert.equal(linkifyHtml(once, terms), once);
  assert.equal(unwrapGlossaryLinks(once), html);
});

test("auto-links do not change the RSS content fingerprint", () => {
  const html = "<html><head><title>t</title></head><body><p>eBPFとTPM。</p></body></html>";
  assert.equal(contentFingerprint(linkifyHtml(html, terms), "sample.html"), contentFingerprint(html, "sample.html"));
});

test("dictionary loads and the glossary region renders anchors", async () => {
  const loaded = await loadGlossaryTerms(new URL("..", import.meta.url).pathname);
  assert.ok(loaded.length >= 22);
  const page = "<!-- html-share: glossary terms -->\nold\n<!-- /html-share: glossary terms -->";
  const out = updateGlossaryPage(page, loaded);
  assert.ok(out.includes('<dt id="term-ebpf">eBPF</dt>'));
  assert.ok(out.includes('<dt id="term-abi">ABI</dt>'));
  assert.ok(!out.includes("old"));
  assert.ok(renderGlossaryTerms(loaded).includes('id="term-tpm"'));
});

test("dictionary file keeps unique ids and complete entries", async () => {
  const data = JSON.parse(await readFile(new URL("../glossary/terms.json", import.meta.url), "utf8"));
  const ids = data.terms.map((term) => term.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const term of data.terms) {
    assert.ok(term.term && term.category && term.description && Array.isArray(term.aliases));
  }
});
