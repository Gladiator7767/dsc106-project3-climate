/* Independent arithmetic checks for the final comparison, using the supplied
   annual rows rather than calling one Climate method to validate another. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'data', 'climate.json');
const csvPath = path.join(root, 'data', 'climate.csv');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const original = JSON.stringify(data);
const coreSource = fs.readFileSync(path.join(root, 'climate-core.js'), 'utf8');
const sandbox = {window:{}};
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox, {filename:'climate-core.js'});
const C = sandbox.window.Climate;
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
C.init(freezeDeep(data));
let checks = 0, maximumAbsoluteError = 0;
const sumMean = xs => xs.reduce((total,value)=>total+value,0) / xs.length;
function near(actual, expected, label, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: finite values`);
  const error = Math.abs(actual-expected);
  maximumAbsoluteError = Math.max(maximumAbsoluteError,error);
  assert.ok(error<=tolerance, `${label}: ${actual} differs from ${expected}`);
  checks++;
}
function expectError(call,label) {
  assert.throws(call,undefined,label);
  checks++;
}
function rawValue(region,scenario,model,year) {
  const rows = data.rows.filter(r=>r.region===region && r.scenario===scenario && r.model===model && r.year===year);
  assert.equal(rows.length,1);
  return rows[0].anomaly;
}
function rawPeriod(region,scenario,model,start,end) {
  const rows = data.rows.filter(r=>r.region===region && r.scenario===scenario && r.model===model && r.year>=start && r.year<=end);
  assert.equal(rows.length,end-start+1);
  return sumMean(rows.map(r=>r.anomaly));
}
function rawModels(region,start,end,model) {
  return (model==='mean'?data.meta.models:[model]).map(m=>{
    const low=rawPeriod(region,'ssp126',m,start,end), high=rawPeriod(region,'ssp585',m,start,end);
    return {model:m,low,high,gap:high-low};
  });
}
function summary(actual, values, label) {
  near(actual.value,sumMean(values),`${label} mean`);
  near(actual.min,Math.min(...values),`${label} minimum`);
  near(actual.max,Math.max(...values),`${label} maximum`);
}
function checkComparison(region,model,aStart,aEnd,bStart,bEnd) {
  const actual=C.comparePeriods(region,aStart,aEnd,bStart,bEnd,model);
  const a=rawModels(region,aStart,aEnd,model), b=rawModels(region,bStart,bEnd,model);
  const label=`${region}/${model}/${aStart}-${aEnd}/${bStart}-${bEnd}`;
  summary(actual.a,a.map(d=>d.gap),`${label} A`);
  summary(actual.b,b.map(d=>d.gap),`${label} B`);
  const changes=a.map((d,i)=>b[i].gap-d.gap);
  summary(actual.change,changes,`${label} change`);
  for (let i=0;i<a.length;i++) {
    assert.equal(actual.a.models[i].model,a[i].model);
    for (const key of ['low','high','gap']) {
      near(actual.a.models[i][key],a[i][key],`${label} A ${key}`);
      near(actual.b.models[i][key],b[i][key],`${label} B ${key}`);
    }
    near(actual.change.models[i].value,changes[i],`${label} model change`);
  }
  return actual;
}

const examples=[];
for (const region of data.meta.regions.map(r=>r.id)) {
  for (const model of ['mean',...data.meta.models]) {
    const forward=checkComparison(region,model,2021,2040,2081,2100);
    const reverse=checkComparison(region,model,2081,2100,2021,2040);
    near(reverse.change.value,-forward.change.value,'reverse sign');
    near(reverse.change.min,-forward.change.max,'reverse minimum');
    near(reverse.change.max,-forward.change.min,'reverse maximum');
    const same=checkComparison(region,model,2021,2040,2021,2040);
    near(same.change.value,0,'identical periods');
    near(same.change.min,0,'identical periods minimum');
    near(same.change.max,0,'identical periods maximum');
    for (const s of ['ssp126','ssp585']) {
      const expected=(model==='mean'?data.meta.models:[model]).map(m=>rawPeriod(region,s,m,2081,2100));
      summary(C.period(region,s,2081,2100,model),expected,'existing period API');
    }
    if(model==='mean') examples.push({region,reference:[2021,2040],comparison:[2081,2100],...forward});
  }
  checkComparison(region,'mean',2021,2040,2071,2100); // Unequal lengths.
  checkComparison(region,'mean',2030,2050,2040,2060); // Overlapping periods.
  checkComparison(region,'mean',2015,2015,2100,2100); // One-year boundaries.
  checkComparison(region,'mean',2015,2100,2015,2100); // Full series.
}

// Annual difference and ten-year averages, independently reconstructed from rows.
for (const region of ['global','arctic','antarctic']) {
  for (const model of ['mean',...data.meta.models]) {
    for (const smooth of [false,true]) {
      const years = Array.from({length:smooth?77:86},(_,i)=>(smooth?2024:2015)+i);
      const actual=C.gapSeries(region,model,smooth);
      assert.equal(actual.length,years.length);
      for (let i=0;i<years.length;i++) {
        assert.equal(actual[i].year,years[i]);
        const values=(model==='mean'?data.meta.models:[model]).map(m=>{
          const targetYears=smooth?Array.from({length:10},(_,j)=>years[i]-9+j):[years[i]];
          return sumMean(targetYears.map(y=>rawValue(region,'ssp585',m,y)-rawValue(region,'ssp126',m,y)));
        });
        summary(actual[i],values,'paired annual or smoothed gap');
      }
      for(const s of ['ssp126','ssp585']) {
        const oldSeries=C.series(region,s,model,smooth);
        for(const index of [0,oldSeries.length-1]) {
          const year=oldSeries[index].year;
          const expected=(model==='mean'?data.meta.models:[model]).map(m=>rawPeriod(region,s,m,smooth?year-9:year,year));
          summary(oldSeries[index],expected,'existing series API');
        }
      }
    }
  }
}

// Rejected selections cannot silently yield partial-window means or NaN values.
for (const [start,end] of [[2014,2030],[2090,2101],[2040,2030],[2021.5,2040],[NaN,2040]]) {
  expectError(()=>C.period('global','ssp126',start,end),'invalid period');
}
expectError(()=>C.pairedGap('unknown',2021,2040),'unknown region');
expectError(()=>C.pairedGap('global',2021,2040,'unknown'),'unknown model');
expectError(()=>C.series('global','unknown'),'unknown scenario');
const cacheA=C.period('global','ssp126',2021,2040);
assert.strictEqual(cacheA,C.period('global','ssp126',2021,2040));
assert.ok(Object.isFrozen(cacheA) && Object.isFrozen(cacheA.models));
assert.equal(JSON.stringify(data),original,'core must not alter source data');
checks+=3;

// CSV is the same annual data, not an independently rounded/reordered subset.
const csvLines=fs.readFileSync(csvPath,'utf8').trim().split(/\r?\n/);
assert.equal(csvLines.shift(),'model,scenario,region,year,anomaly');
assert.equal(csvLines.length,data.rows.length);
const keyOf=r=>[r.model,r.scenario,r.region,r.year].join('|');
const byKey=new Map(data.rows.map(r=>[keyOf(r),r.anomaly]));
assert.equal(byKey.size,data.rows.length,'no duplicated dataset keys');
const csvKeys=new Set();
for(const line of csvLines) {
  const [model,scenario,region,year,anomaly]=line.split(',');
  const key=[model,scenario,region,+year].join('|');
  assert.ok(byKey.has(key) && !csvKeys.has(key));
  near(+anomaly,byKey.get(key),'CSV/JSON annual anomaly',0);
  csvKeys.add(key);
}

// A crossover fixture catches the tempting but incorrect unpaired extreme range.
const fixture={meta:{models:['A','B']},rows:[]};
for(const [model,year,low,high] of [['A',2015,10,11],['B',2015,20,22],['A',2016,10,13],['B',2016,20,21]]) {
  fixture.rows.push({region:'test',scenario:'ssp126',model,year,anomaly:low});
  fixture.rows.push({region:'test',scenario:'ssp585',model,year,anomaly:high});
}
C.init(fixture);
summary(C.pairedGap('test',2015,2015),[1,2],'paired crossover gap');
summary(C.comparePeriods('test',2015,2015,2016,2016).change,[2,-1],'paired change range');
assert.equal(C.periodCache.size,4,'init resets the cache');
checks++;
const missing=JSON.parse(original);
missing.rows=missing.rows.filter(r=>!(r.region==='global' && r.model===data.meta.models[0] && r.scenario==='ssp126' && r.year===2025));
C.init(missing);
expectError(()=>C.period('global','ssp126',2021,2040),'missing year');
expectError(()=>C.modelSeries('global','ssp126',data.meta.models[0],true),'smoothing across a missing year');
C.init(data);

const result={
  checkedAt:new Date().toISOString(),status:'passed',checks,maximumAbsoluteError,
  scope:'Independent arithmetic from supplied annual JSON/CSV; not a new audit of original NetCDF extraction or browser rendering.',
  sourceRows:data.rows.length,models:data.meta.models,regions:data.meta.regions.length,
  inputHashes:{json:crypto.createHash('sha256').update(fs.readFileSync(jsonPath)).digest('hex'),csv:crypto.createHash('sha256').update(fs.readFileSync(csvPath)).digest('hex')},
  covered:['paired scenario differences','matched-model change between periods','identical/reversed/unequal/overlapping/one-year/full periods','annual and trailing averages','existing period and series compatibility','invalid and missing data guards','cache reset and immutable source rows','CSV and JSON identity','unpaired-extreme crossover fixture'],
  examples
};
const output=path.join(root,'output','final-calculations-validation.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks,maximumAbsoluteError,output,examples:examples.filter(d=>['global','arctic'].includes(d.region)).map(d=>({region:d.region,a:d.a.value,b:d.b.value,change:d.change.value}))},null,2));
