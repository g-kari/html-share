import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../public/php-emergency-maintenance.html", import.meta.url), "utf8");
const data = JSON.parse(readFileSync(new URL("../public/data/emergency-maintenance-20261021.json", import.meta.url), "utf8"));
const script = html.match(/<script id="maintenance-view-script">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "the view controller remains present when notice content changes");
const start = html.indexOf('<section class="section" id="confirmed">');
const end = html.indexOf('<section class="section pending-section" id="pending">', start);
assert.ok(start >= 0 && end > start);
const section = html.slice(start, end);
const key = "html-share-maintenance-view-v1";
const extra = '<details id="pending-details"><summary>照合待ち</summary><p id="pending-count"></p><li class="candidate">候補テスト</li></details><details id="reviewed-details"><summary>関連</summary><p id="reviewed-count"></p><li class="reviewed-source">関連テスト</li></details>';

function make({ saved, blocked = false, url = "https://share.0g0.xyz/php-emergency-maintenance", sample = false, boot = true } = {}) {
  let input = section;
  if (sample) {
    const articles = [...section.matchAll(/<article class="service"[\s\S]*?<\/article>/g)].map(m => m[0]);
    input = section.slice(0, section.indexOf('<div class="grid" id="services">')) + '<div class="grid" id="services">' + articles.slice(0, 3).join("\n") + "</div></section>";
  }
  const dom = new JSDOM("<!doctype html><html lang=ja><body>" + input + extra + "</body></html>", { url, runScripts: "outside-only" });
  const { window } = dom;
  if (blocked) Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new window.DOMException("Blocked", "SecurityError"); } });
  else if (saved !== undefined) window.localStorage.setItem(key, saved);
  if (boot) window.eval(script);
  return dom;
}
const click = (w, id) => w.document.getElementById(id).click();
const cards = d => [...d.querySelectorAll("#services > .service")];
const visible = d => cards(d).filter(x => !x.hidden).map(x => x.id);
const change = (w, id, value) => {
  const node = w.document.getElementById(id);
  if (node.type === "checkbox") node.checked = value; else node.value = value;
  node.dispatchEvent(new w.Event("input", { bubbles: true }));
};

test("same real notice articles, facts and official links work in card/list modes", () => {
  const dom = make();
  try {
    const w = dom.window, d = w.document, all = cards(d);
    assert.equal(all.length, data.confirmed.length);
    assert.deepEqual(all.map(x => x.id), data.confirmed.map(x => x.id));
    assert.equal(new Set([...d.querySelectorAll("[id]")].map(x => x.id)).size, d.querySelectorAll("[id]").length);
    data.confirmed.forEach((record, i) => {
      const article = all[i];
      assert.equal(article.dataset.category, record.cat);
      assert.equal(article.dataset.restored, String(record.restored === true));
      assert.equal(article.querySelector(".site-heading > span:last-child").textContent, record.name);
      assert.equal(article.querySelector(".service-details .detail").textContent, record.safe);
      assert.equal(article.querySelector(".service-details footer > a").getAttribute("href"), record.url);
      const toggle = article.querySelector(".service-detail-toggle"), panel = article.querySelector(".service-details");
      assert.equal(toggle.type, "button");
      assert.equal(toggle.getAttribute("aria-controls"), panel.id);
      assert.equal(toggle.getAttribute("aria-label"), record.name + "の詳細を閉じる");
      assert.equal(toggle.hidden, true);
      assert.equal(panel.hidden, false);
    });
    assert.equal(d.getElementById("controls").hidden, false);
    assert.equal(d.getElementById("view-toolbar").hidden, false);
    assert.equal(d.getElementById("view-cards").getAttribute("aria-pressed"), "true");
    const total = d.getElementById("count").textContent;
    click(w, "view-list");
    assert.equal(d.getElementById("services").dataset.view, "list");
    assert.equal(d.getElementById("view-list").getAttribute("aria-pressed"), "true");
    assert.equal(d.getElementById("view-cards").getAttribute("aria-pressed"), "false");
    assert.equal(w.localStorage.getItem(key), "list");
    assert.ok(all.every(x => x.querySelector(".service-details").hidden));
    const entry = all[0], button = entry.querySelector(".service-detail-toggle"), panel = entry.querySelector(".service-details");
    button.click();
    assert.equal(panel.hidden, false);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.ok(panel.querySelector("a[href]"), "official links are reachable in expanded detail");
    assert.ok(all.slice(1).every(x => x.querySelector(".service-details").hidden));
    button.click();
    assert.equal(panel.hidden, true);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    click(w, "view-cards");
    assert.ok(all.every(x => !x.querySelector(".service-details").hidden));
    assert.equal(d.getElementById("count").textContent, total);

    // Every existing filter combination keeps the same matching IDs across views.
    const cats = [...d.getElementById("category").options].map(x => x.value);
    const reasons = [...d.getElementById("reason").options].map(x => x.value);
    for (const cat of cats) for (const reason of reasons) for (const restored of [false, true]) {
      change(w, "category", cat); change(w, "reason", reason); change(w, "restored", restored);
      const expected = all.filter(x => (cat === "all" || x.dataset.category === cat) && (reason === "all" || x.dataset.reason === reason) && (!restored || x.dataset.restored === "true")).map(x => x.id);
      const count = d.getElementById("count").textContent;
      assert.deepEqual(visible(d), expected);
      click(w, "view-list"); assert.deepEqual(visible(d), expected);
      click(w, "view-cards"); assert.deepEqual(visible(d), expected);
      assert.equal(d.getElementById("count").textContent, count);
    }
    change(w, "category", "all"); change(w, "reason", "all"); change(w, "restored", false);
    for (const term of ["ラストクラウディア", "BANDAI", "候補テスト", "__nothing_matches_983756__"]) {
      change(w, "query", term);
      const ids = visible(d), count = d.getElementById("count").textContent;
      click(w, "view-list"); assert.deepEqual(visible(d), ids);
      if (ids.length) d.getElementById(ids[0]).querySelector(".service-detail-toggle").click();
      change(w, "query", term); assert.deepEqual(visible(d), ids);
      click(w, "view-cards"); assert.deepEqual(visible(d), ids);
      assert.equal(d.getElementById("count").textContent, count);
    }
    assert.equal(visible(d).length, 0);
    change(w, "query", "");
    assert.equal(visible(d).length, data.confirmed.length);

    // Focus must not be stranded when card contents are collapsed into a list.
    const link = entry.querySelector("footer a");
    link.focus(); assert.equal(d.activeElement, link);
    click(w, "view-list");
    assert.equal(d.activeElement, button);
    assert.equal(button.hidden, false);
    click(w, "view-cards");
    assert.equal(d.activeElement, d.getElementById("view-cards"));
    click(w, "view-list");
    const numeric = all.find(x => /^[0-9]/.test(x.id));
    if (numeric) {
      w.location.hash = numeric.id;
      w.dispatchEvent(new w.HashChangeEvent("hashchange"));
      assert.equal(numeric.querySelector(".service-details").hidden, false);
    }
    w.location.hash = "%E0%A4%A";
    assert.doesNotThrow(() => w.dispatchEvent(new w.HashChangeEvent("hashchange")));
    assert.equal(all.length, data.confirmed.length, "no duplicate list copy was inserted");
  } finally { dom.window.close(); }
});

test("saved, invalid and blocked display preferences do not break controls or filters", () => {
  for (const config of [{ saved: "list" }, { saved: "unknown-value" }, { blocked: true }]) {
    const dom = make({ ...config, sample: true });
    try {
      const w = dom.window, d = w.document;
      assert.equal(d.getElementById("services").dataset.view, config.saved === "list" ? "list" : "cards");
      assert.equal(d.getElementById("controls").hidden, false);
      click(w, "view-list"); click(w, "view-cards");
      change(w, "query", "__nothing_matches_983756__");
      assert.equal(visible(d).length, 0);
      change(w, "query", ""); assert.equal(visible(d).length, 3);
    } finally { dom.window.close(); }
  }
});

test("without JS all facts are visible; print and responsive safeguards remain", () => {
  const dom = make({ sample: true, boot: false });
  try {
    const d = dom.window.document;
    assert.equal(d.getElementById("controls").hidden, true);
    assert.equal(d.getElementById("view-toolbar").hidden, true);
    assert.ok(cards(d).every(x => !x.querySelector(".service-details").hidden));
    assert.ok(cards(d).every(x => x.querySelector(".service-detail-toggle").hidden));
    assert.match(html, /@media print\{\.view-toolbar,\.service-detail-toggle/);
    assert.match(html, /\.service-details\[hidden\]\{display:flex!important\}/);
    assert.match(html, /#services\[data-view="list"\]>\.service\{grid-template-columns:minmax\(0,1fr\) auto/);
    assert.match(html, /min-height:44px/);
    assert.match(html, /button:focus-visible/);
    assert.ok(!html.includes('role="table"'), "CSS grid does not pretend to be an incomplete ARIA table");
  } finally { dom.window.close(); }
});
