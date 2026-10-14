import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/aws-lambda-web-functions.html',import.meta.url),'utf8');
const script=html.match(/<script id="lambda-graph-model">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'page contains its self-contained shared numerical model');
const context=vm.createContext({});
vm.runInContext(script+'\nthis.api={RATES,DEFAULTS,computeCost,validateCost,modelDomain,crossover,costPoints,capacityModel};',context);
const {DEFAULTS,computeCost,validateCost,modelDomain,crossover,costPoints,capacityModel}=context.api;
const v=extra=>({...DEFAULTS,...extra});
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('published defaults reproduce checked list prices and crossover',()=>{
 const r=computeCost(v());close(r.eventTotal,28.6668);close(r.webTotal,21.5992432);close(r.savings,7.0675568);close(crossover(v()).n,4020477.17350841);
 close(computeCost(v({gatewayPerMillion:1})).eventTotal,38.6668);close(computeCost(v({gatewayPerMillion:3.5})).eventTotal,63.6668);
 assert.equal(validateCost(v()).ok,true);
});
test('all six retained hypothetical scenarios preserve the expected direction',()=>{
 const cases=[[{n:1e5,h:100},false],[{n:1e5,h:10},true],[{n:1e6,h:40},true],[{},true],[{cMs:100},false],[{me:.5},false]];
 for(const [params,webCheaper]of cases){assert.equal(validateCost(v(params)).ok,true);assert.equal(computeCost(v(params)).savings>0,webCheaper);}
 assert.equal(crossover(v({cMs:100})).n,null);
});
test('zeros, idle hours and migration use finite values with no false payback',()=>{
 let r=computeCost(v({n:0,h:0}));close(r.eventTotal,0);close(r.webTotal,0);assert.equal(r.payback,null);assert.equal(validateCost(v({n:0,h:0})).ok,true);assert.equal(costPoints(v({n:0,h:0})).end,0);
 r=computeCost(v({n:0,h:720,migration:500}));close(r.webTotal,4.7520432);assert.equal(r.payback,null);
 close(computeCost(v({migration:500})).payback,500/7.0675568);
 assert.equal(validateCost(v({n:1,h:0,cMs:0})).ok,false);
});
test('nonfinite, blank, negative, noninteger and out-of-range input is rejected',()=>{
 for(const key of Object.keys(DEFAULTS))for(const bad of [NaN,Infinity,-Infinity,undefined,''])assert.equal(validateCost(v({[key]:bad})).ok,false,`${key}: ${bad}`);
 for(const [key,bad]of [['n',-1],['n',1.5],['n',300000001],['me',0],['me',10.01],['teMs',.5],['mw',0],['mw',2.01],['gatewayPerMillion',2],['xMax',0],['freeRequest',1000001],['freeGb',400001],['h',-1],['migration',-1]])assert.equal(validateCost(v({[key]:bad})).ok,false,key);
});
test('CPU capacity and conservative first-tier boundary apply to plots and crossings',()=>{
 const cpu=v({n:100000,cMs:50,h:1});assert.equal(validateCost(cpu).ok,true);close(modelDomain(cpu).cpuMax,144000);assert.equal(validateCost({...cpu,n:144001}).ok,false);assert.equal(costPoints({...cpu,xMax:2e7}).end,144000);
 const outside=v({me:10,teMs:900000,n:1e6,h:1e6});assert.equal(validateCost(outside).ok,false);
 const comparison=v({smallMe:10,teMs:900000,n:0,h:1e6,xMax:1e8});assert.ok(costPoints(comparison).end<=6e9/(10*900));
 const edge=v({cMs:100,h:1,n:1});assert.equal(crossover(edge).n,null);
 for(const p of costPoints(cpu).points){assert.ok(p.n*cpu.cMs/1000<=2*cpu.h*3600+1e-8);assert.ok([p.eventTotal,p.webTotal,p.eventSmall].every(Number.isFinite));}
});
test('remaining monthly Event quotas saturate independently and Gateway remains charged',()=>{
 let r=computeCost(v({n:1e6,freeRequest:1e6,freeGb:400000,gatewayPerMillion:1}));close(r.eventRequest,0);close(r.eventDuration,0);close(r.eventGateway,1);close(r.eventTotal,1);
 r=computeCost(v({n:2e6,freeRequest:1e6,freeGb:400000}));close(r.eventRequest,.2);close(r.eventDuration,0);
 r=computeCost(v({n:3e6,freeRequest:1e6,freeGb:400000}));close(r.eventRequest,.4);close(r.eventDuration,200000*.0000133334);
 assert.ok(r.webTotal>0,'unknown Web free quota is not invented');
});
test('free-quota crossover is a piecewise root, not the no-quota formula',()=>{
 const a=v({freeRequest:1e6,freeGb:400000});const root=crossover(a).n;assert.ok(root>crossover(v()).n);close(computeCost({...a,n:root}).savings,0);assert.ok(computeCost({...a,n:root+1}).savings>0);assert.ok(computeCost({...a,n:root-1}).savings<0);
 const curve=costPoints(a);assert.ok(curve.points.some(p=>p.n===1e6));assert.ok(curve.points.some(p=>p.n===2e6));
});
test('a positive equality at the supported domain endpoint is retained',()=>{
 const a=v({n:100000,cMs:0,freeGb:400000,h:115858.13462301859});
 assert.equal(validateCost(a).ok,true);close(computeCost({...a,n:3e8}).savings,0);assert.equal(crossover(a).n,3e8);assert.equal(crossover(a).domainMax,3e8);
});
test('parallel-demand model distinguishes configuration, assumed capacity and Event RPS limit',()=>{
 let r=capacityModel({rps:1000,wallMs:200,configured:64,effective:32,environments:10});assert.equal(r.ok,true);assert.equal(r.demand,200);assert.equal(r.assumed,320);assert.equal(r.ceiling,640);assert.equal(r.idealWebEnvironments,7);assert.equal(r.idealEventEnvironments,200);
 r=capacityModel({rps:1000,wallMs:10,configured:128,effective:64,environments:10});assert.equal(r.idealEventEnvironments,100);assert.equal(r.idealWebEnvironments,1);
 r=capacityModel({rps:0,wallMs:1,configured:1,effective:1,environments:1});assert.equal(r.demand,0);assert.equal(r.idealWebEnvironments,0);
 for(const extra of [{rps:-1},{rps:NaN},{wallMs:0},{configured:129},{effective:65},{environments:0},{environments:1.5}])assert.equal(capacityModel({rps:1000,wallMs:200,configured:64,effective:32,environments:10,...extra}).ok,false);
});
test('controls, charts and source anchors retain a self-contained accessible contract',()=>{
 for(const id of ['requests','event-memory','event-wall','web-cpu','web-memory','env-hours','migration','curve-max','small-event-memory','free-requests','free-gb','capacity-rps','capacity-wall','capacity-configured','capacity-effective','capacity-environments']){assert.match(html,new RegExp(`for="${id}"`));assert.match(html,new RegExp(`id="${id}"`));}
 for(const id of ['gateway-subtotal','cost-curve-figure','cost-breakdown','breakeven-sensitivity'])assert.match(html,new RegExp(`data-reactive-cost id="${id}"`));
 assert.match(html,/form\.addEventListener\('input',renderCost\)/);assert.match(html,/prefers-reduced-motion:reduce/);assert.match(html,/:focus-visible/);assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/id="source-15"/);assert.match(html,/Goの場合/);
 assert.doesNotMatch(html,/<script[^>]+src=/);assert.doesNotMatch(html,/fetch\(|localStorage|sessionStorage/);
 assert.match(html,/id="animate-graphs"/);assert.match(html,/prefers-reduced-motion: reduce/);assert.match(html,/cancelGraphAnimations/);assert.match(html,/dur:'0.32s'/);
});
