import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../public/php-emergency-maintenance.html", import.meta.url), "utf8");
const data = JSON.parse(readFileSync(new URL("../public/data/emergency-maintenance-20261021.json", import.meta.url), "utf8"));
const sectionStart = html.indexOf('<section class="section" id="stream-impacts"');
assert.ok(sectionStart >= 0, "the impact notices have their own semantic section");
const sectionEnd = html.indexOf("</section>", sectionStart) + "</section>".length;
const section = html.slice(sectionStart, sectionEnd);
const notices = data.streamImpacts;
// Parse only this small addition, never the full multi-megabyte tracker.
const fragment = () => JSDOM.fragment(section);
const field = (article, key) => article.querySelector(`[data-field="${key}"] dd`);

test("stream impacts have separate native headings, facts and public source links", () => {
  const d = fragment();
  const region = d.querySelector("section#stream-impacts");
  assert.equal(region.querySelector("h2").id, region.getAttribute("aria-labelledby"));
  assert.equal(region.querySelectorAll("h1,h4,h5,h6").length, 0);
  const articles = [...region.querySelectorAll(".facts > article.fact")];
  assert.equal(notices.length, 2);
  assert.deepEqual(articles.map(x => x.id), notices.map(x => x.id));
  assert.match(html.slice(0, sectionStart), /<nav[^>]*>[\s\S]*?<a href="#stream-impacts">配信先の変更・延期<\/a>[\s\S]*?<\/nav>/);
  const ids = [...html.matchAll(/\bid="([^"\s]+)"/g)].map(x => x[1]);
  assert.equal(new Set(ids).size, ids.length, "new IDs must not collide with any existing anchor");
  notices.forEach((record, index) => {
    const article = articles[index];
    assert.equal(article.querySelector("h3").textContent, record.title);
    assert.ok(article.textContent.includes(record.status));
    assert.ok(article.textContent.includes(record.summary));
    assert.equal(field(article, "scope").textContent, record.scope);
    assert.equal(field(article, "followup").textContent, record.followup.condition);
    assert.ok(field(article, "change").textContent.includes(record.from.platform));
    if (record.to.platform) assert.ok(field(article, "change").textContent.includes(record.to.platform));
    assert.equal(article.querySelectorAll("dl > div").length, 6);
    article.querySelectorAll("dl > div").forEach(group => {
      assert.equal(group.querySelectorAll(":scope > dt").length, 1);
      assert.equal(group.querySelectorAll(":scope > dd").length, 1);
    });
    const links = [...article.querySelectorAll("a[href]")];
    assert.deepEqual(new Set(links.map(x => x.getAttribute("href"))), new Set(record.sources.map(x => x.url)));
    links.forEach(link => {
      assert.equal(new URL(link.getAttribute("href")).protocol, "https:");
      assert.ok(link.textContent.trim(), "native links have visible accessible names");
      assert.equal(link.getAttribute("target"), "_blank");
      assert.ok(link.relList.contains("noopener") && link.relList.contains("noreferrer"));
      assert.equal(link.getAttribute("referrerpolicy"), "no-referrer");
      assert.ok(!link.hasAttribute("tabindex") && !link.hasAttribute("aria-hidden"));
      assert.equal(link.closest("[hidden],[inert],[aria-hidden=true]"), null);
    });
    assert.equal(record.actual.startAt, null);
    assert.equal(record.actual.outcome, null);
    assert.equal(record.followup.replacementDate, null);
    assert.equal(record.followup.returnToOriginalPlatform, null);
    assert.equal(record.announcement.updatedAt, null);
    assert.ok(record.sources.every(source => Number.isFinite(Date.parse(source.checkedAt))));
  });
  assert.equal(region.querySelectorAll("iframe,script,style,link,img,video,audio,object,embed,form").length, 0,
    "no auto-embeds, new assets, scripts, fonts or external resource loading");
  assert.equal(region.querySelectorAll("[style],[onclick],[onload],[role=button]").length, 0);
});

test("weekly-shimo keeps the relative week, unspecified date/TZ and unverified execution", () => {
  const record = notices.find(x => x.kind === "destination_change_notice");
  const article = fragment().getElementById(record.id);
  assert.equal(record.from.platform, "TwitCasting");
  assert.equal(record.to.platform, "YouTube");
  assert.equal(record.to.url, "https://www.youtube.com/live/cwtCURntlb0");
  assert.equal(record.scheduled.date, null);
  assert.equal(record.scheduled.dateText, "今週");
  assert.equal(record.scheduled.announcedStart, "21:30");
  assert.equal(record.scheduled.originalStart, null);
  assert.equal(record.scheduled.originalEnd, null);
  assert.equal(record.scheduled.timezone, null);
  assert.equal(record.actual.verification, "実施未確認");
  assert.equal(record.status, "変更の告知を確認／実施未確認");
  assert.equal(record.announcement.publishedAt, "2026-10-22T12:04:47Z");
  assert.match(field(article, "scheduled").textContent, /「今週」21:30予定/);
  assert.match(field(article, "scheduled").textContent, /絶対日付・タイムゾーン.*未確認/);
  assert.equal(field(article, "scheduled").querySelectorAll("time[datetime]").length, 0,
    "the post date must not be substituted for the target stream date");
  assert.doesNotMatch(field(article, "scheduled").textContent, /2026|10月22日|10\/22|JST/);
  assert.equal(field(article, "announcement").querySelector("time").dateTime, record.announcement.publishedAt);
  assert.match(field(article, "announcement").textContent, /投稿掲載時計.*対象配信日・実開始時計ではなく/);
  assert.match(field(article, "scope").textContent, /実際のYouTube配信とツイキャスへの復帰は未確認/);
  assert.deepEqual(record.ownership.map(({ from, to }) => ({ from, to })), [
    { from: "https://twitcasting.tv/weeklyshimo", to: "https://twitter.com/weeklyshimo" },
    { from: record.announcement.url, to: record.to.url }
  ]);
  assert.match(record.sources.find(x => x.role === "destination").verification, /実施日・実開始・アーカイブは確認できていません/);
});

test("Nenez keeps the explicit 2026 schedule and only the broadcast postponement", () => {
  const record = notices.find(x => x.kind === "postponement_notice");
  const article = fragment().getElementById(record.id);
  assert.equal(record.from.platform, "TwitCasting Premier");
  assert.deepEqual(record.to, { platform: null, url: null });
  assert.equal(record.scheduled.date, "2026-10-22");
  assert.equal(record.scheduled.originalStart, "19:00");
  assert.equal(record.scheduled.originalEnd, "22:00");
  assert.equal(record.scheduled.announcedStart, null);
  assert.equal(record.scheduled.timezone, null);
  assert.equal(record.announcement.publishedAt, null);
  assert.equal(record.status, "延期告知／振替日未確認");
  assert.equal(record.actual.verification, "振替実施未確認");
  assert.equal(field(article, "scheduled").querySelector("time").dateTime, record.scheduled.date);
  assert.match(field(article, "scheduled").textContent, /2026年10月22日 19:00〜22:00予定.*タイムゾーン未記載/);
  assert.equal(field(article, "announcement").querySelectorAll("time").length, 0);
  assert.match(field(article, "scope").textContent, /配信部分。会場公演の中止を示す情報ではありません/);
  assert.match(field(article, "followup").textContent, /別日公演から振替済みと推定しません/);
  assert.equal(record.announcement.url, "https://nenez.bitfan.id/schedules/128354?r=tnazs1");
});

test("impact records do not become service cards or affect existing counts and filters", () => {
  const d = fragment();
  assert.equal(d.querySelectorAll(".service,.candidate,.reviewed-source,[data-category],[data-restored],[data-reason]").length, 0);
  assert.match(d.textContent, /告知対象カード・範囲内復旧・照合待ちの件数には加算せず/);
  assert.match(d.textContent, /検索・絞り込み・カード／コンパクト一覧の対象外/);
  const confirmedStart = html.indexOf('<section class="section" id="confirmed">');
  const confirmed = html.slice(confirmedStart, sectionStart);
  const cardIds = [...confirmed.matchAll(/<article class="service" id="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(cardIds, data.confirmed.map(x => x.id), "use the dataset, not a fixed global card count");
  assert.ok(confirmed.endsWith("</div></section>\n"), "impacts begin after the services section closes");
  assert.ok(html.indexOf('<section class="section pending-section" id="pending">') >= sectionEnd);
  assert.ok(notices.every(x => !data.confirmed.some(card => card.id === x.id)));
  const stats = JSDOM.fragment(html.match(/<div class="stats"[\s\S]*?<\/div><\/div>/)[0]);
  assert.deepEqual([...stats.querySelectorAll("b")].map(x => Number(x.textContent)), [
    data.confirmed.length, data.pending.length, data.confirmed.filter(x => x.restored === true).length
  ]);
  assert.equal(Number.parseInt(confirmed.match(/<p id="count"[^>]*>(\d+)/)[1], 10), data.confirmed.length);

  // Exercise the actual controller with one real service card and the small impact section.
  const controls = confirmed.slice(0, confirmed.indexOf('<div class="grid" id="services">'));
  const card = confirmed.match(/<article class="service"[\s\S]*?<\/article>/)[0];
  const extra = '<details id="pending-details"><summary>照合待ち</summary><p id="pending-count"></p></details><details id="reviewed-details"><summary>関連</summary><p id="reviewed-count"></p></details>';
  const dom = new JSDOM(controls + '<div id="services">' + card + '</div></section>' + section + extra,
    { url: "https://share.0g0.xyz/php-emergency-maintenance", runScripts: "outside-only" });
  try {
    const w = dom.window, doc = w.document;
    w.eval(html.match(/<script id="maintenance-view-script">([\s\S]*?)<\/script>/)[1]);
    const query = doc.getElementById("query");
    query.value = "__no_matching_site__";
    query.dispatchEvent(new w.Event("input", { bubbles: true }));
    doc.getElementById("view-list").click();
    assert.equal(doc.querySelector("#services > .service").hidden, true);
    assert.ok([...doc.querySelectorAll("#stream-impacts article")].every(article => !article.hidden));
    assert.equal(doc.getElementById("stream-impacts").hidden, false);
    assert.match(doc.getElementById("count").textContent, /^0 \/ 1件/);
  } finally { dom.window.close(); }
});
