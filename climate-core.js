/* Shared calculations for the interactive view and the six exploratory charts. */
'use strict';
window.Climate = {
  colors: {ssp126: '#186a90', ssp585: '#b74720'},
  names: {ssp126: 'SSP1-2.6', ssp585: 'SSP5-8.5'},
  scenarios: ['ssp126', 'ssp585'],
  mean: values => values.reduce((a, b) => a + b, 0) / values.length,
  format: value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}°C`,
  init(data) {
    if (!data?.meta?.models?.length || !Array.isArray(data.rows)) {
      throw new Error('The climate dataset is missing its model list or rows.');
    }
    this.data = data;
    this.index = new Map();
    this.periodCache = new Map();
    data.rows.forEach(row => {
      if (!Number.isInteger(row.year) || !Number.isFinite(row.anomaly)) {
        throw new Error('Climate rows must have an integer year and a finite anomaly.');
      }
      const key = [row.region, row.scenario, row.model].join('|');
      if (!this.index.has(key)) this.index.set(key, []);
      this.index.get(key).push(row);
    });
    this.index.forEach(rows => {
      // Sort the new index arrays, never the source dataset's rows.
      rows.sort((a,b) => a.year-b.year);
      if (rows.some((row,i) => i && row.year === rows[i-1].year)) {
        throw new Error('Duplicate year in a model/region/scenario series.');
      }
    });
    return this;
  },
  selectedModels(model = 'mean') {
    if (!this.data) throw new Error('Load the climate dataset before calculating results.');
    if (model === 'mean') return this.data.meta.models;
    if (!this.data.meta.models.includes(model)) throw new Error(`Unknown climate model: ${model}`);
    return [model];
  },
  rowsFor(region, scenario, model) {
    this.selectedModels(model);
    const rows = this.index.get([region, scenario, model].join('|'));
    if (!rows?.length) throw new Error(`No climate series for ${region}, ${scenario}, ${model}.`);
    return rows;
  },
  modelSeries(region, scenario, model, smooth = false) {
    const rows = this.rowsFor(region, scenario, model);
    if (!smooth) return rows.map(r => ({year:r.year, value:r.anomaly}));
    return rows.slice(9).map((r,i) => {
      const window = rows.slice(i,i+10);
      if (window.some((row,j) => row.year !== r.year-9+j)) {
        throw new Error('A trailing average requires ten consecutive years.');
      }
      return {year:r.year, value:this.mean(window.map(x=>x.anomaly))};
    });
  },
  series(region, scenario, model = 'mean', smooth = false) {
    const models = this.selectedModels(model);
    const sets = models.map(m => this.modelSeries(region, scenario, m, smooth));
    if (sets.some(rows => rows.length !== sets[0].length)) throw new Error('Model years do not align.');
    return sets[0].map((d,i) => {
      if (sets.some(rows => rows[i].year !== d.year)) throw new Error('Model years do not align.');
      const values = sets.map(rows=>rows[i].value);
      return {year:d.year, value:this.mean(values), min:Math.min(...values), max:Math.max(...values)};
    });
  },
  period(region, scenario, start, end, model = 'mean') {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      throw new Error('Choose integer start and end years in chronological order.');
    }
    const models = this.selectedModels(model);
    const key = [region,scenario,start,end,model].join('|');
    if (this.periodCache.has(key)) return this.periodCache.get(key);
    const values = models.map(m => {
      const rows = this.rowsFor(region,scenario,m).filter(d=>d.year>=start && d.year<=end);
      if (rows.length !== end-start+1 || rows.some((r,i) => r.year !== start+i)) {
        throw new Error('The selected period does not have every requested year.');
      }
      return Object.freeze({model:m, value:this.mean(rows.map(d=>d.anomaly))});
    });
    const result = Object.freeze({value:this.mean(values.map(d=>d.value)), min:Math.min(...values.map(d=>d.value)), max:Math.max(...values.map(d=>d.value)), models:Object.freeze(values)});
    this.periodCache.set(key,result);
    return result;
  },
  pairedGap(region, start, end, model = 'mean') {
    const low = this.period(region,'ssp126',start,end,model);
    const high = this.period(region,'ssp585',start,end,model);
    // Pair pathways within each model before summarizing their differences.
    const models = low.models.map(d => {
      const other = high.models.find(x => x.model === d.model);
      if (!other) throw new Error('Scenario models do not align.');
      return {model:d.model, low:d.value, high:other.value, gap:other.value-d.value};
    });
    const values = models.map(d=>d.gap);
    return {value:this.mean(values), min:Math.min(...values), max:Math.max(...values), models};
  },
  comparePeriods(region, aStart, aEnd, bStart, bEnd, model = 'mean') {
    const a = this.pairedGap(region,aStart,aEnd,model);
    const b = this.pairedGap(region,bStart,bEnd,model);
    const models = a.models.map(d => {
      const other = b.models.find(x => x.model === d.model);
      if (!other) throw new Error('Period models do not align.');
      return {model:d.model, value:other.gap-d.gap};
    });
    const values = models.map(d=>d.value);
    return {a,b,change:{value:this.mean(values),min:Math.min(...values),max:Math.max(...values),models}};
  },
  gapSeries(region, model = 'mean', smooth = false) {
    const sets = this.selectedModels(model).map(m => {
      const low = this.modelSeries(region,'ssp126',m,smooth);
      const high = this.modelSeries(region,'ssp585',m,smooth);
      if (low.length !== high.length) throw new Error('Scenario years do not align.');
      return low.map((d,i) => {
        if (high[i].year !== d.year) throw new Error('Scenario years do not align.');
        return {year:d.year, value:high[i].value-d.value};
      });
    });
    if (sets.some(rows => rows.length !== sets[0].length)) throw new Error('Model years do not align.');
    return sets[0].map((d,i) => {
      if (sets.some(rows => rows[i].year !== d.year)) throw new Error('Model years do not align.');
      const values = sets.map(rows=>rows[i].value);
      return {year:d.year,value:this.mean(values),min:Math.min(...values),max:Math.max(...values)};
    });
  },
  latitude(r) {
    const f = x => x === 0 ? '0°' : `${Math.abs(x)}°${x>0?'N':'S'}`;
    return `${f(r.south)}–${f(r.north)}`;
  }
};
