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


test('Game briefing uses official-style AWS SVGs, clearly labels simulation, and keeps reduced motion', async () => {
  const names=['guardduty','rds','lambda','cloudtrail','eventbridge','cloudwatch','securityhub','bedrock','sagemaker','iam'];
  for(const name of names){
    const svg=await readFile(new URL('../public/assets/aws-icons/'+name+'.svg',import.meta.url),'utf8');
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b|onload\s*=|<foreignObject\b/i);
    assert.match(ui,new RegExp(name + ": '/assets/aws-icons/" + name + "\\.svg'"));
  }
  assert.match(html, /class="gd-hero-status"/);
  assert.match(html, /gd-release-heading/);
  assert.match(html, /gd-fallback-nodes/);
  assert.match(html, /AWS公式アイコン・利用案内/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(ui, /SIMULATION \/ NOT LIVE/);
  assert.match(ui, /デモ画面（実測値ではありません）/);
  assert.match(ui, /gd-defense-core/);
  assert.match(ui, /gd-mission-step/);
  assert.match(ui, /aria-pressed=\{fx\}/);
  assert.match(ui, /setReplay\(x=>x\+1\)/);
});
test('Original report content and lazy loading survive command HUD', () => {
  assert.equal((html.match(/class="update"/g)||[]).length,6);
  assert.match(html, /id="search"/);
  assert.match(html, /id="flow-fallback"/);
  assert.match(html, /guardduty-animate\.js/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /rootMargin: '320px'/);
  assert.match(html, /aws\.amazon\.com\/guardduty\/pricing/);
});
