import test from 'node:test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000';
async function post(path, body) { const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}; }
test('API grouping, matching, exclusions, ranking and input validation', async () => {
const ad={id:'1',advertiser:'Example',copy:'Buy ebook USD 19 at example.org',date:'1 ene 2026'};
const grouped=await post('/api/group',{ads:[ad,{...ad,id:'2'},ad]});
assert.equal(grouped.status,200); assert.equal(grouped.data.totalAdsReceived,2); assert.equal(grouped.data.groups[0].adsCount,2);
const groups=grouped.data.groups;
let r=await post('/api/rank',{groups}); assert.equal(r.data.ranking[0].status,'candidato_por_anuncio');
const pages=[{url:'https://example.org/shop',finalUrl:'https://example.org/shop',status:'candidato_digital_pago',httpStatus:200,hasDigitalSignal:true,hasPurchaseSignal:true,pricesFound:['USD 19'],hasDeliverySignal:true}];
const matched=await post('/api/match-pages',{ads:[ad],pages}); assert.equal(matched.data.matches[0].matchStatus,'coincidencia_por_dominio');
r=await post('/api/rank',{groups,pages,matches:matched.data.matches}); assert.equal(r.data.ranking[0].status,'candidato_digital_pago');
r=await post('/api/rank',{groups,pages:[{...pages[0],status:'posible_digital_gratuito',hasFreeDigitalSignal:true}],matches:matched.data.matches}); assert.equal(r.data.ranking[0].status,'posible_digital_gratuito'); assert.equal(r.data.ranking[0].score,0); assert.equal(Object.values(r.data.ranking[0].scoreBreakdown).reduce((a,b)=>a+b,0),0);
r=await post('/api/rank',{groups,pages:[{...pages[0],httpStatus:403}],matches:matched.data.matches}); assert.equal(r.data.ranking[0].status,'candidato_por_anuncio');
r=await post('/api/rank',{groups:[{...groups[0],ads:[{id:'unrelated'}]}],pages,matches:matched.data.matches}); assert.equal(r.data.ranking[0].status,'candidato_por_anuncio');
r=await post('/api/match-pages',{ads:[{...ad,copy:'example.org.evil.test',advertiser:'Example'}],pages}); assert.equal(r.data.matches[0].matchStatus,'sin_asociacion_verificada');
r=await post('/api/search',{keyword:'ebook',country:'ZZ'}); assert.equal(r.status,400);
r=await post('/api/discover',{country:'AR',language:'invalid'}); assert.equal(r.status,400);
r=await post('/api/search',{keyword:''}); assert.equal(r.status,400);
console.log('PASS: live API grouping, deduplication, baseline/landing ranking, exclusions, inaccessible pages, group provenance, domain boundaries, option validation');

});
