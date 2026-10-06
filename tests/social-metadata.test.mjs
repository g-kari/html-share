import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addSocialMetadata, pageDetails, routeFor, scanTags, DEFAULT_IMAGE } from "../scripts/social-metadata.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const document = (head = "", body = "<p>日本語の本文を保つ</p>") => `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">${head}\n</head><body>${body}</body></html>\n`;
function values(html, key) {
  return scanTags(html).filter((tag) => tag.name === "meta" &&
    (tag.attrs.get("property")?.value === key || tag.attrs.get("name")?.value === key))
    .map((tag) => tag.attrs.get("content")?.value);
}
function canonical(html) {
  return scanTags(html).find((tag) => tag.name === "link" && tag.attrs.get("rel")?.value === "canonical")?.attrs.get("href")?.value;
}

test("default OGP/Twitter card contains absolute clean URL and correct PNG metadata", () => {
  const output = addSocialMetadata(document('<title>日本語のページ</title><meta name="description" content="共有する説明">'), "memo/mysql.html");
  assert.equal(canonical(output), "https://share.0g0.xyz/memo/mysql");
  for (const [key, value] of Object.entries({
    "og:type": "article", "og:site_name": "HTML Share", "og:title": "日本語のページ",
    "og:description": "共有する説明", "og:url": "https://share.0g0.xyz/memo/mysql",
    "og:image": DEFAULT_IMAGE, "og:image:type": "image/png", "og:image:width": "1200", "og:image:height": "630",
    "twitter:card": "summary_large_image", "twitter:title": "日本語のページ", "twitter:description": "共有する説明", "twitter:image": DEFAULT_IMAGE,
  })) assert.deepEqual(values(output, key), [value], key);
  assert.ok(values(output, "og:image:alt")[0]);
  assert.deepEqual(values(output, "twitter:image:alt"), values(output, "og:image:alt"));
});

test("quotes, ampersands, angle brackets, numeric entities and UTF-8 are escaped once", () => {
  const source = document('<title>A &amp; B &lt;C&gt; &quot;D&quot; &#x1f680; &#39;E&#39; &amp;lt;</title><meta CONTENT=\'a &gt; b &amp; &quot;c&quot;\' NAME=description>');
  const output = addSocialMetadata(source, "escape.html");
  assert.deepEqual(values(output, "og:title"), ['A & B <C> "D" 🚀 \'E\' &lt;']);
  assert.deepEqual(values(output, "og:description"), ['a > b & "c"']);
  assert.match(output, /content="A &amp; B &lt;C&gt; &quot;D&quot;/);
  assert.equal(output.slice(output.indexOf("<body>")), source.slice(source.indexOf("<body>")));
});

test("root, nested index and escaped path routing", () => {
  assert.equal(routeFor("index.html"), "/");
  assert.equal(routeFor("memo/index.html"), "/memo/");
  assert.equal(routeFor("memo/日本語 #?.html"), "/memo/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%23%3F");
  const output = addSocialMetadata(document("<title>HTML Share</title>"), "index.html");
  assert.equal(canonical(output), "https://share.0g0.xyz/");
  assert.deepEqual(values(output, "og:type"), ["website"]);
});

test("explicit page overrides survive and relative URL/image attributes become absolute", () => {
  const output = addSocialMetadata(document(`<title>Page title</title>
    <link href='/memo/custom' rel='canonical'>
    <meta content='Custom &amp; title' property='og:title'>
    <meta property=og:description content='Custom description > details'>
    <meta property='og:image' content='images/card.png?x=1&amp;y=2'>
    <meta property='og:image:width' content='800'>
    <meta property='og:image:height' content='400'>
    <meta property='og:image:alt' content='An authored image'>
    <meta name='twitter:title' content='X title'>`), "memo/mysql.html");
  assert.equal(canonical(output), "https://share.0g0.xyz/memo/custom");
  assert.deepEqual(values(output, "og:url"), ["https://share.0g0.xyz/memo/custom"]);
  assert.deepEqual(values(output, "og:title"), ["Custom & title"]);
  assert.deepEqual(values(output, "og:description"), ["Custom description > details"]);
  assert.deepEqual(values(output, "og:image"), ["https://share.0g0.xyz/memo/images/card.png?x=1&y=2"]);
  assert.deepEqual(values(output, "twitter:image"), values(output, "og:image"));
  assert.deepEqual(values(output, "og:image:width"), ["800"]);
  assert.deepEqual(values(output, "og:image:height"), ["400"]);
  assert.deepEqual(values(output, "twitter:title"), ["X title"]);
  assert.deepEqual(values(output, "og:image:type"), []);
});

test("protocol-relative custom image, og:url override and independent Twitter image", () => {
  const output = addSocialMetadata(document('<title>Page</title><meta property="og:url" content="/other"><meta property="og:image" content="//cdn.example.com/card.jpg"><meta name="twitter:image" content="/different.png">'), "memo/page.html");
  assert.equal(canonical(output), "https://share.0g0.xyz/other");
  assert.deepEqual(values(output, "og:image"), ["https://cdn.example.com/card.jpg"]);
  assert.deepEqual(values(output, "twitter:image"), ["https://share.0g0.xyz/different.png"]);
  assert.deepEqual(values(output, "og:image:width"), []);
});

test("idempotence and generated defaults refresh when source title or description changes", () => {
  const first = addSocialMetadata(document('<title>Before</title><meta name="description" content="First">'), "page.html");
  assert.equal(addSocialMetadata(first, "page.html"), first);
  const second = addSocialMetadata(first.replace("<title>Before</title>", "<title>After</title>").replace('name="description" content="First"', 'name="description" content="Second"'), "page.html");
  assert.deepEqual(values(second, "og:title"), ["After"]);
  assert.deepEqual(values(second, "og:description"), ["Second"]);
  assert.equal(addSocialMetadata(second, "page.html"), second);
});

test("commented and raw-text fake tags never become metadata or head boundaries", () => {
  const head = `<title>Real</title><!-- <meta name="description" content="Fake"> -->
    <script>const a = '<meta name="description" content="Fake">'; const b = '</head>';
    const c = '<!-- html-share: social metadata -->do not remove<!-- /html-share: social metadata -->';</script>
    <meta name="description" content="Real > value">`;
  const source = document(head, "<!-- html-share: social metadata -->keep body<!-- /html-share: social metadata -->");
  assert.deepEqual(pageDetails(source, "fallback"), { title: "Real", description: "Real > value" });
  const output = addSocialMetadata(source, "page.html");
  assert.ok(output.includes("do not remove"));
  assert.ok(output.includes("keep body"));
  assert.equal(addSocialMetadata(output, "page.html"), output);
});

test("missing description gets a useful fallback; malformed head and unsafe URLs fail", () => {
  const output = addSocialMetadata(document(""), "note.html");
  assert.deepEqual(values(output, "og:title"), ["note"]);
  assert.ok(values(output, "og:description")[0].includes("note"));
  assert.throws(() => addSocialMetadata("<html><body>Bad</body></html>", "bad.html"), /head/);
  assert.throws(() => addSocialMetadata(document('<meta property="og:image" content="javascript:alert(1)">'), "bad.html"), /HTTP/);
});

test("real repository pages preserve their bodies and all receive metadata", async () => {
  for (const file of await readdir(path.join(root, "public"))) {
    if (!file.endsWith(".html")) continue;
    const source = await readFile(path.join(root, "public", file), "utf8");
    const output = addSocialMetadata(source, file);
    assert.equal(output.slice(output.indexOf("<body")), source.slice(source.indexOf("<body")), file);
    assert.equal(values(output, "og:title").length, 1, file);
    assert.equal(addSocialMetadata(output, file), output, file);
  }
});

test("generator adds future/nested pages, index metadata, stays stable and validates image", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "html-share-test-"));
  try {
    await mkdir(path.join(temp, "public/memo"), { recursive: true });
    await cp(path.join(root, "public/assets"), path.join(temp, "public/assets"), { recursive: true });
    const source = document('<title>Future &amp; page</title><meta name="description" content="Future description">');
    await writeFile(path.join(temp, "public/memo/future.html"), source);
    const generate = () => execFileSync(process.execPath, [path.join(root, "scripts/generate-index.mjs")], { cwd: temp, stdio: "pipe", env: { ...process.env, SOURCE_DATE_EPOCH: "1791244800" } });
    generate();
    const first = await readFile(path.join(temp, "public/memo/future.html"), "utf8");
    const index = await readFile(path.join(temp, "public/index.html"), "utf8");
    assert.equal(canonical(first), "https://share.0g0.xyz/memo/future");
    assert.equal(first.slice(first.indexOf("<body")), source.slice(source.indexOf("<body")));
    assert.match(index, /href="\/memo\/future"/);
    assert.equal(canonical(index), "https://share.0g0.xyz/");
    generate();
    assert.equal(await readFile(path.join(temp, "public/memo/future.html"), "utf8"), first);
    assert.equal(await readFile(path.join(temp, "public/index.html"), "utf8"), index);
    await rm(path.join(temp, "public/assets/html-share-card-v1.png"));
    assert.throws(generate);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("versioned common PNG has correct dimensions, cache policy and deploy build hook", async () => {
  const image = await readFile(path.join(root, "public/assets/html-share-card-v1.png"));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(image.length < 500_000);
  assert.match(await readFile(path.join(root, "public/_headers"), "utf8"), /html-share-card-v1\.png\n  Cache-Control: public, max-age=31536000, immutable/);
  const config = JSON.parse(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
  assert.equal(config.build.command, "node scripts/generate-index.mjs");
  assert.deepEqual(config.previews, {});
});

test("complete HTML entities and attribute-specific legacy decoding", () => {
  const output = addSocialMetadata(document('<title>Caf&eacute; &mdash; &copy; 2026 &NotEqualTilde; &copy</title><meta name="description" content="Caf&eacute; &mdash; &copy; &notit; &copy=x">'), "entities.html");
  assert.deepEqual(values(output, "og:title"), ["Café — © 2026 ≂̸ ©"]);
  assert.deepEqual(values(output, "og:description"), ["Café — © &notit; &copy=x"]);
  assert.equal(addSocialMetadata(output, "entities.html"), output);
});

test("inert nested template metadata and generated markers are preserved and ignored", () => {
  const template = '<template><title>Wrong</title><meta name="description" content="Wrong"><meta property="og:title" content="Wrong"><template><meta property="og:image" content="/wrong.png"></template><!-- html-share: social metadata -->inert<!-- /html-share: social metadata --></template>';
  const source = document(template + '<title>Real</title><meta name="description" content="Real description">');
  assert.deepEqual(pageDetails(source, "fallback"), { title: "Real", description: "Real description" });
  const output = addSocialMetadata(source, "template.html");
  assert.ok(output.includes(template));
  const active = output.replace(template, "");
  assert.deepEqual(values(active, "og:title"), ["Real"]);
  assert.deepEqual(values(active, "og:description"), ["Real description"]);
  assert.deepEqual(values(active, "og:image"), [DEFAULT_IMAGE]);
  assert.equal(addSocialMetadata(output, "template.html"), output);
});

test("empty authored tags do not win over defaults, and generated values can refresh", () => {
  const source = document('<title>Before</title><link rel="canonical" href=""><meta property="og:title" content=" "><meta property="og:image"><meta property="og:description" content=""><meta name="twitter:image" content="">');
  const output = addSocialMetadata(source, "empty.html");
  assert.equal(canonical(output), "https://share.0g0.xyz/empty");
  assert.deepEqual(values(output, "og:title"), ["Before"]);
  assert.deepEqual(values(output, "og:image"), [DEFAULT_IMAGE]);
  assert.deepEqual(values(output, "twitter:image"), [DEFAULT_IMAGE]);
  assert.equal(addSocialMetadata(output, "empty.html"), output);
  const updated = addSocialMetadata(output.replace('<title>Before</title>', '<title>After</title>'), "empty.html");
  assert.deepEqual(values(updated, "og:title"), ["After"]);
});

test("multiple image groups and independent Twitter image keep correct alt text", () => {
  const output = addSocialMetadata(document('<title>Page</title><meta property="og:image" content="/first.png"><meta property="og:image:alt" content="First cover"><meta property="og:image" content="/second.png"><meta property="og:image:alt" content="Second cover">'), "images.html");
  assert.deepEqual(values(output, "og:image:alt"), ["First cover", "Second cover"]);
  assert.deepEqual(values(output, "twitter:image"), ["https://share.0g0.xyz/first.png"]);
  assert.deepEqual(values(output, "twitter:image:alt"), ["First cover"]);
  const noAlt = addSocialMetadata(document('<title>Page</title><meta property="og:image" content="/first.png"><meta property="og:image" content="/second.png">'), "images.html");
  assert.deepEqual(values(noAlt, "og:image:alt"), []);
  const separate = addSocialMetadata(document('<title>Page</title><meta name="twitter:image" content="/custom.png">'), "images.html");
  assert.deepEqual(values(separate, "og:image:alt"), ["HTML Shareのロゴと共有ページを表すカード"]);
  assert.deepEqual(values(separate, "twitter:image:alt"), ["Page"]);
  const authored = addSocialMetadata(document('<title>Page</title><meta name="twitter:image" content="/custom.png"><meta name="twitter:image:alt" content="Authored X cover">'), "images.html");
  assert.deepEqual(values(authored, "twitter:image:alt"), ["Authored X cover"]);
});
