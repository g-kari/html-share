import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/php-security-os-response.html', import.meta.url), 'utf8');
test('AL2023 advisory evidence distinguishes announced packages from deployment', () => {
  const card = html.match(/<article class="card" id="amazon">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(card);
  for (const version of ['8.2.35-1.amzn2023.0.1', '8.3.36-1.amzn2023.0.1']) assert.ok(card.includes(version));
  for (const marker of ['aarch64', 'x86_64', 'src', '2023.12.20261021', '2026-10-22', '未検証', 'No Fix Planned']) assert.ok(card.includes(marker));
  assert.match(card, /8\.4 \/ 8\.5.*未照合/);
  assert.match(card, /AL2とAL2023.*混ぜません/);
});

test('new floating-image evidence is pinned and retains old observations', () => {
  assert.ok(html.includes('377332f63ae28a15c7272488b7e0d3bb9a37376e'));
  for (const version of ['8.5.12', '8.4.27', '8.3.36', '8.2.35']) assert.ok(html.includes(version));
  assert.ok(html.includes('riscv64'));
  assert.ok(html.includes('PHP_VERSION'));
  assert.ok(html.includes('PHP_URL'));
  assert.ok(html.includes('履歴'));
  const ids = [...html.matchAll(/\bid="([^"\s]+)"/g)].map(x => x[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('aws-table-display-drift'));
  assert.ok(html.includes('href="#aws-table-display-drift"'));
});
