import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { buildSiteGuide } from '../scripts/build-site-guide.mjs';
import { installGuide } from '../public/assets/site-guide-loader.js';

test('committed Animate UI bundle is reproducible and bounded', async () => {
 const expected = await buildSiteGuide({write:false});
 assert.equal(await readFile('public/assets/site-guide-v1.js','utf8'), expected);
 assert.ok(gzipSync(expected).length < 140000);
 assert.match(expected,/Animate UI 2\.0\.0/);
 assert.match(await readFile('public/assets/site-guide-LICENSE.txt','utf8'),/Commons Clause Restriction/);
});
test('loader is lazy, deduplicates pending imports and retries failure', async () => {
 let trigger, calls=0, resolve, mounted=0;
 const fallback={dataset:{},addEventListener(type,fn,capture){ assert.equal(type,'toggle');assert.equal(capture,true);trigger=fn;}};
 installGuide(fallback, {}, ()=> { calls++;return new Promise(r=>resolve=r); });
 assert.equal(calls,0);const first=trigger(); await trigger();assert.equal(calls,1);
 resolve({mountGuide(){mounted++;fallback.dataset.enhanced='true';}});await first;await trigger();assert.equal(calls,1);assert.equal(mounted,1);
 let failures=0;installGuide({...fallback,dataset:{}},{},async()=>{failures++;throw Error('network');});await trigger();await trigger();assert.equal(failures,2);
});
test('static generation retains search and progressive fallback without report mutation',async()=>{
 const source=await readFile('scripts/generate-index.mjs','utf8');
 assert.match(source,/id="site-guide-fallback"/);assert.match(source,/<details class="guide-item"/);
 assert.match(source,/id="site-search"/);assert.match(source,/src="\/assets\/site-search.js"/);
 assert.match(source,/src="\/assets\/site-guide-loader.js"/);
 assert.doesNotMatch(source,/site-guide-v1.js/);
 const ui=await readFile('ui/site-guide.jsx','utf8');
 assert.match(ui,/@animate-ui\/react\/primitives\/radix-ui\/accordion/);
 assert.match(ui,/reducedMotion="user"/);
 assert.match(ui,/focused.tagName !== 'SUMMARY'/);
});
