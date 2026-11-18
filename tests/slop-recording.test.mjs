import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../public/all-code-is-slop.html',import.meta.url),'utf8');
test('recording is opt-in, official, titled, and not autoplaying',()=>{const d=new JSDOM(source,{runScripts:'dangerously'}).window.document;assert.equal(d.querySelector('iframe'),null);const b=d.getElementById('load-video');assert.equal(b.hidden,false);b.click();const f=d.querySelector('iframe');assert.equal(f.src,'https://www.youtube-nocookie.com/embed/O_zcc6Xl12g');assert.ok(f.title);assert.equal(b.hidden,true);assert.equal(d.querySelectorAll('iframe').length,1);});
test('slides are in-article anchors with a source and no-JS fallback',()=>{const d=new JSDOM(source).window.document;assert.equal(d.getElementById('load-video').hidden,true);for(const a of d.querySelectorAll('.slide-nav a'))assert.ok(d.querySelector(a.getAttribute('href'))?.querySelector('img'));assert.ok(d.querySelector('a[href="https://www.youtube.com/watch?v=O_zcc6Xl12g"]'));});
test('correct source attribution and generated image metadata',()=>{assert.match(source,/SpaceXSI/);assert.doesNotMatch(source,/SpaceXAI|コストは上の層ほど高い/);assert.match(source,/Cindy Sridharan/);assert.match(source,/不具合率とは異なる/);const d=new JSDOM(source).window.document;assert.equal(d.querySelector('meta[property="og:image"]').content,d.querySelector('meta[name="twitter:image"]').content);});
