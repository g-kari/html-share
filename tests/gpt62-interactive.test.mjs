import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../public/gpt-6-2-prompting-ja.html',import.meta.url),'utf8');
const load=()=>new JSDOM(html,{runScripts:'dangerously',url:'https://share.0g0.xyz/gpt-6-2-prompting-ja'});
test('all eight instruction combinations faithfully reflect only selected requirements',()=>{
 const dom=load(),d=dom.window.document; const boxes=[...d.querySelectorAll('[data-part]')];
 for(let mask=0;mask<8;mask++){
  boxes.forEach((b,i)=>{b.checked=!!(mask&(1<<i));b.dispatchEvent(new dom.window.Event('change'));});
  const text=d.querySelector('#built-prompt').textContent;
  ['検索フォームだけ','スマートフォン幅','未確認の点'].forEach((s,i)=>assert.equal(text.includes(s),!!(mask&(1<<i))));
  assert.equal(d.querySelectorAll('#prompt-feedback li').length,boxes.filter(b=>b.checked).length);
 }
 dom.window.close();
});
test('presets reset prior selections without changing keyboard focus',()=>{
 const dom=load(),d=dom.window.document;const buttons=[...d.querySelectorAll('[data-preset]')];
 for(const [i,count] of [[2,3],[0,0],[1,2]]){buttons[i].focus();buttons[i].click();assert.equal(d.querySelectorAll('[data-part]:checked').length,count);assert.equal(d.activeElement,buttons[i]);}
 dom.window.close();
});
test('every reasoning setting updates text and labelled route, ultra retains independence/uncertainty',()=>{
 const dom=load(),d=dom.window.document;
 for(const v of ['high','extra','ultra','medium']){const radio=d.querySelector(`[value="${v}"]`);radio.checked=true;radio.dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelector('#reason-view').dataset.mode,v);assert.ok(d.querySelector('#reason-status').textContent);assert.ok(d.querySelectorAll('#reason-route li').length>=2);}
 d.querySelector('[value="ultra"]').click();assert.match(d.querySelector('#reason-detail').textContent,/分担の要否はモデルが判断/);assert.match(d.querySelector('#reason-example').textContent,/必ず並列になるという意味ではありません/);dom.window.close();
});
test('no-JS article keeps readable example, explanatory image and all setting definitions',()=>{
 const dom=new JSDOM(html),d=dom.window.document;
 assert.equal(d.querySelector('#prompt-controls').hidden,true);assert.equal(d.querySelector('#prompt-fallback').hidden,false);
 assert.match(d.querySelector('#prompt-fallback').textContent,/キーボード/);assert.match(d.body.textContent,/Extra High/);assert.equal(d.querySelectorAll('h1').length,1);
 assert.equal(d.querySelector('meta[property="og:image"]').content,'https://share.0g0.xyz/assets/gpt-6-2-prompting-ja-v1.png');dom.window.close();
});
test('native labelled controls, status feedback, reduced motion and local-only behavior',()=>{
 const dom=load(),d=dom.window.document;
 for(const el of d.querySelectorAll('input')) assert.ok(d.querySelector(`label[for="${el.id}"]`));
 assert.equal(d.querySelectorAll('[role="status"]').length,2);assert.match(html,/prefers-reduced-motion:no-preference/);
 const script=d.querySelector('script').textContent;assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon|innerHTML/);assert.match(d.querySelector('#demo-limit').textContent,/実際のAIは呼び出さず/);dom.window.close();
});
