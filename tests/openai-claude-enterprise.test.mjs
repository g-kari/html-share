import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../public/openai-claude-enterprise.html", import.meta.url), "utf8");
const { document } = new JSDOM(html).window;

test("Enterprise comparison has accessible structure, canonical and social metadata", () => {
  assert.equal(document.documentElement.lang, "ja");
  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.match(document.title, /OpenAI EnterpriseとClaude Enterprise/);
  assert.equal(document.querySelector('link[rel="canonical"]')?.href,
    "https://share.0g0.xyz/openai-claude-enterprise");
  assert.ok(document.querySelector('meta[name="description"]')?.content.length > 50);
  assert.equal(document.querySelector('meta[property="og:image:type"]')?.content, "image/png");
  assert.equal(document.querySelector('meta[property="og:image:width"]')?.content, "1730");
  assert.equal(document.querySelector('meta[property="og:image:height"]')?.content, "909");
  assert.equal(document.querySelector('meta[name="twitter:card"]')?.content, "summary_large_image");
  assert.equal(document.querySelector('a.skip[href="#main"]')?.textContent, "本文へ移動");
  assert.equal(document.querySelectorAll(".toc a").length, 10);
  assert.equal(document.querySelectorAll("#checklist > ol > li").length, 8);
  assert.equal(document.querySelectorAll("#conclusion .key li").length, 5);
  assert.ok(document.querySelectorAll("details").length >= 2);
  assert.match(html, /prefers-reduced-motion/);

  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate IDs");
  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    assert.ok(document.getElementById(anchor.getAttribute("href").slice(1)),
      "missing anchor target: " + anchor.getAttribute("href"));
  }
  for (const table of document.querySelectorAll("table")) {
    assert.ok(table.closest(".table-wrap"), "wide table lacks horizontal scroll wrapper");
    assert.ok(table.querySelectorAll('thead th[scope="col"]').length >= 3);
  }
});

test("Enterprise comparison distinguishes evidence, uncertainty and scope", () => {
  assert.equal(document.querySelectorAll(".source-list > li").length, 29);
  for (const source of document.querySelectorAll(".source-list > li")) {
    assert.ok([...source.querySelectorAll("a[href]")].every((a) => a.href.startsWith("https://")));
    assert.ok(source.querySelector("span")?.textContent.length);
  }
  assert.match(document.body.textContent, /要見積もり/);
  assert.match(document.body.textContent, /前払いクレジット/);
  assert.match(document.body.textContent, /学習除外と機密情報の非送信は別の問題/);
  assert.match(document.body.textContent, /ローカルClaude Code/);
  assert.match(document.body.textContent, /クラウド実行セッションはCompliance API/);
  assert.match(document.body.textContent, /ZDRで保存を抑えると/);
  assert.match(document.body.textContent, /公開仕様だけではセキュリティ上の優劣や年間総費用の優劣を断定できない/);
});

test("Enterprise pricing examples are internally consistent", () => {
  const annual = [20, 30, 49, 50, 100, 150, 151, 200].map((seats) => ({
    seats, monthly: seats * 20, annual: seats * 20 * 12,
  }));
  const seatRows = [...document.querySelectorAll("#cost table tbody tr")].slice(0, annual.length);
  for (const [index, row] of seatRows.entries()) {
    const values = row.querySelectorAll("th,td");
    assert.match(values[0].textContent, new RegExp(`^${annual[index].seats}席$`));
    assert.equal(values[1].textContent, `$${annual[index].monthly.toLocaleString("en-US")}`);
    assert.equal(values[2].textContent, `$${annual[index].annual.toLocaleString("en-US")}`);
  }
  const scenarios = [
    { dev: [5, 1], general: [0.5, 0.125], total: 845 },
    { dev: [20, 4], general: [2, 0.5], total: 1580 },
    { dev: [50, 10], general: [5, 1], total: 3000 },
  ];
  const usageRows = [...document.querySelectorAll("#cost > .table-wrap")[1].querySelectorAll("tbody tr")];
  assert.equal(usageRows.length, scenarios.length);
  for (const [index, { dev, general, total }] of scenarios.entries()) {
    const usage = 10 * (dev[0] * 2 + dev[1] * 10) +
      20 * (general[0] * 2 + general[1] * 10);
    const cells = usageRows[index].querySelectorAll("td");
    assert.equal(cells[2].textContent, `$${usage.toLocaleString("en-US")}`);
    assert.equal(cells[3].textContent, `$${total.toLocaleString("en-US")}`);
    assert.equal(total, 600 + usage);
    assert.equal(cells[4].textContent, `$${(total * 12).toLocaleString("en-US")}`);
  }
});

test("Enterprise OGP and explanatory PNG are complete and dimensioned", async () => {
  for (const [path, width, height] of [
    ["../public/assets/openai-claude-enterprise-ogp-v1.png", 1730, 909],
    ["../public/assets/openai-claude-enterprise-flow-v1.png", 1672, 941],
  ]) {
    const png = await readFile(new URL(path, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png.subarray(-8, -4).toString(), "IEND");
  }
  const image = document.querySelector("#code figure img");
  assert.equal(image?.getAttribute("src"), "/assets/openai-claude-enterprise-flow-v1.png");
  assert.equal(image?.getAttribute("width"), "1672");
  assert.equal(image?.getAttribute("height"), "941");
  assert.match(image?.getAttribute("alt") ?? "", /社内コード/);
  assert.match(document.querySelector("#code figcaption")?.textContent ?? "", /概念図/);
});

test("EFS documentation preserves the storage and evidence boundaries", () => {
  const intro = document.querySelector("#efs");
  assert.ok(document.querySelector('.toc a[href="#efs"]'));
  const body = intro?.nextElementSibling;
  assert.equal(body?.querySelectorAll(".efs-flow li").length, 3);
  assert.ok(body?.querySelector("figure figcaption")?.textContent.includes("顧客側"));
  for (const required of [
    /Messages API/, /Files API/, /Batch API/, /Managed Agents/,
    /ケースのJSON/, /Transcripts/, /別の読める会話記録/,
    /暗号化済みの安全性データを直接読めるという意味ではない/,
    /データ転送のクラウド費用/
  ]) assert.match(body?.textContent ?? "", required);
  assert.ok(document.querySelector('#s24 a')?.href.includes("/enterprise-frontier-safeguards/flagged-cases"));
  assert.ok(document.querySelector("#s25 a")?.href.endsWith("/setup-console"));
  assert.match(body?.querySelector(".note")?.textContent ?? "", /親組織がある場合は配下すべて/);
  assert.match(body?.querySelector(".note")?.textContent ?? "", /既定のワークスペースは対象外/);
});

test("Headcount guidance distinguishes published seat conditions, active users and API billing", () => {
  assert.match(document.title, /2〜200席/);
  assert.match(document.querySelector('meta[property="og:description"]')?.content ?? "", /2〜200席/);
  const guide = document.querySelector("#size");
  assert.deepEqual([...guide.querySelectorAll("dt")].map((dt) => dt.textContent),
    ["2〜19席", "20〜49席", "50〜99席", "100〜150席", "151〜200席"]);
  for (const expected of [/最初に契約予定の有料席数/, /公式の最低は20席/, /公式最低は50席/,
    /公式に150席まで/, /最大200席（未割当も含む）/, /まず40席/, /年間\$33,600/, /端末監視（EDR）/, /APIキーで動かす自動処理/]) {
    assert.match(guide.textContent, expected);
  }
});

test("Token crossover graph describes exact assumptions and accessible alternate values", () => {
  const plot = document.querySelector('.cost-crossover svg[role="img"]');
  assert.ok(plot?.querySelector("title")?.id);
  assert.match(plot?.querySelector("desc")?.textContent ?? "", /2,222万トークン/);
  assert.ok(document.querySelector('.toc a[href="#token-crossover"]'));
  assert.equal(document.querySelectorAll('[aria-label="課金方式別の損益分岐点"] dt').length, 3);
  const slope = .8 * 2 + .2 * 10;
  assert.equal((80 / slope).toFixed(2), "22.22");
  assert.equal((800 / slope).toFixed(2), "222.22");
  assert.match(document.querySelector("#cost").textContent, /全員の合計で月約2億2,222万トークン/);
  assert.match(document.querySelector("#cost").textContent, /Teamがそのトークン数まで使えることを示さない/);
});

test("Non-token costs are a sensitivity rather than a vendor quote", () => {
  const rows = [...document.querySelectorAll('[aria-label^="トークン外の月間費用差"] tbody tr')];
  const cases = [-400, 0, 400, 800];
  const expectedTokens = ["約1億1,111万", "約2億2,222万", "約3億3,333万", "約4億4,444万"];
  for (const [i, nonToken] of cases.entries()) {
    assert.equal(rows[i].children[1].textContent, expectedTokens[i]);
    const netPremium = 2000 + 300 * 3.6 - 2800 - nonToken;
    assert.equal(rows[i].children[2].textContent, `Enterpriseが$${Math.abs(netPremium)}${netPremium > 0 ? "高い" : "安い"}`);
  }
  assert.match(document.querySelector("#cost").textContent, /EDR本体がEnterprise席に含まれるとは見なさない/);
});
