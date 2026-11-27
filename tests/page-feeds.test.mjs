import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PAGE_FEEDS, pageUpdateData, renderPageFeed, writePageFeeds } from "../scripts/page-feeds.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const feed = PAGE_FEEDS[0];
const count = (text) => (text.match(/<item>/g) || []).length;

const pageSource = (changes) => `<!doctype html><html><head><title>緊急メンテナンス続報まとめ</title><meta property="og:image" content="https://share.0g0.xyz/assets/emergency-maintenance-2026-11-ogp-v1.jpg"><meta property="og:image:type" content="image/jpeg"></head><body><h1>緊急メンテナンス続報まとめ</h1><script type="application/json" id="maintenance-update-data">${JSON.stringify({ changes })}</script></body></html>`;

test("page feed carries one page item whose description and image show the latest update", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "share-page-feed-"));
  try {
    await mkdir(path.join(cwd, "public"), { recursive: true });
    const page = { relativePath: feed.relativePath, title: "緊急メンテナンス続報まとめ", source: pageSource([
      { date: "2026-11-27T09:27:00+09:00", summary: "ENEOS公式アプリが再開した。" },
      { date: "2026-11-27T18:27:00+09:00", summary: "ミンカブへの不正アクセスを新規追加した。" },
    ]) };
    await writePageFeeds(cwd, [page]);
    const xml = await readFile(path.join(cwd, "public", feed.path.slice(1)), "utf8");
    assert.equal(count(xml), 1);
    assert.match(xml, /<guid isPermaLink="true">https:\/\/share\.0g0\.xyz\/emergency-maintenance-2026-11<\/guid>/);
    assert.match(xml, /<description>最新の更新（2026年11月27日 18:27）：ミンカブへの不正アクセスを新規追加した。 前回（2026年11月27日 09:27）：ENEOS公式アプリが再開した。<\/description>/);
    assert.match(xml, /<pubDate>Fri, 27 Nov 2026 09:27:00 GMT<\/pubDate>/);
    assert.match(xml, /<media:content url="https:\/\/share\.0g0\.xyz\/assets\/emergency-maintenance-2026-11-ogp-v1\.jpg" type="image\/jpeg"/);
    assert.match(xml, /<media:thumbnail url="https:\/\/share\.0g0\.xyz\/assets\/emergency-maintenance-2026-11-ogp-v1\.jpg"\/>/);
    // A missing page keeps an empty channel instead of stale promises.
    await writePageFeeds(cwd, []);
    assert.equal(count(await readFile(path.join(cwd, "public", feed.path.slice(1)), "utf8")), 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("the authored emergency page register parses and renders its newest recorded update", async () => {
  const source = await readFile(path.join(root, "public", feed.relativePath), "utf8");
  const data = pageUpdateData(source, feed);
  assert.ok(data.changes.some((change) => change.date === "2026-11-27T18:27:00+09:00"));
  const xml = renderPageFeed(feed, { title: "緊急メンテナンス続報まとめ", source });
  assert.equal(count(xml), 1);
  const newest = data.changes[data.changes.length - 1];
  assert.ok(xml.includes(newest.summary.replace(/&/g, "&amp;").replace(/</g, "&lt;")));
  assert.match(xml, /emergency-maintenance-2026-11-ogp-v1\.jpg/);
});

test("generator wires the emergency feed into discovery, the index and the general feed", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "share-page-feed-gen-"));
  try {
    await mkdir(path.join(cwd, "public"), { recursive: true });
    await cp(path.join(root, "public/assets"), path.join(cwd, "public/assets"), { recursive: true });
    const source = await readFile(path.join(root, "public", feed.relativePath), "utf8");
    await writeFile(path.join(cwd, "public", feed.relativePath), source);
    const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    git("add", ".");
    execFileSync("git", ["-C", cwd, "commit", "-qm", "fixture"], { env: { ...process.env, GIT_AUTHOR_DATE: "2026-11-27T18:27:00+09:00", GIT_COMMITTER_DATE: "2026-11-27T18:27:00+09:00" } });
    execFileSync(process.execPath, [path.join(root, "scripts/generate-index.mjs")], { cwd, stdio: "pipe" });
    const page = await readFile(path.join(cwd, "public", feed.relativePath), "utf8");
    assert.ok(page.includes(`href="https://share.0g0.xyz${feed.path}"`));
    assert.ok(page.includes(`href="${feed.path}"`), "page body links to its update feed");
    const index = await readFile(path.join(cwd, "public/index.html"), "utf8");
    assert.ok(index.includes(`href="${feed.path}"`), "index offers the emergency feed subscription");
    const dedicated = await readFile(path.join(cwd, "public", feed.path.slice(1)), "utf8");
    assert.equal(count(dedicated), 1);
    assert.match(dedicated, /最新の更新（2026年11月27日 18:27）/);
    const general = await readFile(path.join(cwd, "public/feed.xml"), "utf8");
    const item = general.slice(general.indexOf("emergency-maintenance-2026-11"));
    assert.match(general, /最新の更新（2026年11月27日 18:27）：/);
    assert.ok(item.includes("emergency-maintenance-2026-11-ogp-v1.jpg"), "general feed item carries the page image");
    const headers = await readFile(path.join(root, "public/_headers"), "utf8");
    assert.ok(headers.includes(`${feed.path}\n  Content-Type: application/rss+xml; charset=utf-8\n  Cache-Control: public, max-age=300, must-revalidate\n  X-Content-Type-Options: nosniff`));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
