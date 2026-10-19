import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../public/aws-guardduty-2026.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('../ui/guardduty/app.jsx', import.meta.url), 'utf8');

test('GuardDuty report preserves six updates, source links, and static fallback', () => {
  assert.equal((html.match(/class="update"/g) || []).length, 6);
  assert.match(html, /id="flow-fallback"/);
  assert.match(html, /id="guardduty-motion-root"/);
  assert.match(html, /#updates/);
  assert.match(html, /id="search"/);
  assert.match(html, /guardduty-animate\.js/);
  assert.match(html, /docs\.aws\.amazon\.com/);
});
test('Interactive island uses actual Animate UI primitives and reduced motion', () => {
  assert.match(ui, /from '@animate-ui\/react\/primitives\/tabs'/);
  assert.match(ui, /from '@animate-ui\/react\/provider'/);
  assert.match(ui, /reducedMotion="user"/);
  assert.match(ui, /useReducedMotion/);
  assert.match(ui, /getElementById\('flow-fallback'\)/);
});

test('GuardDuty runtime waits until the diagram approaches the viewport', () => {
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /rootMargin: '320px'/);
  assert.match(html, /import\('\/assets\/guardduty-animate\.js'\)/);
});
