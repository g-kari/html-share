import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addSocialMetadata, scanTags } from "../scripts/social-metadata.mjs";
import { addFeedDiscovery, contentFingerprint, escapeXml, pageDates, readFeedState, renderFeed } from "../scripts/rss-feed.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const document = (head = "", body = "<p>Public body</p>") => `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">${head}\n</head><body>${body}</body></html>\n`;
const firstDate = "2026-10-01T00:00:00.000Z";
const nextDate = "2026-10-02T00:00:00.000Z";
const laterDate = "2026-10-03T00:00:00.000Z";
const entry = (route, updated = firstDate) => ({ route, title: "日本語 & <title> 🚀", description: 'A & <img src=x onerror="evil()">', published: firstDate, updated });
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" });
function commit(cwd, message, date) {
  git(cwd, "add", ".");
  execFileSync("git", ["-C", cwd, "commit", "-m", message], { stdio: "pipe", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
}
async function fixture() {
  const temp = await mkdtemp(path.join(tmpdir(), "html-share-rss-"));
  await mkdir(path.join(temp, "public/memo"), { recursive: true });
  await cp(path.join(root, "public/assets"), path.join(temp, "public/assets"), { recursive: true });
  git(temp, "init", "-b", "main");
  git(temp, "config", "user.name", "RSS Test");
  git(temp, "config", "user.email", "rss-test@example.invalid");
  return temp;
}
function generate(cwd) {
  const env = { ...process.env };
  delete env.SOURCE_DATE_EPOCH;
  return execFileSync(process.execPath, [path.join(root, "scripts/generate-index.mjs")], { cwd, stdio: "pipe", env });
}

test("RSS XML escaping preserves UTF-8 and replaces invalid XML 1.0 characters", () => {
  assert.equal(escapeXml('A & < > " \' 日本語 🚀\0\u0001\ud800\ufffe'), 'A &amp; &lt; &gt; &quot; &apos; 日本語 🚀\ufffd\ufffd\ufffd\ufffd');
  assert.equal(escapeXml("\t\n\r"), "\t\n\r");
  const feed = renderFeed([entry("/memo/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%26")]);
  assert.match(feed, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(feed, /<rss version="2\.0"/);
  assert.match(feed, /<title>日本語 &amp; &lt;title&gt; 🚀<\/title>/);
  assert.match(feed, /&amp;lt;img src=x onerror=&amp;quot;evil\(\)&amp;quot;&amp;gt;/);
  assert.doesNotMatch(feed, /<img /);
  assert.match(feed, /<pubDate>Thu, 01 Oct 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(feed, /<dcterms:created>2026-10-01T00:00:00\.000Z/);
  assert.match(feed, /<atom:link href="https:\/\/share\.0g0\.xyz\/feed\.xml" rel="self" type="application\/rss\+xml"/);
});

test("updated pages sort first; ties are stable; GUID never changes with content/date", () => {
  const one = renderFeed([entry("/z"), entry("/a"), entry("/new", nextDate)]);
  const two = renderFeed([entry("/a"), entry("/new", nextDate), entry("/z")]);
  assert.equal(one, two);
  assert.ok(one.indexOf("https://share.0g0.xyz/new</link>") < one.indexOf("https://share.0g0.xyz/a</link>"));
  assert.ok(one.indexOf("https://share.0g0.xyz/a</link>") < one.indexOf("https://share.0g0.xyz/z</link>"));
  assert.match(one, /<lastBuildDate>Fri, 02 Oct 2026 00:00:00 GMT/);
  assert.match(renderFeed([{ ...entry("/a", nextDate), title: "Changed" }]), /<guid isPermaLink="true">https:\/\/share\.0g0\.xyz\/a<\/guid>/);
  const empty = renderFeed([]);
  assert.doesNotMatch(empty, /<item>|lastBuildDate/);
  assert.match(empty, /<channel>/);
});

test("discovery is idempotent and preserves authored links/body/raw text/templates", () => {
  const inert = '<template><link rel="alternate" type="application/rss+xml" href="/feed.xml"></template>';
  const body = '<p>Keep</p><!-- html-share: rss discovery -->body<!-- /html-share: rss discovery -->';
  const source = document('<title>Page</title>' + inert + '<script>const text="<!-- html-share: rss discovery -->raw<!-- /html-share: rss discovery -->";</script>', body);
  const output = addFeedDiscovery(source);
  assert.equal(addFeedDiscovery(output), output);
  assert.equal(output.slice(output.indexOf("<body")), source.slice(source.indexOf("<body")));
  assert.ok(output.includes(inert));
  assert.ok(output.includes('raw<!-- /html-share: rss discovery -->'));
  const authored = document('<title>Page</title><link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Authored">');
  assert.equal(addFeedDiscovery(authored), authored);
  const malformed = document('<title>Page</title><link rel="alternate" type="application/rss+xml" href="https://[invalid">');
  assert.ok(addFeedDiscovery(malformed).includes('href="https://[invalid"'));
  assert.ok(addFeedDiscovery(malformed).includes('href="https://share.0g0.xyz/feed.xml"'));
  assert.throws(() => addFeedDiscovery(document('<title>Page</title><!-- html-share: rss discovery -->')), /Unclosed/);
});

test("fingerprints exclude generated metadata but retain every authored page edit", () => {
  const original = document('<title>Title</title><meta property="og:image" content="/custom.png">');
  const hash = contentFingerprint(original, "memo/page.html");
  const generated = addFeedDiscovery(addSocialMetadata(original, "memo/page.html"));
  assert.equal(contentFingerprint(generated, "memo/page.html"), hash);
  assert.equal(contentFingerprint(generated.replace('title="HTML Share RSS"', 'title="Generated change"'), "memo/page.html"), hash);
  assert.notEqual(contentFingerprint(original.replace("Public body", "Edited body"), "memo/page.html"), hash);
  assert.notEqual(contentFingerprint(original.replace("/custom.png", "/other.png"), "memo/page.html"), hash);
  assert.notEqual(contentFingerprint(document('<title>Title</title><script>const x="<!-- html-share: rss discovery -->important<!-- /html-share: rss discovery -->";</script>'), "memo/page.html"), hash);
});

test("generator covers new/nested pages, meaningful updates, metadata-only builds, and removal", async () => {
  const temp = await fixture();
  try {
    const source = document('<title>First &amp; title</title><meta name="description" content="Public summary">', "<p>BODY_MUST_NOT_ENTER_FEED</p>");
    await writeFile(path.join(temp, "public/memo/日本語 &.html"), source);
    await writeFile(path.join(temp, "private.html"), document("<title>PRIVATE_MUST_NOT_ENTER_FEED</title>"));
    commit(temp, "Publish first page", firstDate);
    generate(temp);
    const firstFeed = await readFile(path.join(temp, "public/feed.xml"), "utf8");
    const firstState = await readFeedState(temp);
    const index = await readFile(path.join(temp, "public/index.html"), "utf8");
    assert.match(index, /href="\/feed.xml">RSS/);
    assert.ok(scanTags(index).some((tag) => tag.name === "link" && tag.attrs.get("type")?.value === "application/rss+xml"));
    assert.match(firstFeed, /https:\/\/share\.0g0\.xyz\/memo\/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%26/);
    assert.doesNotMatch(firstFeed, /BODY_MUST_NOT_ENTER_FEED|PRIVATE_MUST_NOT_ENTER_FEED|index.html|\.feed-state/);
    assert.equal((firstFeed.match(/<item>/g) || []).length, 1);
    commit(temp, "Generated metadata only", nextDate);
    generate(temp);
    assert.equal(await readFile(path.join(temp, "public/feed.xml"), "utf8"), firstFeed);
    assert.deepEqual(await readFeedState(temp), firstState);
    assert.equal(await readFile(path.join(temp, "public/index.html"), "utf8"), index);
    await writeFile(path.join(temp, "unrelated.txt"), "unrelated");
    commit(temp, "Unrelated change", nextDate);
    generate(temp);
    assert.equal(await readFile(path.join(temp, "public/feed.xml"), "utf8"), firstFeed);
    await writeFile(path.join(temp, "public/memo/日本語 &.html"), source.replace("First &amp; title", "Updated title"));
    await writeFile(path.join(temp, "public/memo/index.html"), document("<title>Nested index</title>"));
    commit(temp, "Update page and publish nested index", laterDate);
    generate(temp);
    const updatedFeed = await readFile(path.join(temp, "public/feed.xml"), "utf8");
    const updatedState = await readFeedState(temp);
    assert.equal((updatedFeed.match(/<item>/g) || []).length, 2);
    assert.match(updatedFeed, /<link>https:\/\/share\.0g0\.xyz\/memo\/<\/link>/);
    assert.match(updatedFeed, /<pubDate>Sat, 03 Oct 2026 00:00:00 GMT/);
    assert.equal(updatedState.pages["memo/日本語 &.html"].published, firstDate);
    assert.equal(updatedState.pages["memo/日本語 &.html"].updated, laterDate);
    assert.ok(updatedFeed.includes(firstFeed.match(/<guid[^>]*>.*?<\/guid>/)[0]));
    generate(temp);
    assert.equal(await readFile(path.join(temp, "public/feed.xml"), "utf8"), updatedFeed);
    await rm(path.join(temp, "public/memo/index.html"));
    commit(temp, "Remove nested page", laterDate);
    generate(temp);
    assert.equal((await readFile(path.join(temp, "public/feed.xml"), "utf8")).match(/<item>/g).length, 1);
    assert.ok(!(await readFeedState(temp)).pages["memo/index.html"]);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("git history bootstrap ignores metadata-only commits even without saved state", async () => {
  const temp = await fixture();
  try {
    const source = document("<title>First</title>");
    await writeFile(path.join(temp, "public/page.html"), source);
    commit(temp, "First page", firstDate);
    await writeFile(path.join(temp, "public/page.html"), addFeedDiscovery(addSocialMetadata(source, "page.html")));
    commit(temp, "Generated block", nextDate);
    assert.deepEqual(pageDates(temp, "page.html", contentFingerprint(source, "page.html")), {
      fingerprint: contentFingerprint(source, "page.html"), published: firstDate, updated: firstDate,
    });
    await writeFile(path.join(temp, "public/page.html"), source.replace("First", "Second"));
    assert.throws(() => pageDates(temp, "page.html", contentFingerprint(source.replace("First", "Second"), "page.html")), /Cannot date/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("saved state supports exported sources and rejects corruption and backwards dates", async () => {
  const temp = await fixture();
  try {
    const source = document("<title>First</title>");
    await writeFile(path.join(temp, "public/page.html"), source);
    commit(temp, "First", firstDate);
    generate(temp);
    const state = await readFeedState(temp);
    await rm(path.join(temp, ".git"), { recursive: true, force: true });
    generate(temp);
    assert.deepEqual(await readFeedState(temp), state);
    assert.throws(() => pageDates(temp, "page.html", "a".repeat(64)), /Cannot date/);
    await writeFile(path.join(temp, ".feed-state.json"), '{"version":1,"pages":{"bad":{"fingerprint":"bad","published":"bad","updated":"bad"}}}');
    await assert.rejects(readFeedState(temp), /fingerprint/);
    assert.throws(() => renderFeed([{ ...entry("/bad"), updated: "not a date" }]), /timestamp/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("feed headers and workflow retain static serving and atomically commit new generated assets", async () => {
  const headers = await readFile(path.join(root, "public/_headers"), "utf8");
  assert.match(headers, /\/feed\.xml\n  Content-Type: application\/rss\+xml; charset=utf-8\n  Cache-Control: public, max-age=300, must-revalidate\n  X-Content-Type-Options: nosniff/);
  const workflow = await readFile(path.join(root, ".github/workflows/generate-index.yml"), "utf8");
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /git add public \.feed-state\.json/);
  assert.match(workflow, /git ls-files --others --exclude-standard -- public \.feed-state\.json/);
  assert.match(workflow, /git reset --hard origin\/main/);
  const config = JSON.parse(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
  assert.equal(config.assets.directory, "./public");
});
