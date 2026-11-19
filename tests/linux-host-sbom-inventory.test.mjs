import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../public/linux-host-sbom-inventory.html", import.meta.url), "utf8");
const { document } = new JSDOM(html).window;

test("host SBOM guide has accessible structure, official references and social metadata", () => {
  assert.equal(document.documentElement.lang, "ja");
  assert.equal(document.querySelectorAll("h1").length, 1);
  assert.match(document.title, /LinuxサーバーのソフトウェアをSBOM化/);
  assert.equal(document.querySelector('link[rel="canonical"]')?.href,
    "https://share.0g0.xyz/linux-host-sbom-inventory");
  assert.ok(document.querySelector('meta[name="description"]')?.content.length > 60);
  assert.equal(document.querySelector('meta[property="og:image:width"]')?.content, "1200");
  assert.equal(document.querySelector('meta[property="og:image:height"]')?.content, "630");
  assert.equal(document.querySelector('meta[name="twitter:card"]')?.content, "summary_large_image");
  assert.equal(document.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "/assets/site.css");
  assert.equal(document.querySelector('a.skip')?.getAttribute("href"), "#main");
  assert.equal(document.querySelectorAll('nav.toc a[href^="#"]').length, 5);
  assert.ok(document.querySelectorAll('pre[tabindex="0"] code').length >= 5);
  assert.ok(document.querySelectorAll('details > summary').length >= 2);
  assert.ok(document.querySelectorAll('table').length >= 2);
  assert.ok(document.querySelectorAll('#references a[href^="https://"]').length >= 7);

  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate IDs");
  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    assert.ok(document.getElementById(anchor.getAttribute("href").slice(1)),
      `missing anchor target: ${anchor.getAttribute("href")}`);
  }
  for (const table of document.querySelectorAll("table")) {
    const wrapper = table.closest('.table-wrap[tabindex="0"]');
    assert.ok(wrapper?.getAttribute("aria-label"), "wide table lacks accessible scroll wrapper");
    assert.equal(table.querySelectorAll('thead th[scope="col"]').length, 3);
  }
});

test("guide separates installed packages, running processes and actual exposure", () => {
  assert.match(document.body.textContent, /インストール済み/);
  assert.match(document.body.textContent, /稼働中/);
  assert.match(document.body.textContent, /ネットワークから到達可能/);
  assert.match(document.body.textContent, /Release/);
  assert.match(document.body.textContent, /Amazon Inspector/);
  assert.match(html, /syft dir:\/ -o cyclonedx-json=host-sbom\.cdx\.json/);
  assert.match(html, /trivy rootfs --format cyclonedx/);
  assert.match(html, /trivy sbom --scanners vuln/);
  assert.match(html, /rpm -qa --qf/);
  assert.match(html, /dpkg-query -W/);
  assert.match(html, /ソフトウェア構成が含まれるため、生成したSBOMは原則として非公開/);
});

test("article-specific OGP is a complete 1200 by 630 PNG", async () => {
  const png = await readFile(new URL("../public/assets/linux-host-sbom-ogp-v1.png", import.meta.url));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.equal(png.subarray(-8, -4).toString(), "IEND");
});
