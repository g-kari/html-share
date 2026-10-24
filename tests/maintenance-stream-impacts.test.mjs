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
  const displayedCount = Number(region.querySelector(".intro").textContent.match(/整理した(\d+)件/)[1]);
  assert.equal(displayedCount, notices.length);
  assert.ok(region.textContent.includes(`この${notices.length}件は上の`));
  assert.deepEqual(articles.map(x => x.id), notices.map(x => x.id));
  assert.match(html.slice(0, sectionStart), /<nav[^>]*>[\s\S]*?<a href="#stream-impacts">配信の変更・延期・中止／後続記録<\/a>[\s\S]*?<\/nav>/);
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
      assert.ok(group.querySelector("dt").textContent.length <= 3, "labels fit the existing narrow dt column");
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
    const sourceUrls = new Set(record.sources.map(source => source.url));
    // New evidence is allowed, but it must identify its source and limitations.
    if (record.actual.startAt !== null || record.actual.outcome !== null) {
      assert.ok(sourceUrls.has(record.actual.sourceUrl));
      assert.ok(record.actual.qualifier);
      assert.ok(record.evidence?.level);
    }
    if (record.followup.replacementDate !== null || record.followup.returnToOriginalPlatform !== null) {
      assert.ok(sourceUrls.has(record.followup.sourceUrl));
      assert.ok(record.followup.qualifier);
    }
    if (record.evidence) {
      assert.ok(record.evidence.level && record.evidence.qualifier);
      assert.equal(typeof record.evidence.playbackVerified, "boolean");
    }
    for (const observation of record.observations || []) {
      assert.ok(["public_archive_metadata", "creator_completion_report", "creator_followup_plan"].includes(observation.type));
      assert.ok(sourceUrls.has(observation.sourceUrl));
      assert.ok(observation.summary && observation.qualifier);
      assert.equal(observation.playbackVerified, false, "metadata or an attributed report is not playback verification");
      const clock = observation.recordedStartAt || observation.publishedAt;
      assert.ok(Number.isFinite(Date.parse(clock)));
      assert.ok(article.querySelector(`[datetime="${clock}"]`), "observation clocks are labelled in HTML separately");
      assert.ok(article.textContent.includes(observation.qualifier));
    }
    assert.ok(record.sources.every(source => Number.isFinite(Date.parse(source.checkedAt))));
  });
  assert.equal(region.querySelectorAll("iframe,script,style,link,img,video,audio,object,embed,form").length, 0,
    "no auto-embeds, new assets, scripts, fonts or external resource loading");
  assert.equal(region.querySelectorAll("[style],[onclick],[onload],[role=button]").length, 0);
});

test("weekly-shimo keeps the relative week, unspecified date/TZ and unverified execution", () => {
  const record = notices.find(x => x.id === "twitcasting-weeklyshimo-youtube-only-20261022");
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
  assert.equal(record.actual.startAt, null);
  assert.equal(record.actual.outcome, null);
  assert.equal(record.followup.replacementDate, null);
  assert.equal(record.followup.returnToOriginalPlatform, null);
  assert.equal(record.announcement.updatedAt, null);
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
  const record = notices.find(x => x.id === "twitcasting-nenez-postponed-20261022");
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
  assert.equal(record.actual.startAt, null);
  assert.equal(record.actual.outcome, null);
  assert.equal(record.followup.replacementDate, null);
  assert.equal(record.followup.returnToOriginalPlatform, null);
  assert.equal(record.announcement.updatedAt, null);
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

const byId = id => {
  const record = notices.find(x => x.id === id);
  assert.ok(record, `the verified notice ${id} remains present`);
  return { record, article: fragment().getElementById(id) };
};
const unknownTarget = record => {
  assert.equal(record.scheduled.date, null);
  assert.equal(record.scheduled.timezone, null);
  assert.equal(record.actual.startAt, null);
  assert.equal(record.actual.outcome, null);
  assert.equal(record.announcement.updatedAt, null);
};

test("Konoha's Mirrativ detour stays an attributed live claim with denied destination read", () => {
  const { record, article } = byId("twitcasting-konoha-kaede-mirrativ-detour-20261021");
  unknownTarget(record);
  assert.equal(record.kind, "detour_self_report");
  assert.equal(record.scheduled.dateText, "今夜");
  assert.equal(record.scheduled.announcedStart, null);
  assert.equal(record.evidence.level, "creator_self_report");
  assert.equal(record.selfReportedActivity.sourceUrl, record.announcement.url);
  assert.equal(record.selfReportedActivity.state, "broadcasting_at_alternative_destination");
  assert.equal(record.selfReportedActivity.actualStartAt, null);
  assert.equal(record.to.platform, "Mirrativ");
  assert.equal(record.to.url, "https://www.mirrativ.com/web/renewal/live/_Yl5gUJZoC9KG7Ms2CvOBg");
  assert.equal(record.destinationAccess.state, "403_access_restriction");
  assert.equal(record.destinationAccess.continued, false);
  assert.equal(record.announcement.publishedAt, "2026-10-21T13:58:47Z");
  assert.match(article.textContent, /本人申告.*独立確認なし/);
  assert.match(field(article, "scope").textContent, /403で停止/);
  assert.doesNotMatch(field(article, "scheduled").textContent, /2026|10月21日|10\/21|JST/);
});

test("Rei's maintenance-triggered Twitch activity is not presented as a confirmed relocation", () => {
  const { record, article } = byId("twitcasting-gyokuya-rei-twitch-self-report-20261021");
  unknownTarget(record);
  assert.equal(record.kind, "alternative_platform_activity_self_report");
  assert.equal(record.scheduled.dateText, null);
  assert.equal(record.scheduled.announcedStart, null);
  assert.equal(record.evidence.level, "creator_self_report");
  assert.equal(record.selfReportedActivity.state, "started_alternative_platform_stream");
  assert.equal(record.selfReportedActivity.sourceUrl, record.announcement.url);
  assert.equal(record.selfReportedActivity.actualStartAt, null);
  assert.equal(record.to.urlRole, "creator_linked_channel");
  assert.equal(record.announcement.publishedAt, "2026-10-21T13:58:43Z");
  assert.match(field(article, "scope").textContent, /移動か通常の併用・同時配信かは未確認/);
  assert.match(field(article, "scope").textContent, /確定した移動事例にはしません/);
});

test("Plum's YouTube preparation remains a plan and the linked channel is not an exact stream", () => {
  const { record, article } = byId("twitcasting-plum-youtube-plan-20261021");
  unknownTarget(record);
  assert.equal(record.kind, "destination_change_plan");
  assert.equal(record.evidence.level, "creator_plan");
  assert.equal(record.scheduled.announcedStart, null);
  assert.equal(record.to.platform, "YouTube");
  assert.equal(record.to.url, null);
  assert.equal(record.to.ownedChannelUrl, "https://www.youtube.com/channel/UC3t1gPnZ3oAv1ak-Dvdh4Bg");
  assert.equal(record.selfReportedActivity, undefined, "a plan is not a claim that streaming started");
  assert.match(article.querySelector(`a[href="${record.to.ownedChannelUrl}"]`).textContent, /チャンネル（個別配信枠ではありません）/);
  assert.match(record.summary, /開始したという申告ではありません/);
  assert.equal(record.announcement.publishedAt, "2026-10-21T15:04:14Z");
});

test("Sanji's Nico notice separates relative target date from later TwitCasting metadata", () => {
  const { record, article } = byId("twitcasting-sanji-nicolive-notice-20261021");
  unknownTarget(record);
  assert.equal(record.scheduled.dateText, "本日");
  assert.equal(record.scheduled.announcedStart, null);
  assert.equal(record.to.url, "https://live.nicovideo.jp/watch/lv351644019");
  assert.equal(record.announcement.publishedAt, "2026-10-21T17:07:07.000Z");
  const observation = record.observations[0];
  assert.equal(observation.type, "public_archive_metadata");
  assert.equal(observation.sourceUrl, "https://twitcasting.tv/sanji252525/movie/842589989");
  assert.equal(observation.recordedStartAt, "2026-10-23T02:00:05+09:00");
  assert.equal(observation.recordedStartAtUTC, "2026-10-22T17:00:05Z");
  assert.equal(observation.playbackVerified, false);
  assert.equal(record.followup.returnToOriginalPlatform, null);
  assert.match(article.textContent, /最初の復帰・ニコ生の実施・プラットフォーム全体の復旧は証明しません/);
  assert.match(field(article, "scheduled").textContent, /抽出日付に投稿との不整合/);
  assert.doesNotMatch(article.textContent + JSON.stringify(record), /2026-12|12月|December/,
    "the conflicting December extraction is not published as an event time");
});

test("Furendo's separately dated follow-up is tentative and episode numbering remains qualified", () => {
  const { record, article } = byId("twitcasting-friend-o-radio-postponement-20261022");
  unknownTarget(record);
  assert.equal(record.title, "風蓮堂Radio");
  assert.equal(record.scheduled.dateText, "本日");
  assert.equal(record.scheduled.originalStart, "21:30");
  assert.equal(record.announcement.publishedAt, "2026-10-22T11:42:15.000Z");
  assert.equal(record.followup.replacementDate, null);
  const observation = record.observations[0];
  assert.equal(observation.type, "creator_followup_plan");
  assert.equal(observation.sourceUrl, "https://x.com/friend_o_info/status/2113854195623502058");
  assert.equal(observation.publishedAt, "2026-10-24T04:44:48.000Z");
  assert.notEqual(observation.sourceUrl, record.announcement.url);
  assert.match(article.textContent, /別投稿の掲載時計であり原投稿の更新時計ではありません/);
  assert.match(article.textContent, /来週.*検討/);
  assert.match(field(article, "scope").textContent, /原投稿は第322回.*不整合.*古い第322回の記録と同一視しません/);
  assert.equal(field(article, "scheduled").querySelectorAll("time").length, 0);
});

test("Hanarokusho separates cancellation, conditional replacement, archive record and creator report", () => {
  const { record, article } = byId("twitcasting-hana69syou-cancellation-followup-20261021");
  unknownTarget(record);
  assert.equal(record.scheduled.dateText, "本日");
  assert.equal(record.kind, "cancellation_with_conditional_replacement");
  assert.equal(record.announcement.publishedAt, "2026-10-21T10:56:41.000Z");
  assert.deepEqual(record.conditionalReplacement, {
    date: null, dateText: "明日／10/22(木)", start: "22:30", timezone: null,
    condition: "メンテナンスが終了している場合", confirmed: false
  });
  assert.equal(record.evidence.level, "public_archive_metadata_and_creator_report");
  assert.equal(record.evidence.playbackVerified, false);
  const [archive, report] = record.observations;
  assert.equal(archive.type, "public_archive_metadata");
  assert.equal(archive.sourceUrl, "https://twitcasting.tv/hana69syou/movie/842580338");
  assert.equal(archive.recordedStartAt, "2026-10-22T22:30:04+09:00");
  assert.equal(archive.recordedStartAtUTC, "2026-10-22T13:30:04Z");
  assert.equal(report.type, "creator_completion_report");
  assert.equal(report.sourceUrl, "https://twitcasting.tv/hana69syou/communityshow/30729138");
  assert.equal(report.publishedAt, "2026-10-22T23:57:57+09:00");
  assert.equal(report.publishedAtUTC, "2026-10-22T14:57:57Z");
  assert.match(article.textContent, /元の中止枠の振替と明記した報告ではなく/);
  assert.match(article.textContent, /再生・内容は未確認/);
  assert.match(article.textContent, /全プラットフォームの復旧確認ではありません/);
  assert.equal(field(article, "scheduled").querySelectorAll("time").length, 0,
    "the archive timezone must not retroactively supply the initial plan's timezone");
});
