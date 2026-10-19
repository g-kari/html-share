import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('actual bundled accordion preserves open state, focus, keyboard and independent search', async () => {
 const dom=new JSDOM('<input id="search-query" value="Cloudflare"><div id="fallback"><details data-guide-section="one" open><summary>レポート</summary><p>説明</p><a href="/technology-updates">技術</a></details><details data-guide-section="two"><summary>RSS</summary><p>購読</p><a href="/feed.xml">RSS</a></details></div><div id="host" hidden></div>',{url:'https://share.0g0.xyz/',pretendToBeVisual:true});
 const w=dom.window;
 for (const key of ['window','document','HTMLElement','Element','Node','MutationObserver','getComputedStyle']) globalThis[key]= key==='window'?w:typeof w[key]==='function'&&key==='getComputedStyle'?w[key].bind(w):w[key];
 globalThis.requestAnimationFrame=w.requestAnimationFrame.bind(w);globalThis.cancelAnimationFrame=w.cancelAnimationFrame.bind(w);
 w.matchMedia=()=>({matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
 const {mountGuide}=await import('../public/assets/site-guide-v1.js');
 const fallback=w.document.getElementById('fallback'),host=w.document.getElementById('host');fallback.querySelector('summary').focus();
 fallback.querySelector('a').focus(); mountGuide(fallback,host); assert.equal(fallback.hidden,false); assert.equal(host.childElementCount,0);
 fallback.querySelector('summary').focus(); mountGuide(fallback,host);
 const triggers=host.querySelectorAll('button');assert.equal(triggers.length,2);assert.equal(fallback.hidden,true);assert.equal(host.hidden,false);assert.equal(w.document.activeElement,triggers[0]);assert.equal(triggers[0].getAttribute('aria-expanded'),'true');assert.equal(w.document.getElementById('search-query').value,'Cloudflare');
 triggers[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(w.document.activeElement,triggers[1]);
 triggers[1].click();await new Promise(r=>setTimeout(r,30));assert.equal(triggers[1].getAttribute('aria-expanded'),'true');
 triggers[1].click();await new Promise(r=>setTimeout(r,30));assert.equal(triggers[1].getAttribute('aria-expanded'),'false');
 assert.equal(host.querySelectorAll('button').length,2);mountGuide(fallback,host);assert.equal(host.querySelectorAll('button').length,2);
 dom.window.close();
});

test('mount failures and later React errors restore the native guide', async () => {
 const {build}=await import('esbuild');
 const result=await build({entryPoints:['ui/site-guide.jsx'],bundle:true,format:'esm',write:false,jsx:'automatic',plugins:[{name:'controlled-root',setup(b){b.onResolve({filter:/^react-dom\/client$/},()=>({path:'controlled-root',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export function createRoot(host,options){globalThis.reportGuideError=options.onUncaughtError;return {render(){if(globalThis.failGuideMount)throw Error('render failed');host.innerHTML='<button class="guide-trigger">One</button><button class="guide-trigger">Two</button>';},unmount(){host.replaceChildren();}};}` }));}}]});
 const {mountGuide}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const dom=new JSDOM('<div id="fallback"><details data-guide-section="one"><summary>One</summary><p>Text</p></details><details data-guide-section="two"><summary>Two</summary><p>Text</p></details></div><div id="host" hidden></div>',{url:'https://share.0g0.xyz/'});
 globalThis.document=dom.window.document;
 const fallback=document.getElementById('fallback'),host=document.getElementById('host');
 globalThis.failGuideMount=true;assert.throws(()=>mountGuide(fallback,host),/render failed/);assert.equal(fallback.hidden,false);assert.equal(host.hidden,true);assert.equal(fallback.dataset.enhanced,undefined);
 globalThis.failGuideMount=false;mountGuide(fallback,host);host.querySelectorAll('button')[1].focus();host.replaceChildren(); globalThis.reportGuideError(Error('later effect failed'));
 assert.equal(fallback.hidden,false);assert.equal(host.hidden,true);assert.equal(fallback.dataset.enhanced,undefined);assert.equal(document.activeElement,fallback.querySelectorAll('summary')[1]);
 mountGuide(fallback,host); assert.equal(fallback.hidden,true); assert.equal(host.querySelectorAll('button').length,2);
 delete globalThis.failGuideMount;delete globalThis.reportGuideError;dom.window.close();
});
