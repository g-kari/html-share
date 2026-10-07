import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { escapeHtml, scanTags, SITE_URL } from "./social-metadata.mjs";
import { escapeXml } from "./rss-feed.mjs";

export const REPORT_STATE_FILE = ".report-feed-state.json";
export const REPORT_FEEDS = [
  { key: "vulnerabilities", relativePath: "vulnerabilities.html", scriptId: "vulnerability-report-data", recordsKey: "records", path: "/vulnerabilities-feed.xml", title: "脆弱性レポート 更新RSS" },
  { key: "security-incidents", relativePath: "security-incidents.html", scriptId: "incident-register", recordsKey: "incidents", path: "/security-incidents-feed.xml", title: "漏洩・セキュリティ事案レポート 更新RSS" },
];
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const cleanText = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
const observationKeys = new Set(["checked_at", "source_checked_at", "content_updated_at", "content_updated_utc", "content_updated_jst", "revision", "updated", "latest_date", "checked", "checked_at_utc", "last_content_change", "fingerprint"]);

function semanticValue(value) {
  if (Array.isArray(value)) return value.map(semanticValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => !observationKeys.has(key)).map((key) => [key, semanticValue(value[key])]));
  return value;
}

export function reportData(source, feed) {
  const scripts = scanTags(source).filter((tag) => tag.name === "script" && !tag.closing && tag.attrs.get("id")?.value === feed.scriptId && tag.attrs.get("type")?.value === "application/json");
  if (scripts.length !== 1) throw new Error(`Expected one ${feed.scriptId} JSON register.`);
  const start = scripts[0].end;
  const end = source.slice(start).search(/<\/script\s*>/i);
  if (end < 0) throw new Error(`Unclosed ${feed.scriptId} register.`);
  const data = JSON.parse(source.slice(start, start + end));
  if (!Array.isArray(data.changes) || !Array.isArray(data[feed.recordsKey])) throw new Error(`Invalid ${feed.key} report register.`);
  return data;
}

export function reportChanges(data, feed) {
  const changes = [];
  for (const change of data.changes) {
    const summary = cleanText(change.summary);
    if (!summary) throw new Error(`Missing ${feed.key} material change summary.`);
    const ids = [...new Set(["incident_ids", "added_ids", "updated_ids"].flatMap((key) => Array.isArray(change[key]) ? change[key] : []))].sort();
    if (ids.some((id) => typeof id !== "string" || !id)) throw new Error("Invalid report change IDs.");
    // Older material incident histories may omit IDs. The record delta, not
    // target-ID presence, decides whether a journal entry is incident news.
    if (change.rss === false) continue;
    changes.push({ signature: hash({ summary, ids }), summary, ids, date: change.date });
  }
  return changes;
}

function recordFingerprints(data, feed) {
  const records = {};
  for (const record of data[feed.recordsKey]) {
    if (typeof record.id !== "string" || !record.id || Object.hasOwn(records, record.id)) throw new Error(`Invalid or duplicate ${feed.key} record ID.`);
    Object.defineProperty(records, record.id, { value: hash(semanticValue(record)), enumerable: true });
  }
  return Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function deltaIds(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter((id) => (Object.hasOwn(before, id) ? before[id] : null) !== (Object.hasOwn(after, id) ? after[id] : null));
}

function deltaFingerprint(before, after) {
  const delta = deltaIds(before, after).map((id) => [id, Object.hasOwn(before, id) ? before[id] : null, Object.hasOwn(after, id) ? after[id] : null]);
  return delta.length ? hash(delta) : null;
}

// Multiset matching accepts appended or prepended histories, repeated wording
// for distinct updates, and journal corrections. Dates alone aren't new news.
function freshChanges(before, after) {
  const used = new Set();
  const matched = new Set();
  // Prefer exact occurrence dates before ignoring date-only edits. This avoids
  // assigning a correction to another update with the same summary wording.
  for (const [index, change] of after.entries()) {
    const candidate = before.findIndex((old, oldIndex) => !used.has(oldIndex) && old.signature === change.signature && old.date === change.date);
    if (candidate >= 0) { used.add(candidate); matched.add(index); }
  }
  for (const [index, change] of after.entries()) {
    if (matched.has(index)) continue;
    const candidate = before.findIndex((old, oldIndex) => !used.has(oldIndex) && old.signature === change.signature);
    if (candidate >= 0) { used.add(candidate); matched.add(index); }
  }
  return after.filter((change, index) => !matched.has(index));
}

function isoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid report feed timestamp: ${value}`);
  return new Date(value).toISOString();
}

function declaredDate(value) {
  if (/^\d{4}-\d\d-\d\d$/.test(value || "")) {
    const date = new Date(`${value}T00:00:00+09:00`);
    if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== value) throw new Error(`Invalid report update date: ${value}`);
    return { published: date.toISOString(), precision: "day", declaredDate: value };
  }
  return { published: isoTimestamp(value), precision: "second" };
}

function itemFor(fingerprint, changes, date) {
  const journal = [...new Map(changes.map((change) => [change.signature, change])).values()];
  return { fingerprint, summary: journal.map((change) => change.summary).join(" "), journal, ...date };
}

// Replay material record deltas at their actual Git publication time. A commit
// that only changes observation dates, styling or wording never creates an item.
function historicalItems(root, feed, previous = null) {
  let history;
  try { history = execFileSync("git", ["-C", root, "log", "--reverse", "--format=%H%x09%cI", "--", `public/${feed.relativePath}`], { encoding: "utf8", stdio: "pipe" }).trim().split("\n").filter(Boolean).map((line) => { const [sha, date] = line.split("\t"); return { sha, date }; }); }
  catch { return null; }
  if (!history.length) return null;
  const start = previous ? history.findIndex((commit) => commit.sha === previous.cursor) + 1 : 0;
  // A shallow/source export or rewritten history cannot safely replay a cursor
  // it lacks. Saved snapshots still support deterministic journal-date updates.
  if (previous && (!previous.cursor || start === 0)) return null;
  let beforeRecords = previous?.records || {};
  let beforeChanges = previous?.journal || [];
  const items = new Map();
  const pending = [];
  for (const { sha, date } of history.slice(start)) {
    let data;
    try {
      const source = execFileSync("git", ["-C", root, "show", `${sha}:public/${feed.relativePath}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: "pipe" });
      data = reportData(source, feed);
    } catch { continue; } // Earlier versions may predate the structured journal.
    const records = recordFingerprints(data, feed);
    const changes = reportChanges(data, feed);
    const fingerprint = deltaFingerprint(beforeRecords, records);
    const fresh = freshChanges(beforeChanges, changes);
    const publish = (update, summaries) => { if (!items.has(update.fingerprint)) items.set(update.fingerprint, itemFor(update.fingerprint, summaries, { published: update.published, precision: "second" })); };
    if (fingerprint) {
      const update = { fingerprint, sha, published: isoTimestamp(date), ids: deltaIds(beforeRecords, records) };
      // A normal material commit's own summary must never label older, unrelated
      // unresolved data. Keep those pending until an explicit summary-only fix.
      if (fresh.length) publish(update, fresh);
      else pending.push(update);
    } else if (fresh.length && pending.length) {
      // A separate summary-only commit repairs earlier data publication. For
      // incidents, the listed target IDs must cover each pending delta's IDs.
      const targets = new Set(fresh.flatMap((change) => change.ids));
      for (let index = pending.length - 1; index >= 0; index--) {
        const update = pending[index];
        if (feed.key === "security-incidents" && !update.ids.every((id) => targets.has(id))) continue;
        publish(update, fresh);
        pending.splice(index, 1);
      }
    }
    beforeRecords = records;
    beforeChanges = changes;
  }
  if (pending.length) throw new Error(`${feed.key}: material Git update ${pending[0].sha} has no new/updated changes[].summary. Add a meaningful summary for the pending delta(s) in a separate summary-only follow-up commit (with their target IDs for incidents), then rerun generation.`);
  return { items: [...items.values()], cursor: history.at(-1).sha, records: beforeRecords };
}

export async function readReportState(root) {
  let state;
  try { state = JSON.parse(await readFile(path.join(root, REPORT_STATE_FILE), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, reports: {} }; throw error; }
  if (state.version !== 1 || !state.reports || typeof state.reports !== "object" || Array.isArray(state.reports)) throw new Error("Invalid report feed state.");
  for (const [key, report] of Object.entries(state.reports)) {
    if (!REPORT_FEEDS.some((feed) => feed.key === key) || report.cursor !== null && !/^[a-f0-9]{40}$/.test(report.cursor) || !report.records || typeof report.records !== "object" || Array.isArray(report.records) || Object.values(report.records).some((fingerprint) => !digest.test(fingerprint)) || !Array.isArray(report.journal) || !Array.isArray(report.items)) throw new Error("Invalid report feed state record.");
    const validChange = (change) => digest.test(change.signature) && cleanText(change.summary) && Array.isArray(change.ids) && change.ids.every((id) => typeof id === "string");
    if (!report.journal.every(validChange)) throw new Error("Invalid report feed journal.");
    const identities = new Set();
    for (const item of report.items) {
      if (!digest.test(item.fingerprint) || identities.has(item.fingerprint) || !cleanText(item.summary) || !Array.isArray(item.journal) || !item.journal.every(validChange) || !["day", "second"].includes(item.precision)) throw new Error("Invalid report feed item.");
      isoTimestamp(item.published);
      if (item.precision === "day" && declaredDate(item.declaredDate).published !== item.published) throw new Error("Invalid report feed day.");
      identities.add(item.fingerprint);
    }
  }
  return state;
}

export function renderReportFeed(feed, items) {
  const ordered = [...items].sort((a, b) => Date.parse(b.published) - Date.parse(a.published) || a.fingerprint.localeCompare(b.fingerprint, "en"));
  const url = SITE_URL + "/" + feed.key;
  const xml = ordered.map((item) => {
    const summary = item.summary + (item.precision === "day" ? ` 更新履歴の日付（JST）：${item.declaredDate}。時刻は記録なし。` : "");
    const title = cleanText(item.summary.split(/[。\n]/)[0]).slice(0, 100);
    return `    <item>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(url)}</link>\n      <guid isPermaLink="false">${escapeXml(`${SITE_URL}${feed.path}#${item.fingerprint}`)}</guid>\n      <description>${escapeXml(escapeHtml(summary))}</description>\n      <pubDate>${new Date(item.published).toUTCString()}</pubDate>\n      <dcterms:created>${isoTimestamp(item.published)}</dcterms:created>\n    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/">\n  <channel>\n    <title>${escapeXml(feed.title)}</title>\n    <link>${url}</link>\n    <description>レポートの追加・訂正・重要な続報を更新ごとの別項目で配信。項目の日付はレポート掲載日時で、脆弱性・事件の発生日時ではありません。</description>\n    <language>ja</language>\n    <atom:link href="${SITE_URL}${feed.path}" rel="self" type="application/rss+xml"/>\n    <ttl>5</ttl>\n${ordered.length ? `    <lastBuildDate>${new Date(ordered[0].published).toUTCString()}</lastBuildDate>\n` : ""}${xml}${xml ? "\n" : ""}  </channel>\n</rss>\n`;
}

function isShallowRepository(root) {
  try { return execFileSync("git", ["-C", root, "rev-parse", "--is-shallow-repository"], { encoding: "utf8", stdio: "pipe" }).trim() === "true"; }
  catch { return false; } // A Git-free source export is distinct from a shallow CI checkout.
}

export async function writeReportFeeds(root, pages) {
  const previous = await readReportState(root);
  const shallow = isShallowRepository(root);
  const reports = { ...previous.reports };
  const outputs = [];
  for (const feed of REPORT_FEEDS) {
    const page = pages.find((page) => page.relativePath === feed.relativePath);
    // Retain state through removal/restoration without reannouncing old items.
    if (!page) { outputs.push([feed, []]); continue; }
    const data = reportData(page.source, feed);
    const records = recordFingerprints(data, feed);
    const journal = reportChanges(data, feed);
    const old = previous.reports[feed.key];
    if (shallow && (!old || deltaFingerprint(old.records, records))) throw new Error(`${feed.key}: a shallow Git checkout cannot recover material update history. Wait for the full-history generation workflow to commit ${REPORT_STATE_FILE}, or use a complete Git checkout. Existing unchanged saved state is safe to deploy.`);
    if (!old && Object.keys(records).length && !journal.length) throw new Error(`${feed.key}: the initial report needs a meaningful changes[].summary before generating its feed.`);
    const historical = historicalItems(root, feed, old);
    if (historical && hash(historical.records) !== hash(records)) throw new Error(`${feed.key}: current material report data differs from committed Git history. Commit the report and its meaningful changes[].summary before generating feeds.`);
    const items = [...(old?.items || [])];
    if (historical) for (const item of historical.items) if (!items.some((existing) => existing.fingerprint === item.fingerprint)) items.push(item);
    const fingerprint = old ? deltaFingerprint(old.records, records) : null;
    const fresh = old ? freshChanges(old.journal, journal) : [];
    if (old && fingerprint && !fresh.length && !historical?.items.length) throw new Error(`${feed.key}: material report data changed without a new/updated changes[].summary. Add a meaningful summary of this delta before publishing.`);
    if (fingerprint && fresh.length && !historical && !items.some((item) => item.fingerprint === fingerprint)) {
      const latest = [...fresh].sort((a, b) => Date.parse(declaredDate(b.date).published) - Date.parse(declaredDate(a.date).published))[0];
      items.push(itemFor(fingerprint, fresh, declaredDate(latest.date)));
    }
    if (!old && !items.length) {
      // Git-free exports use explicit historical journal dates, with day-level
      // precision disclosed. Never backfill every entry at the build time.
      // Without Git/state, IDless incident histories cannot be distinguished
      // from UI-only corrections. Use only explicitly targeted histories.
      const dated = journal.filter((change) => feed.key !== "security-incidents" || change.ids.length);
      const unique = new Map(dated.map((change) => [hash({ signature: change.signature, date: change.date }), change]));
      for (const [identity, change] of unique) items.push(itemFor(identity, [change], declaredDate(change.date)));
      if (Object.keys(records).length && !items.length) throw new Error(`${feed.key}: Git-free initial backfill needs targeted change summaries or preserved feed state/full Git history.`);
    }
    if (old && !fingerprint) {
      // Correct one unambiguous historical wording edit in place. Facts have
      // not changed; keep its original GUID and publication date.
      const removed = freshChanges(journal, old.journal);
      if (fresh.length === 1 && removed.length === 1 && fresh[0].date === removed[0].date && JSON.stringify(fresh[0].ids) === JSON.stringify(removed[0].ids)) {
        let matching = items.map((item, index) => ({ item, index })).filter(({ item }) => item.journal.filter((change) => change.signature === removed[0].signature && change.date === removed[0].date).length === 1);
        if (!matching.length) matching = items.map((item, index) => ({ item, index })).filter(({ item }) => item.journal.filter((change) => change.signature === removed[0].signature).length === 1);
        if (matching.length === 1) {
          const { item, index } = matching[0];
          items[index] = itemFor(item.fingerprint, item.journal.map((change) => change.signature === removed[0].signature ? fresh[0] : change), { published: item.published, precision: item.precision, ...(item.declaredDate ? { declaredDate: item.declaredDate } : {}) });
        }
      }
    }
    reports[feed.key] = { records, journal, items, cursor: historical?.cursor || old?.cursor || null };
    outputs.push([feed, items]);
  }
  // Validate both topics before writing. Main generation stages the complete
  // generated set together and refetches/retries if concurrent main changes.
  for (const [feed, items] of outputs) await writeFile(path.join(root, "public", feed.path.slice(1)), renderReportFeed(feed, items), "utf8");
  await writeFile(path.join(root, REPORT_STATE_FILE), JSON.stringify({ version: 1, reports }, null, 2) + "\n", "utf8");
}
