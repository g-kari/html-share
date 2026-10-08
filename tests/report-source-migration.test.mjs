import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authoredReportSource, committedReportSource, reportSourcePaths } from "../scripts/report-source.mjs";
import { contentFingerprint, readFeedState, STATE_FILE } from "../scripts/rss-feed.mjs";
import { CORRECTION_FILE, REPORT_FEEDS, REPORT_STATE_FILE, readReportState, reportData } from "../scripts/report-feeds.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const [vulnerability, incident] = REPORT_FEEDS;
const sourcePath = "reports/vulnerabilities.source.html";
const legacyPath = "public/vulnerabilities.html";
const dates = ["2026-10-01T01:23:45Z", "2026-10-02T02:34:56Z", "2026-10-03T03:45:56Z", "2026-10-04T04:56:57Z", "2026-10-05T05:06:07Z"];
const generatedFiles = ["public/feed.xml", ...REPORT_FEEDS.map((feed) => `public${feed.path}`), STATE_FILE, REPORT_STATE_FILE];
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" });
const count = (xml) => (xml.match(/<item>/g) || []).length;
const iso = (date) => new Date(date).toISOString();
const change = (summary, date = "2026-10-01", ids = ["one"]) => ({ summary, date, incident_ids: ids });
const data = (feed) => ({ changes: [change(`Initial ${feed.key}`)], [feed.recordsKey]: [{ id: "one", summary: "A", sources: [{ url: "https://example.invalid/primary", checked_at: "2026-10-01" }] }] });

function document(feed, value) {
  const cards = feed === vulnerability ? value.records.map((record) => `<article class="advisory" id="${record.id}" data-category="network" data-severity="high" data-exploitation="confirmed" data-priority="p1" data-date="2026-10-01" data-cvss="8.7"><h3>${record.id}</h3><p>${record.summary}</p></article>`).join("\n") : "<p>Incident public facts</p>";
  return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><title>Authored ${feed.key}</title><meta name="description" content="Authored public summary"><style>body{color:#123}</style></head><body><main><div id="advisories">${cards}</div><p id="empty" hidden>No results</p></main><script type="application/json" id="${feed.scriptId}">${JSON.stringify(value).replace(/</g, "\\u003c")}</script></body></html>\n`;
}

function commit(cwd, date, message = "Report update") {
  git(cwd, "add", ".");
  execFileSync("git", ["-C", cwd, "commit", "-m", message], { stdio: "pipe", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  return git(cwd, "rev-parse", "HEAD").trim();
}

function generate(cwd) {
  const env = { ...process.env };
  delete env.SOURCE_DATE_EPOCH;
  return execFileSync(process.execPath, [path.join(root, "scripts/generate-index.mjs")], { cwd, stdio: "pipe", env });
}

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), "html-share-source-migration-"));
  await mkdir(path.join(cwd, "public"));
  await cp(path.join(root, "public/assets"), path.join(cwd, "public/assets"), { recursive: true });
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.name", "Report migration test");
  git(cwd, "config", "user.email", "migration@example.invalid");
  return cwd;
}

async function save(cwd, feed, value, migrated = false) {
  const source = document(feed, value);
  const destination = migrated && feed === vulnerability ? sourcePath : `public/${feed.relativePath}`;
  await mkdir(path.dirname(path.join(cwd, destination)), { recursive: true });
  await writeFile(path.join(cwd, destination), source);
  return source;
}

async function initialize(cwd) {
  const value = data(vulnerability);
  await save(cwd, vulnerability, value);
  await save(cwd, incident, data(incident));
  commit(cwd, dates[0], "Publish legacy reports");
  generate(cwd);
  return value;
}

async function migrate(cwd, date = dates[2]) {
  const source = await readFile(path.join(cwd, legacyPath), "utf8");
  await mkdir(path.join(cwd, "reports"), { recursive: true });
  await writeFile(path.join(cwd, sourcePath), source);
  await writeFile(path.join(cwd, legacyPath), '<!doctype html><html><head><title>SHELL_MUST_NOT_DATE_RSS</title><meta name="description" content="Generated representation"></head><body><p>Generated public shell, not the authored register</p></body></html>\n');
  const sha = commit(cwd, date, "Move exact authored source and replace public shell");
  return { source, sha };
}

async function snapshot(cwd) {
  return Object.fromEntries(await Promise.all(generatedFiles.map(async (file) => [file, await readFile(path.join(cwd, file), "utf8")])));
}

function assertDatedReportState(actualText, expectedText) {
  const actual = JSON.parse(actualText);
  const expected = JSON.parse(expectedText);
  for (const report of Object.values(actual.reports)) delete report.cursor;
  for (const report of Object.values(expected.reports)) delete report.cursor;
  assert.deepEqual(actual, expected, "Material records, journal, GUID fingerprints and publication dates must survive migration");
}

function assertUnchangedFeeds(actual, expected, { cursorMayAdvance = true } = {}) {
  for (const file of generatedFiles.filter((file) => file !== REPORT_STATE_FILE)) assert.equal(actual[file], expected[file], file);
  if (cursorMayAdvance) assertDatedReportState(actual[REPORT_STATE_FILE], expected[REPORT_STATE_FILE]);
  else assert.equal(actual[REPORT_STATE_FILE], expected[REPORT_STATE_FILE], REPORT_STATE_FILE);
}

function assertBuildRejected(cwd, pattern) {
  assert.throws(() => generate(cwd), (error) => {
    assert.match(error.stderr?.toString() || error.message, pattern);
    return true;
  });
}

test("authored source preference and historical fallback keep the original public lineage", async () => {
  const cwd = await fixture();
  try {
    assert.deepEqual(reportSourcePaths("vulnerabilities.html"), [sourcePath, legacyPath]);
    assert.deepEqual(reportSourcePaths("security-incidents.html"), ["public/security-incidents.html"]);
    const legacy = await save(cwd, vulnerability, data(vulnerability));
    const first = commit(cwd, dates[0]);
    assert.equal(await authoredReportSource(cwd, vulnerability.relativePath, legacy), legacy);
    assert.equal(committedReportSource((args) => git(cwd, ...args), vulnerability.relativePath, first), legacy);
    const moved = await migrate(cwd);
    const shell = await readFile(path.join(cwd, legacyPath), "utf8");
    assert.notEqual(shell, legacy);
    assert.equal(await authoredReportSource(cwd, vulnerability.relativePath, shell), legacy);
    assert.equal(committedReportSource((args) => git(cwd, ...args), vulnerability.relativePath, moved.sha), legacy);
    assert.equal(committedReportSource((args) => git(cwd, ...args), vulnerability.relativePath, first), legacy);
    assert.equal(contentFingerprint(moved.source, vulnerability.relativePath), contentFingerprint(legacy, vulnerability.relativePath));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("legacy saved states survive an exact source move and public-shell replacement byte-for-byte", async () => {
  const cwd = await fixture();
  try {
    await initialize(cwd);
    commit(cwd, dates[1], "Save generated feeds, state and metadata");
    generate(cwd);
    const before = await snapshot(cwd);
    const moved = await migrate(cwd);
    generate(cwd);
    const after = await snapshot(cwd);
    assertUnchangedFeeds(after, before);
    assert.equal((await readReportState(cwd)).reports.vulnerabilities.cursor, moved.sha);
    assert.equal(await readFile(path.join(cwd, sourcePath), "utf8"), moved.source, "The authored source itself must remain byte-exact");
    assert.equal(count(after["public/feed.xml"]), 2, "Generated archive pages must not become general RSS items");
    assert.doesNotMatch(after["public/feed.xml"], /SHELL_MUST_NOT_DATE_RSS|vulnerabilities\/archive/);
    assert.match(after["public/feed.xml"], /guid isPermaLink="true">https:\/\/share\.0g0\.xyz\/vulnerabilities<\/guid>/);
    const publicView = await readFile(path.join(cwd, legacyPath), "utf8");
    assert.match(publicView, /vulnerability-view-data/);
    assert.doesNotMatch(publicView, /id="vulnerability-report-data"/);
    generate(cwd);
    assertUnchangedFeeds(await snapshot(cwd), after, { cursorMayAdvance: false });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a source-only material update emits one dedicated item and dates general RSS from the source commit", async () => {
  const cwd = await fixture();
  try {
    const value = await initialize(cwd);
    await migrate(cwd); generate(cwd);
    const before = await snapshot(cwd);
    const original = (await readReportState(cwd)).reports.vulnerabilities.items[0];
    value.records.push({ id: "two", summary: "New source-only public fact" });
    value.changes.push(change("Add the second public fact", "2026-10-04", ["two"]));
    const source = await save(cwd, vulnerability, value, true);
    const update = commit(cwd, dates[3], "Publish material update only in the authored source");
    generate(cwd);
    const state = await readReportState(cwd);
    assert.equal(state.reports.vulnerabilities.items.length, 2);
    assert.deepEqual(state.reports.vulnerabilities.items[0], original);
    assert.equal(state.reports.vulnerabilities.items[1].published, iso(dates[3]));
    assert.equal(state.reports.vulnerabilities.cursor, update);
    const general = (await readFeedState(cwd)).pages[vulnerability.relativePath];
    assert.equal(general.published, iso(dates[0]));
    assert.equal(general.updated, iso(dates[3]));
    assert.equal(general.fingerprint, contentFingerprint(source, vulnerability.relativePath));
    const after = await snapshot(cwd);
    assert.equal(count(after["public/vulnerabilities-feed.xml"]), count(before["public/vulnerabilities-feed.xml"]) + 1);
    assert.equal(after["public/security-incidents-feed.xml"], before["public/security-incidents-feed.xml"]);
    assert.match(after["public/feed.xml"], /<pubDate>Sun, 04 Oct 2026 04:56:57 GMT<\/pubDate>/);
    await writeFile(path.join(cwd, legacyPath), '<!doctype html><html><head><title>Later generated shell</title></head><body>Unrelated shell representation</body></html>');
    commit(cwd, dates[4], "Later public-shell-only change");
    generate(cwd);
    assertUnchangedFeeds(await snapshot(cwd), after);
    assert.equal((await readFeedState(cwd)).pages[vulnerability.relativePath].updated, iso(dates[3]));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("delayed A to B to A material replay crossing the source move keeps both updates and the original", async () => {
  const cwd = await fixture();
  try {
    const value = await initialize(cwd);
    const original = (await readReportState(cwd)).reports.vulnerabilities.items[0];
    value.records[0].summary = "B";
    value.changes.push(change("Correct A to B", "2026-10-02"));
    await save(cwd, vulnerability, value); commit(cwd, dates[1]);
    await migrate(cwd);
    value.records[0].summary = "A";
    value.changes.push(change("Correct B back to A", "2026-10-04"));
    await save(cwd, vulnerability, value, true);
    const final = commit(cwd, dates[3]);
    generate(cwd);
    const report = (await readReportState(cwd)).reports.vulnerabilities;
    assert.equal(report.items.length, 3);
    assert.equal(new Set(report.items.map((item) => item.fingerprint)).size, 3);
    assert.deepEqual(report.items[0], original);
    assert.deepEqual(report.items.map((item) => item.published), [dates[0], dates[1], dates[3]].map(iso));
    assert.deepEqual(report.items.map((item) => item.summary), [`Initial ${vulnerability.key}`, "Correct A to B", "Correct B back to A"]);
    assert.equal(report.cursor, final);
    const before = await snapshot(cwd); generate(cwd);
    assertUnchangedFeeds(await snapshot(cwd), before, { cursorMayAdvance: false });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("state-free full-history bootstrap reconstructs GUIDs and publication dates across both source paths", async () => {
  const cwd = await fixture();
  try {
    const value = await initialize(cwd);
    value.records[0].summary = "Legacy material correction";
    value.changes.push(change("Legacy correction summary", "2026-10-02"));
    await save(cwd, vulnerability, value); commit(cwd, dates[1]); generate(cwd);
    await migrate(cwd); generate(cwd);
    value.records.push({ id: "two", summary: "Authored-source addition" });
    value.changes.push(change("Source addition summary", "2026-10-04", ["two"]));
    await save(cwd, vulnerability, value, true); commit(cwd, dates[3]); generate(cwd);
    const before = await snapshot(cwd);
    assert.equal((await readReportState(cwd)).reports.vulnerabilities.items.length, 3);
    for (const file of generatedFiles) await rm(path.join(cwd, file));
    generate(cwd);
    assertUnchangedFeeds(await snapshot(cwd), before, { cursorMayAdvance: false });
    const report = (await readReportState(cwd)).reports.vulnerabilities;
    assert.deepEqual(report.items.map((item) => item.published), [dates[0], dates[1], dates[3]].map(iso));
    assert.equal((await readFeedState(cwd)).pages[vulnerability.relativePath].published, iso(dates[0]));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("postmove missing-summary and uncommitted material data reject before any feed or saved state is written", async () => {
  for (const invalid of ["missing-summary", "uncommitted"]) {
    const cwd = await fixture();
    try {
      const value = await initialize(cwd);
      await migrate(cwd); generate(cwd);
      const before = await snapshot(cwd);
      value.records[0].summary = `Unsafe ${invalid} material correction`;
      if (invalid === "uncommitted") value.changes.push(change("Uncommitted material correction summary", "2026-10-04"));
      await save(cwd, vulnerability, value, true);
      if (invalid === "missing-summary") commit(cwd, dates[3]);
      assertBuildRejected(cwd, invalid === "missing-summary" ? /meaningful.*summary|meaningful summary|summary-only follow-up commit/ : /differs from committed Git history/);
      assertUnchangedFeeds(await snapshot(cwd), before, { cursorMayAdvance: false });
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
});

test("postmove shallow builds reuse unchanged saved state but reject state-free or changed material history", async () => {
  const full = await fixture();
  const directory = await mkdtemp(path.join(tmpdir(), "html-share-source-shallow-"));
  const shallow = path.join(directory, "shallow");
  try {
    const value = await initialize(full);
    await migrate(full); generate(full);
    const expected = await snapshot(full);
    execFileSync("git", ["clone", "--depth=1", `file://${full}`, shallow], { stdio: "pipe" });
    git(shallow, "config", "user.name", "Shallow migration test");
    git(shallow, "config", "user.email", "shallow@example.invalid");
    assert.equal(git(shallow, "rev-parse", "--is-shallow-repository").trim(), "true");
    generate(shallow);
    assertUnchangedFeeds(await snapshot(shallow), expected);
    const unchanged = await snapshot(shallow);
    await rm(path.join(shallow, REPORT_STATE_FILE));
    assertBuildRejected(shallow, /shallow Git checkout cannot recover/);
    for (const file of generatedFiles.filter((file) => file !== REPORT_STATE_FILE)) assert.equal(await readFile(path.join(shallow, file), "utf8"), unchanged[file], file);
    await assert.rejects(readFile(path.join(shallow, REPORT_STATE_FILE)), /ENOENT/);
    await writeFile(path.join(shallow, REPORT_STATE_FILE), unchanged[REPORT_STATE_FILE]);
    value.records.push({ id: "two", summary: "New shallow source fact" });
    value.changes.push(change("Shallow material addition", "2026-10-04", ["two"]));
    await save(shallow, vulnerability, value, true); commit(shallow, dates[3]);
    assertBuildRejected(shallow, /full-history generation workflow/);
    assertUnchangedFeeds(await snapshot(shallow), unchanged, { cursorMayAdvance: false });
  } finally { await rm(full, { recursive: true, force: true }); await rm(directory, { recursive: true, force: true }); }
});

test("the current authored snapshot migration preserves all three RSS outputs and general state bytes", async () => {
  const cwd = await fixture();
  try {
    const source = await authoredReportSource(root, vulnerability.relativePath, await readFile(path.join(root, legacyPath), "utf8"));
    const value = reportData(source, vulnerability);
    const recordCount = value.records.length;
    assert.ok(recordCount > 0);
    const originalFeedState = await readFeedState(root);
    const legacyDate = originalFeedState.pages[vulnerability.relativePath].updated;
    await cp(path.join(root, "public"), path.join(cwd, "public"), { recursive: true });
    for (const file of [STATE_FILE, REPORT_STATE_FILE, CORRECTION_FILE]) await cp(path.join(root, file), path.join(cwd, file));
    await writeFile(path.join(cwd, legacyPath), source);
    // A coherent pre-migration snapshot can also contain a pending CSS edit or
    // future authored facts. Initialize it at its saved publication date, rather
    // than backdating new source bytes before the already-preserved dates.
    commit(cwd, legacyDate, "Legacy real report snapshot with preserved publication state");
    generate(cwd);
    const shipped = await snapshot(cwd);
    const itemCount = (await readReportState(cwd)).reports.vulnerabilities.items.length;
    const moved = await migrate(cwd, new Date(Date.parse(legacyDate) + 1000).toISOString());
    generate(cwd);
    const after = await snapshot(cwd);
    assertUnchangedFeeds(after, shipped);
    assert.equal(await readFile(path.join(cwd, sourcePath), "utf8"), moved.source);
    assert.equal((await readReportState(cwd)).reports.vulnerabilities.items.length, itemCount);
    assert.equal(reportData(await readFile(path.join(cwd, sourcePath), "utf8"), vulnerability).records.length, recordCount);
    assert.doesNotMatch(after["public/feed.xml"], /vulnerabilities\/archive/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
