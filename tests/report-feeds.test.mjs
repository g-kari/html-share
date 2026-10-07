import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addFeedDiscovery } from "../scripts/rss-feed.mjs";
import { REPORT_FEEDS, REPORT_STATE_FILE, readReportState, reportData, renderReportFeed, writeReportFeeds } from "../scripts/report-feeds.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const [vulnerability, incident] = REPORT_FEEDS;
const dates = ["2026-10-01T01:23:45Z", "2026-10-02T02:34:56Z", "2026-10-03T03:45:56Z", "2026-10-04T04:56:57Z"];
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" });
function commit(cwd, date) {
  git(cwd, "add", ".");
  execFileSync("git", ["-C", cwd, "commit", "-m", "Report update"], { stdio: "pipe", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
}
const change = (summary, date = "2026-10-01", ids = ["one"]) => ({ summary, date, incident_ids: ids });
const data = (feed, changes = [change('初版 & <script> "日本語"')]) => ({ changes, [feed.recordsKey]: [{ id: "one", summary: "Initial fact", sources: [{ url: "https://example.invalid/?a=1&b=2", checked_at: "2026-10-01" }] }] });
const document = (feed, value) => `<!doctype html><html lang="ja"><head><title>${feed.key}</title></head><body><p>PRIVATE_BODY_NEVER_IN_FEED</p><script type="application/json" id="${feed.scriptId}">${JSON.stringify(value).replace(/</g, "\\u003c")}</script></body></html>`;
async function save(cwd, feed, value) {
  const source = document(feed, value);
  await writeFile(path.join(cwd, "public", feed.relativePath), source);
  return { relativePath: feed.relativePath, source };
}
async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), "html-share-report-rss-"));
  await mkdir(path.join(cwd, "public"));
  git(cwd, "init", "-b", "main"); git(cwd, "config", "user.name", "RSS test"); git(cwd, "config", "user.email", "rss@example.invalid");
  return cwd;
}
const xml = (cwd, feed) => readFile(path.join(cwd, "public", feed.path.slice(1)), "utf8");
const count = (text) => (text.match(/<item>/g) || []).length;

test("real report JSON formats parse; discovery adds topic feeds without altering body or duplicating links", async () => {
  for (const feed of REPORT_FEEDS) {
    const source = await readFile(path.join(root, "public", feed.relativePath), "utf8");
    assert.ok(reportData(source, feed)[feed.recordsKey].length);
    const output = addFeedDiscovery(source, [feed]);
    assert.equal(addFeedDiscovery(output, [feed]), output);
    assert.equal(output.slice(output.indexOf("<body")), source.slice(source.indexOf("<body")));
    assert.ok(output.includes(`href="https://share.0g0.xyz${feed.path}"`));
  }
});

test("historical bootstrap uses real commit times; stable topic-specific GUIDs and XML-safe descriptions", async () => {
  const cwd = await fixture();
  try {
    const value = data(vulnerability);
    let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]);
    value[vulnerability.recordsKey][0].summary = "Corrected version boundary";
    value.changes.push(change("修正版の境界を訂正", "2026-10-02"));
    page = await save(cwd, vulnerability, value); commit(cwd, dates[1]);
    const other = await save(cwd, incident, data(incident)); commit(cwd, dates[2]);
    await writeReportFeeds(cwd, [page, other]);
    const feed = await xml(cwd, vulnerability);
    assert.equal(count(feed), 2); assert.equal(count(await xml(cwd, incident)), 1);
    assert.match(feed, /Thu, 01 Oct 2026 01:23:45 GMT/); assert.match(feed, /Fri, 02 Oct 2026 02:34:56 GMT/);
    assert.match(feed, /&amp;lt;script&amp;gt;/); assert.doesNotMatch(feed, /PRIVATE_BODY_NEVER_IN_FEED|<script>/);
    assert.match(feed, /guid isPermaLink="false"/); assert.doesNotMatch(feed, /security-incidents-feed.xml/);
    const state = await readReportState(cwd);
    await writeReportFeeds(cwd, [page, other]);
    assert.equal(await xml(cwd, vulnerability), feed); assert.deepEqual(await readReportState(cwd), state);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("prepend/append, identical summary different delta, delayed concurrent updates, and stable previous items", async () => {
  const cwd = await fixture();
  try {
    const value = data(vulnerability, [change("同じ概要")]);
    let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    const original = (await readReportState(cwd)).reports.vulnerabilities.items[0];
    value.records.push({ id: "two", summary: "Distinct new fact" }); value.changes.unshift(change("同じ概要", "2026-10-02"));
    page = await save(cwd, vulnerability, value); commit(cwd, dates[1]);
    value.records[0].summary = "Material correction"; value.changes.push(change("境界訂正", "2026-10-03"));
    page = await save(cwd, vulnerability, value); commit(cwd, dates[2]);
    const incidentPage = await save(cwd, incident, data(incident, [change("独立した事案追加")])); commit(cwd, dates[3]);
    await writeReportFeeds(cwd, [page, incidentPage]);
    const items = (await readReportState(cwd)).reports.vulnerabilities.items;
    assert.equal(items.length, 3); assert.equal(new Set(items.map((x) => x.fingerprint)).size, 3); assert.deepEqual(items[0], original);
    assert.deepEqual(items.map((x) => x.published), dates.slice(0, 3).map((d) => new Date(d).toISOString()));
    assert.equal(count(await xml(cwd, incident)), 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("timestamp-only checks, word-only history corrections, duplicate journal entries, source ordering and UI-only corrections do not announce", async () => {
  const cwd = await fixture();
  try {
    const value = data(incident, [change("初版")]);
    let page = await save(cwd, incident, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    const original = (await readReportState(cwd)).reports[incident.key].items[0];
    value.incidents[0].sources[0].checked_at = "2026-10-02"; value.incidents[0].updated = "2026-10-02";
    value.changes[0].date = "2026-10-02"; page = await save(cwd, incident, value); commit(cwd, dates[1]); await writeReportFeeds(cwd, [page]);
    assert.deepEqual((await readReportState(cwd)).reports[incident.key].items[0], original);
    value.changes[0].summary = "初版の表現を明確化"; page = await save(cwd, incident, value); commit(cwd, dates[2]); await writeReportFeeds(cwd, [page]);
    const corrected = (await readReportState(cwd)).reports[incident.key].items[0];
    assert.equal(corrected.summary, "初版の表現を明確化"); assert.equal(corrected.fingerprint, original.fingerprint); assert.equal(corrected.published, original.published);
    value.changes.push(change("確認時刻だけ更新", "2026-10-03"), change("表示件数の訂正", "2026-10-03", []), change("初版の表現を明確化", "2026-10-03"));
    page = await save(cwd, incident, value); commit(cwd, dates[3]); await writeReportFeeds(cwd, [page]);
    assert.equal(count(await xml(cwd, incident)), 1);
    await writeReportFeeds(cwd, []); assert.equal(count(await xml(cwd, incident)), 0);
    await writeReportFeeds(cwd, [page]); assert.equal(count(await xml(cwd, incident)), 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("material edits without a meaningful delta summary fail before either topic is written", async () => {
  const cwd = await fixture();
  try {
    const value = data(vulnerability); let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    const before = await xml(cwd, vulnerability); const state = await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8");
    value.records[0].summary = "Material edit with missing journal"; page = await save(cwd, vulnerability, value); commit(cwd, dates[1]);
    await assert.rejects(writeReportFeeds(cwd, [page]), /meaningful.*summary/);
    assert.equal(await xml(cwd, vulnerability), before); assert.equal(await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8"), state);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Git-free export backfill discloses day precision, does not date everything now, and retains saved GUIDs", async () => {
  const cwd = await fixture();
  try {
    await rm(path.join(cwd, ".git"), { recursive: true, force: true });
    const page = await save(cwd, vulnerability, data(vulnerability, [change("初版", "2026-10-01"), change("追記", "2026-10-02")]));
    await writeReportFeeds(cwd, [page]); const feed = await xml(cwd, vulnerability);
    assert.equal(count(feed), 2); assert.match(feed, /時刻は記録なし/); assert.match(feed, /Wed, 30 Sep 2026 15:00:00 GMT/); assert.match(feed, /Thu, 01 Oct 2026 15:00:00 GMT/);
    await writeReportFeeds(cwd, [page]); assert.equal(await xml(cwd, vulnerability), feed);
    const state = await readReportState(cwd); state.reports.vulnerabilities.items[0].published = "invalid"; await writeFile(path.join(cwd, REPORT_STATE_FILE), JSON.stringify(state));
    await assert.rejects(readReportState(cwd), /timestamp/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("generator emits visible subscriptions, topic discovery and headers while retaining index/OGP/general RSS", async () => {
  const cwd = await fixture();
  try {
    await cp(path.join(root, "public/assets"), path.join(cwd, "public/assets"), { recursive: true });
    await save(cwd, vulnerability, data(vulnerability)); await save(cwd, incident, data(incident)); commit(cwd, dates[0]);
    execFileSync(process.execPath, [path.join(root, "scripts/generate-index.mjs")], { cwd, stdio: "pipe" });
    const index = await readFile(path.join(cwd, "public/index.html"), "utf8");
    for (const feed of REPORT_FEEDS) {
      assert.ok(index.includes(`href="${feed.path}"`)); assert.ok(index.includes(`href="https://share.0g0.xyz${feed.path}"`));
      assert.ok((await readFile(path.join(cwd, "public", feed.relativePath), "utf8")).includes(`href="https://share.0g0.xyz${feed.path}"`));
      const headers = await readFile(path.join(root, "public/_headers"), "utf8");
      assert.ok(headers.includes(`${feed.path}\n  Content-Type: application/rss+xml; charset=utf-8\n  Cache-Control: public, max-age=300, must-revalidate\n  X-Content-Type-Options: nosniff`));
    }
    assert.match(index, /og:title/); assert.equal(count(await readFile(path.join(cwd, "public/feed.xml"), "utf8")), 2);
    assert.match(await readFile(path.join(cwd, "public/feed.xml"), "utf8"), /guid isPermaLink="true">https:\/\/share.0g0.xyz\/vulnerabilities/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("actual schema observation clocks and derived fingerprints remain non-material", async () => {
  const cwd = await fixture();
  try {
    for (const feed of REPORT_FEEDS) {
      const source = await readFile(path.join(root, "public", feed.relativePath), "utf8");
      const value = reportData(source, feed);
      let page = await save(cwd, feed, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
      const before = await xml(cwd, feed);
      for (const record of value[feed.recordsKey]) {
        record.last_content_change = "2030-01-01"; record.fingerprint = "f".repeat(64);
        for (const source of record.sources || []) { source.checked = "2030-01-01"; source.checked_at_utc = "2030-01-01T12:34:56Z"; }
      }
      page = await save(cwd, feed, value); commit(cwd, dates[1]); await writeReportFeeds(cwd, [page]);
      assert.equal(await xml(cwd, feed), before, feed.key);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("persisted Git cursor replays net-zero and repeated-state delayed history through the final commit", async () => {
  for (const facts of [["B", "A"], ["B", "C", "B"]]) {
    const cwd = await fixture();
    try {
      const value = data(vulnerability, [change("Initial A")]); value.records[0].summary = "A";
      let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
      const original = (await readReportState(cwd)).reports.vulnerabilities.items[0];
      for (const [index, fact] of facts.entries()) {
        value.records[0].summary = fact; value.changes.unshift(change(`Correction ${index + 1}: ${fact}`, `2026-10-0${index + 2}`));
        page = await save(cwd, vulnerability, value); commit(cwd, dates[index + 1]);
      }
      await writeReportFeeds(cwd, [page]);
      const after = (await readReportState(cwd)).reports.vulnerabilities;
      assert.equal(after.items.length, facts.length + 1); assert.deepEqual(after.items[0], original);
      assert.equal(after.cursor, git(cwd, "log", "-1", "--format=%H", "--", "public/vulnerabilities.html").trim());
      const before = await xml(cwd, vulnerability); await writeReportFeeds(cwd, [page]); assert.equal(await xml(cwd, vulnerability), before);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
});


test("repeated summaries on different dates keep independent wording corrections and GUIDs", async () => {
  const cwd = await fixture();
  try {
    const value = data(vulnerability, [change("Same wording", "2026-10-01")]);
    let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    value.records[0].summary = "New fact"; value.changes.unshift(change("Same wording", "2026-10-02"));
    page = await save(cwd, vulnerability, value); commit(cwd, dates[1]); await writeReportFeeds(cwd, [page]);
    const before = (await readReportState(cwd)).reports.vulnerabilities.items;
    value.changes[0].summary = "Second wording clarified";
    page = await save(cwd, vulnerability, value); commit(cwd, dates[2]); await writeReportFeeds(cwd, [page]);
    const after = (await readReportState(cwd)).reports.vulnerabilities.items;
    assert.deepEqual(after[0], before[0]); assert.equal(after[1].summary, "Second wording clarified");
    assert.equal(after[1].fingerprint, before[1].fingerprint); assert.equal(after[1].published, before[1].published);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test("missing summary recovers in a later explicit repair commit with the original data-publication date", async () => {
  const cwd = await fixture();
  try {
    const value = data(vulnerability); let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    const before = await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8");
    value.records[0].summary = "Corrected fact"; page = await save(cwd, vulnerability, value); commit(cwd, dates[1]);
    await assert.rejects(writeReportFeeds(cwd, [page]), /follow-up commit/);
    assert.equal(await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8"), before);
    value.changes.push(change("Explicit summary repairing the earlier fact correction", "2026-10-03"));
    page = await save(cwd, vulnerability, value); commit(cwd, dates[2]); await writeReportFeeds(cwd, [page]);
    const items = (await readReportState(cwd)).reports.vulnerabilities.items;
    assert.equal(items.length, 2); assert.equal(items[1].published, new Date(dates[1]).toISOString());
    assert.equal(items[1].summary, "Explicit summary repairing the earlier fact correction");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("uncommitted current material data cannot advance or corrupt the saved Git cursor/state", async () => {
  const cwd = await fixture();
  try {
    const value = data(vulnerability); let page = await save(cwd, vulnerability, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    const before = await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8"); const feedBefore = await xml(cwd, vulnerability);
    value.records[0].summary = "Uncommitted material fact"; value.changes.push(change("New material summary", "2026-10-02")); page = await save(cwd, vulnerability, value);
    await assert.rejects(writeReportFeeds(cwd, [page]), /differs from committed Git history/);
    assert.equal(await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8"), before); assert.equal(await xml(cwd, vulnerability), feedBefore);
    commit(cwd, dates[1]); await writeReportFeeds(cwd, [page]);
    const items = (await readReportState(cwd)).reports.vulnerabilities.items;
    assert.equal(items.length, 2); assert.equal(items[1].published, new Date(dates[1]).toISOString());
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test("an unrelated later update or summary-only commit cannot mislabel a pending incident delta", async () => {
  const cwd = await fixture();
  try {
    const value = data(incident, [change("Initial one and two", "2026-10-01", ["one", "two"])]);
    value.incidents.push({ id: "two", summary: "Initial second fact" });
    let page = await save(cwd, incident, value); commit(cwd, dates[0]); await writeReportFeeds(cwd, [page]);
    const before = await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8");
    value.incidents[0].summary = "One corrected without summary";
    page = await save(cwd, incident, value); commit(cwd, dates[1]);
    value.incidents[1].summary = "Two corrected"; value.changes.push(change("Two corrected", "2026-10-03", ["two"]));
    page = await save(cwd, incident, value); commit(cwd, dates[2]);
    await assert.rejects(writeReportFeeds(cwd, [page]), /summary-only follow-up commit/);
    assert.equal(await readFile(path.join(cwd, REPORT_STATE_FILE), "utf8"), before);
    value.changes.push(change("Still only describes two", "2026-10-04", ["two"]));
    page = await save(cwd, incident, value); commit(cwd, dates[3]);
    await assert.rejects(writeReportFeeds(cwd, [page]), /summary-only follow-up commit/);
    value.changes.push(change("Explicit pending one correction", "2026-10-04", ["one"]));
    page = await save(cwd, incident, value); commit(cwd, "2026-10-05T00:00:00Z");
    await writeReportFeeds(cwd, [page]);
    const items = (await readReportState(cwd)).reports[incident.key].items;
    assert.equal(items.length, 3);
    const one = items.find((item) => item.published === new Date(dates[1]).toISOString());
    assert.equal(one.summary, "Explicit pending one correction");
    assert.equal(items.find((item) => item.published === new Date(dates[2]).toISOString()).summary, "Two corrected");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test("historic IDless incident scope expansion is material while an IDless UI-only correction is not", async () => {
  const cwd = await fixture();
  try {
    const value = data(incident); let page = await save(cwd, incident, value); commit(cwd, dates[0]);
    value.incidents.push({ id: "two", summary: "New published incident" });
    value.changes.push(change("Scope expansion with legacy missing IDs", "2026-10-02", []));
    page = await save(cwd, incident, value); commit(cwd, dates[1]);
    value.changes.at(-1).incident_ids = ["two"]; page = await save(cwd, incident, value); commit(cwd, dates[2]);
    value.changes.push(change("Display count correction only", "2026-10-04", [])); page = await save(cwd, incident, value); commit(cwd, dates[3]);
    await writeReportFeeds(cwd, [page]); const items = (await readReportState(cwd)).reports[incident.key].items;
    assert.equal(items.length, 2); assert.equal(items[1].summary, "Scope expansion with legacy missing IDs");
    assert.equal(items[1].published, new Date(dates[1]).toISOString());
    assert.doesNotMatch(await xml(cwd, incident), /Display count correction/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test("actual Git-free incident snapshot backfill excludes IDless UI count corrections", async () => {
  const cwd = await fixture();
  try {
    await rm(path.join(cwd, ".git"), { recursive: true, force: true });
    const source = await readFile(path.join(root, "public", incident.relativePath), "utf8");
    const value = reportData(source, incident);
    const page = await save(cwd, incident, value); await writeReportFeeds(cwd, [page]);
    const items = (await readReportState(cwd)).reports[incident.key].items;
    assert.equal(items.length, value.changes.filter((change) => ["incident_ids", "added_ids", "updated_ids"].some((key) => change[key]?.length)).length);
    assert.doesNotMatch(await xml(cwd, incident), /複合要因フィルターの選択肢|表示件数の訂正/);
    assert.ok(items.every((item) => item.journal.every((change) => change.ids.length)));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test("shallow production checkouts fail without state or with material changes, but safely reuse unchanged state", async () => {
  const full = await fixture();
  const parent = await mkdtemp(path.join(tmpdir(), "html-share-shallow-rss-"));
  const shallow = path.join(parent, "shallow");
  try {
    const value = data(vulnerability); let page = await save(full, vulnerability, value); commit(full, dates[0]);
    value.records[0].summary = "Historical correction"; value.changes.push(change("Historical correction summary", "2026-10-02"));
    page = await save(full, vulnerability, value); commit(full, dates[1]);
    execFileSync("git", ["clone", "--depth=1", `file://${full}`, shallow], { stdio: "pipe" });
    git(shallow, "config", "user.name", "Shallow RSS test"); git(shallow, "config", "user.email", "shallow@example.invalid");
    assert.equal(git(shallow, "rev-parse", "--is-shallow-repository").trim(), "true");
    await assert.rejects(writeReportFeeds(shallow, [page]), /shallow Git checkout cannot recover/);
    await assert.rejects(readFile(path.join(shallow, REPORT_STATE_FILE)), /ENOENT/);
    await assert.rejects(xml(shallow, vulnerability), /ENOENT/);
    await writeReportFeeds(full, [page]);
    await cp(path.join(full, REPORT_STATE_FILE), path.join(shallow, REPORT_STATE_FILE));
    await writeReportFeeds(shallow, [page]);
    const before = await readFile(path.join(shallow, REPORT_STATE_FILE), "utf8"); const feedBefore = await xml(shallow, vulnerability);
    assert.equal(feedBefore, await xml(full, vulnerability));
    value.records.push({ id: "two", summary: "New material data" }); value.changes.push(change("New material addition", "2026-10-03"));
    page = await save(shallow, vulnerability, value); commit(shallow, dates[2]);
    await assert.rejects(writeReportFeeds(shallow, [page]), /full-history generation workflow/);
    assert.equal(await readFile(path.join(shallow, REPORT_STATE_FILE), "utf8"), before); assert.equal(await xml(shallow, vulnerability), feedBefore);
  } finally { await rm(full, { recursive: true, force: true }); await rm(parent, { recursive: true, force: true }); }
});
