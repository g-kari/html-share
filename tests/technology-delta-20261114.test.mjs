import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../reports/technology-updates.source.html', import.meta.url), 'utf8');
const doc = new JSDOM(html).window.document;
const data = JSON.parse(doc.querySelector('#technology-update-data').textContent);
const ids = [
  'claude-code-21325-bash-permission-defaults',
  'codex-01690-project-trust-plan-handoff',
  'unity-hub4-cli1-automation-migration',
  'cloudflare-workers-do-spend-management',
  'cloudflare-tunnel-matrix-path-normalization',
  'aws-agentcore-runtime-v2-default',
  'deepgram-nova3-japanese-20261112',
];
test('November 14 delta keeps records, cards and official sources aligned', () => {
  assert.equal(data.records.length, 115);
  assert.equal(data.changes.length, 20);
  for (const id of ids) {
    const matches = data.records.filter(r => r.id === id);
    assert.equal(matches.length, 1, id);
    const r = matches[0], card = doc.getElementById(id);
    assert.ok(card, id);
    assert.equal(card.dataset.category, r.category);
    assert.equal(card.querySelector('h3').textContent, r.title);
    assert.equal(card.querySelector('.lead').textContent, r.lead);
    assert.deepEqual([...card.querySelectorAll('.facts li')].map(x => x.textContent), r.facts);
    assert.equal(card.querySelector('.test p').textContent, r.test);
    assert.deepEqual([...card.querySelectorAll('.sources a')].map(x => [x.textContent, x.href]), r.sources);
    assert.ok(['2026-11-12','2026-11-13'].includes(r.date));
  }
  const change = data.changes.find(c => c.date === '2026-11-14' && ids.every(id => c.record_ids?.includes(id)));
  assert.ok(change);
  assert.ok(doc.querySelector('#history').textContent.includes(change.summary));
});
test('November 14 compatibility and billing exceptions stay explicit', () => {
  const body = id => data.records.find(r => r.id === id).facts.join('\n');
  assert.match(body(ids[0]), /claude.aiログイン/);
  assert.match(body(ids[0]), /sandbox.autoAllowBashIfSandboxed/);
  assert.match(body(ids[1]), /指定だけでは信頼済みにならない/);
  assert.match(body(ids[2]), /応答するEditorが見つからない/);
  assert.match(body(ids[2]), /7から12/);
  assert.match(body(ids[3]), /限度額の超過は起こりうる/);
  assert.match(body(ids[3]), /保存データ料金.*含まれない/);
  assert.match(body(ids[4]), /2027年2月8日以降の新リリース/);
  assert.match(body(ids[4]), /ルールがない構成は影響を受けない/);
  assert.match(body(ids[5]), /自動的には移行しない/);
  assert.match(body(ids[6]), /単一言語モデル（ja）/);
  assert.match(body(ids[6]), /self-hosted環境は自動更新ではなく/);
});
