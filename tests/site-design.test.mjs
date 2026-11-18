import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared design system defines tokens, dark scheme and motion/print guards', async () => {
  const css = await readFile('public/assets/site.css', 'utf8');
  for (const token of ['--bg:', '--paper:', '--ink:', '--muted:', '--line:', '--accent:', '--accent-dark:', '--radius:']) {
    assert.ok(css.includes(token), `site.css must define ${token}`);
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print/);
  assert.match(css, /\.sitebar/);
  assert.match(css, /nav\.toc/);
  assert.match(css, /\.hs-progress/);
  assert.match(css, /\.hs-backtop/);
});

test('shared enhancement script is progressive and self-contained', async () => {
  const js = await readFile('public/assets/site.js', 'utf8');
  assert.match(js, /hs-progress/);
  assert.match(js, /hs-backtop/);
  assert.match(js, /hs-anchor/);
  assert.match(js, /IntersectionObserver/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|import\(/);
});

test('migrated article pages link the shared design instead of duplicating CSS', async () => {
  const sam = await readFile('public/sam-altman-stanford-cs153.html', 'utf8');
  assert.match(sam, /<link rel="stylesheet" href="\/assets\/site\.css">/);
  assert.match(sam, /src="\/assets\/site\.js"/);
  assert.match(sam, /--accent:#8c1515/);
  assert.doesNotMatch(sam, /--card:#f6f1ea|background:#faf7f2/);
  assert.match(sam, /og:image" content="https:\/\/share\.0g0\.xyz\/assets\/sam-altman-stanford-cs153-ogp-v1\.png"/);
  assert.match(sam, /class="sitebar"/);

  const pi = await readFile('public/pi-durable.html', 'utf8');
  assert.match(pi, /<link rel="stylesheet" href="\/assets\/site\.css">/);
  assert.match(pi, /src="\/assets\/site\.js"/);
  assert.match(pi, /--accent:#225c80/);
  assert.doesNotMatch(pi, /font:16px\/1\.85/);
  assert.match(pi, /html-share: social metadata/);
  assert.match(pi, /<section id="compare">/);
  assert.match(pi, /class="sitebar"/);
});

test('index template and cache headers adopt the shared design assets', async () => {
  const source = await readFile('scripts/generate-index.mjs', 'utf8');
  assert.match(source, /<link rel="stylesheet" href="\/assets\/site\.css">/);
  assert.match(source, /src="\/assets\/site\.js"/);
  assert.match(source, /hs-rise/);

  const headers = await readFile('public/_headers', 'utf8');
  assert.match(headers, /\/assets\/site\.css\n  Cache-Control: public, max-age=300, must-revalidate/);
  assert.match(headers, /\/assets\/site\.js\n  Cache-Control: public, max-age=300, must-revalidate/);
});
