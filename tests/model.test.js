import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestedRadius,effectiveRadius,validateReport,filterReports,localDateTime} from '../js/model.js';
import {loadReports,saveReports,STORAGE_KEY} from '../js/storage.js';
import {createPlaceSearch,createReverseGeocode} from '../js/api.js';
const now = new Date('2026-09-19T12:00:00Z').getTime();
const report = {id:'one',title:'Missing Luna',description:'Ginger cat with green collar',contact:'owner@example.com',location:'Damascus',status:'lost',animal:'cat',lastSeen:'2026-09-18T12:00:00Z',coordinates:{lat:33.51,lng:36.29},radius:500,radiusMode:'auto'};
test('illustrative radius defaults, elapsed time and automatic cap', () => {
  assert.equal(suggestedRadius('cat',new Date(now),now),250);
  assert.equal(suggestedRadius('dog',report.lastSeen,now),1000);
  assert.equal(suggestedRadius('other',report.lastSeen,now),500);
  assert.equal(suggestedRadius('dog','2000-01-01',now),5000);
});
test('reject invalid and future dates; valid report passes', () => {
  assert.equal(suggestedRadius('cat','bad',now),null);
  assert.equal(suggestedRadius('cat',new Date(now+1),now),null);
  assert.deepEqual(validateReport(report,now),[]);
  for (const lastSeen of ['','not a date','2099-01-01']) assert.ok(validateReport({...report,lastSeen},now).length);
  assert.ok(validateReport({...report,coordinates:null},now).length);
  assert.ok(validateReport({...report,radius:10001},now).length);
});
test('manual mode survives time changes; found has no circle', () => {
  assert.equal(effectiveRadius({...report,radiusMode:'manual',radius:10000},now+86400000),10000);
  assert.equal(effectiveRadius({...report,status:'found'},now),null);
  assert.equal(effectiveRadius(report,now),500);
  assert.ok(effectiveRadius(report,now+86400000)>500);
});
test('all four filters combine without changing original array', () => {
  const list = [report,{...report,id:'two',status:'found'},{...report,id:'three',location:'Aleppo'}];
  assert.deepEqual(filterReports(list,{text:' GREEN ',status:'lost',animal:'cat',location:'dam'}).map(r=>r.id),['one']);
  assert.equal(filterReports(list,{animal:'dog'}).length,0);
  assert.equal(list.length,3);
});
function memoryStorage() { const map=new Map(); return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}; }
test('JSON persistence roundtrip and corrupt storage preservation', () => {
  const storage=memoryStorage();
  assert.equal(saveReports(storage,[report]),true);
  assert.deepEqual(loadReports(storage).reports,[report]);
  storage.setItem(STORAGE_KEY,'broken');
  assert.equal(loadReports(storage).readOnly,true);
  assert.equal(storage.getItem(STORAGE_KEY),'broken');
  assert.equal(saveReports({setItem(){throw Error('quota');}},[report]),false);
  assert.equal(loadReports(null).readOnly,true);
});
test('datetime-local helper roundtrips local date', () => { assert.equal(new Date(localDateTime(new Date(now))).getTime(),now); });
test('API Syria restriction, response conversion and cache', async () => {
  let calls=0;
  const search=createPlaceSearch({geocodingUrl:'https://example.com/search'},{now:()=>now,fetcher:async url=>{
    calls++; assert.equal(url.searchParams.get('countrycodes'),'sy'); assert.equal(url.searchParams.get('q'),'Damascus');
    return {ok:true,json:async()=>[{display_name:'Damascus, Syria',lat:'33.51',lon:'36.29'}]};
  }});
  assert.deepEqual(await search('Damascus'),[{label:'Damascus, Syria',lat:33.51,lng:36.29}]);
  await search('damascus'); assert.equal(calls,1);
  await assert.rejects(search('Aleppo'),/wait/);
});
test('API rejects HTTP, malformed and network failures', async () => {
  for (const response of [{ok:false,status:429},{ok:true,json:async()=>({error:true})}]) {
    const search=createPlaceSearch({geocodingUrl:'https://example.com/search'},{fetcher:async()=>response});
    await assert.rejects(search('Damascus'));
  }
  const search=createPlaceSearch({geocodingUrl:'https://example.com/search'},{fetcher:async()=>{throw Error('Network unavailable');}});
  await assert.rejects(search('Damascus'),/Network/);
});
test('reverse geocoding turns a selected coordinate into a city label', async () => {
  const reverse=createReverseGeocode({geocodingUrl:'https://example.com/search'},{now:()=>now,fetcher:async url=>{
    assert.equal(url.pathname,'/reverse');
    assert.equal(url.searchParams.get('lat'),'33.51');
    assert.equal(url.searchParams.get('lon'),'36.29');
    return {ok:true,json:async()=>({address:{neighbourhood:'Al-Malki',city:'Damascus'}})};
  }});
  assert.equal(await reverse({lat:33.51,lng:36.29}),'Al-Malki, Damascus');
});
