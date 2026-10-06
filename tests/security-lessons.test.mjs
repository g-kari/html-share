import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const html = await readFile(new URL('../public/security-lessons.html', import.meta.url),'utf8');
const incidents = await readFile(new URL('../public/security-incidents.html', import.meta.url),'utf8');
const register = JSON.parse(incidents.match(/<script id="incident-register" type="application\/json">([\s\S]*?)<\/script>/)[1]);

test('evaluation is self-contained, accessible in source, and clearly separates persona and evidence',()=>{
 assert.match(html,/^<!doctype html>/i);
 assert.match(html,/<html lang="ja">/);
 assert.match(html,/<meta charset="utf-8">/);
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/<meta name="description"/);
 assert.equal([...html.matchAll(/<h1[ >]/g)].length,1);
 assert.equal([...html.matchAll(/<article class="case"/g)].length,4);
 assert.equal([...html.matchAll(/<section class="lens"/g)].length,6);
 assert.equal([...html.matchAll(/<input type="checkbox">/g)].length,9);
 assert.equal([...html.matchAll(/<label><input type="checkbox">/g)].length,9);
 assert.ok(!/<script[ >]|<iframe[ >]|<form[ >]|@import|<link[^>]+stylesheet/i.test(html));
 for(const term of ['愚か、愚か。','このページだけの','未確認・評価の限界','本ページの分析','過去の発生事案','単位・範囲が異なり','保存・送信されない','企業の格付けはしない','prefers-reduced-motion',':focus-visible','本文へ移動']) assert.ok(html.includes(term),term);
});

test('all local and incident anchors exist and IDs are unique',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 const local=[...html.matchAll(/href="#([^"]+)"/g)].map(x=>x[1]);
 assert.ok(local.every(id=>ids.includes(id)));
 const crosslinks=[...html.matchAll(/href="\/security-incidents#([^"]+)"/g)].map(x=>x[1]);
 assert.equal(crosslinks.length,4);
 assert.ok(crosslinks.every(id=>register.incidents.some(item=>item.id===id)));
});

test('verified source URLs, dates and impact units remain present',()=>{
 for(const url of ['https://voising-official.com/news/1015','https://voising-official.com/news/931','https://www.secoma.co.jp/images/top/202610051430.pdf','https://www.ntt-west.co.jp/news/2402/pdf/240229a_2.pdf','https://www.ntt-west.co.jp/corporate/security/','https://www.holdings.toppan.com/ja/info/toppan_info20260929.pdf']) assert.ok(html.includes(url));
 for(const term of ['574,647人分','177,426名','928万件','約17万件','2026-10-06','第一報：発生経緯の報告','2026-08-18','初報はアプリサーバー経由','ZIP内部の内容を再確認せず']) assert.ok(html.includes(term),term);
 assert.ok(!html.includes('ムラウチ'),'unreverified case is not included');
});
