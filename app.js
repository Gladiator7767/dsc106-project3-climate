/* Linked D3 exploration. Data calculations live in climate-core.js. */
'use strict';
(async () => {
  const C = window.Climate;
  const $ = id => document.getElementById(id);
  const defaults = {region:'global', model:'mean', start:2081, end:2100, aStart:2021, aEnd:2040, smooth:false, measure:'warming', sort:'latitude'};
  const state = {...defaults};
  const periodColors = {a:'#5c6a75', b:'#7046a0'};
  const tip = $('tooltip');
  let data, land, warmingDomain, gapDomain, timelineKey='', timeline={}, frame=0;
  const signed = n => C.format(Math.abs(n)<0.0000001 ? 0 : n);
  const number = n => (Math.abs(n)<0.0000001 ? 0 : n).toFixed(2);
  const periodText = (a,b) => `${a}–${b} · ${b-a+1} ${a===b?'year':'years'}`;
  const regionName = () => data.meta.regions.find(r=>r.id===state.region).name;
  const modelName = () => state.model==='mean' ? 'Mean of three models' : state.model;
  const compare = (id,model=state.model) => C.comparePeriods(id,state.aStart,state.aEnd,state.start,state.end,model);
  function showTip(event,text) {
    tip.textContent=text; tip.hidden=false;
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Number.isFinite(event.clientX)?event.clientX:rect.left+rect.width/2;
    const y=Number.isFinite(event.clientY)?event.clientY:rect.top;
    tip.style.left=`${Math.max(8,Math.min(x+14,window.innerWidth-tip.offsetWidth-12))}px`;
    tip.style.top=`${Math.max(8,Math.min(y+14,window.innerHeight-tip.offsetHeight-12))}px`;
  }
  function hideTip(){tip.hidden=true;}
  function regionInfo(id) {
    const d=compare(id),name=data.meta.regions.find(r=>r.id===id).name;
    return `${name} · ${modelName()}\nScenario gap = SSP5-8.5 − SSP1-2.6\nA ${state.aStart}–${state.aEnd}: ${signed(d.a.value)}\nB ${state.start}–${state.end}: ${signed(d.b.value)}\nGap B − gap A: ${signed(d.change.value)}`;
  }
  function scheduleRender() {if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});}
  function selectRegion(id) {state.region=id;hideTip();render();}
  try {
    [data,land]=await Promise.all([d3.json('data/climate.json'),d3.json('data/land-110m.json')]);
    C.init(data);
    const values=data.rows.filter(r=>r.scenario!=='historical').map(r=>r.anomaly);
    warmingDomain=[Math.min(0,Math.floor(d3.min(values))),Math.ceil(d3.max(values)/2)*2];
    const gaps=data.meta.regions.flatMap(r=>data.meta.models.flatMap(m=>C.gapSeries(r.id,m).map(d=>d.value)));
    gapDomain=[Math.min(0,Math.floor(d3.min(gaps))),Math.ceil(d3.max(gaps)/2)*2];
    d3.select('#region').selectAll('option').data(data.meta.regions).join('option').attr('value',d=>d.id).text(d=>`${d.name} · ${C.latitude(d)}`);
    d3.select('#model').selectAll('option.model').data(data.meta.models).join('option').attr('class','model').attr('value',d=>d).text(d=>d);
    $('load-status').hidden=true;
  } catch(error) {
    $('load-status').className='error';
    $('load-status').textContent='The climate data could not load. Please reload the page, or open the local version through its start-preview shortcut. '+error.message;
    document.querySelectorAll('#explore button,#explore input,#explore select').forEach(el=>el.disabled=true);
    return;
  }
  function setupMap() {
    const svg=d3.select('#map');
    const projection=d3.geoEquirectangular().fitExtent([[4,17],[362,235]],{type:'Sphere'});
    const path=d3.geoPath(projection);
    svg.append('path').datum({type:'Sphere'}).attr('d',path).attr('fill','#edf3f4');
    svg.append('path').datum(topojson.feature(land,land.objects.land)).attr('d',path).attr('fill','#becacd');
    const bands=svg.selectAll('g.band').data(data.meta.regions.filter(r=>r.id!=='global')).join('g')
      .attr('class','band').attr('role','button').attr('tabindex',0)
      .attr('aria-label',r=>`${r.name}, ${C.latitude(r)}. Select region.`)
      .on('click',(e,r)=>selectRegion(r.id))
      .on('keydown',(e,r)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectRegion(r.id);}})
      .on('pointermove',(e,r)=>showTip(e,regionInfo(r.id))).on('pointerleave',hideTip)
      .on('focus',(e,r)=>showTip(e,regionInfo(r.id))).on('blur',hideTip);
    bands.append('rect').attr('x',projection([-180,0])[0]).attr('y',r=>projection([0,r.north])[1])
      .attr('width',projection([180,0])[0]-projection([-180,0])[0])
      .attr('height',r=>projection([0,r.south])[1]-projection([0,r.north])[1]).style('cursor','pointer');
    [60,30,0,-30,-60].forEach(lat=>svg.append('text').attr('x',368).attr('y',projection([0,lat])[1]+4).style('font-size','11px').text(`${Math.abs(lat)}°${lat>0?'N':lat<0?'S':''}`));
  }
  function updateMap() {
    d3.select('#map').selectAll('.band').attr('aria-pressed',r=>r.id===state.region).select('rect')
      .attr('fill',r=>r.id===state.region?'#186a9044':'#ffffff01').attr('stroke',r=>r.id===state.region?'#186a90':'white').attr('stroke-width',r=>r.id===state.region?2:1);
    const r=data.meta.regions.find(r=>r.id===state.region);
    $('region-facts').innerHTML=`<strong>${r.name}</strong><br>${C.latitude(r)}<br>${modelName()}<br>Warming baseline: 1995–2014`;
  }
  function renderTimeline() {
    const svg=d3.select('#timeline');
    const w=Math.min(960,Math.max(280,svg.node().clientWidth)),h=w<500?320:360,m={l:44,r:14,t:25,b:35};
    const key=[state.region,state.model,state.smooth,state.measure,Math.round(w)].join('|');
    if(key!==timelineKey){
      timelineKey=key;svg.selectAll('*').remove();svg.attr('viewBox',`0 0 ${w} ${h}`);
      const x=d3.scaleLinear().domain([2015,2100]).range([m.l,w-m.r]);
      const y=d3.scaleLinear().domain(state.measure==='warming'?warmingDomain:gapDomain).range([h-m.b,m.t]);
      svg.append('g').attr('class','grid').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(w-m.l-m.r)).tickFormat(''));
      svg.append('g').attr('transform',`translate(0,${h-m.b})`).call(d3.axisBottom(x).tickValues(w<500?[2015,2040,2070,2100]:[2015,2030,2050,2070,2090,2100]).tickFormat(d3.format('d')));
      svg.append('g').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d=>`${d}°`));
      svg.append('text').attr('x',m.l).attr('y',14).attr('class','axis-title').text(state.measure==='warming'?'Temperature change (°C)':'Scenario gap (°C)');
      const ref=svg.append('rect').attr('y',m.t).attr('height',h-m.b-m.t).attr('fill','#5c6a7507').attr('stroke',periodColors.a).attr('stroke-dasharray','5 4').style('pointer-events','none');
      if(y.domain()[0]<0)svg.append('line').attr('x1',m.l).attr('x2',w-m.r).attr('y1',y(0)).attr('y2',y(0)).attr('stroke','#78848d').attr('stroke-width',1.1);
      const sets=state.measure==='gap'?[{id:'gap',label:'SSP5-8.5 − SSP1-2.6',color:'#4c345f',rows:C.gapSeries(state.region,state.model,state.smooth)}]:C.scenarios.map(s=>({id:s,label:C.names[s],color:C.colors[s],rows:C.series(state.region,s,state.model,state.smooth)}));
      sets.forEach(s=>{
        if(state.model==='mean')svg.append('path').datum(s.rows).attr('fill',s.color).attr('opacity',.11).attr('d',d3.area().x(d=>x(d.year)).y0(d=>y(d.min)).y1(d=>y(d.max)));
        svg.append('path').datum(s.rows).attr('fill','none').attr('stroke',s.color).attr('stroke-width',2.5).attr('stroke-dasharray',s.id==='ssp585'?'7 4':null).attr('d',d3.line().x(d=>x(d.year)).y(d=>y(d.value)));
      });
      const guide=svg.append('line').attr('y1',m.t).attr('y2',h-m.b).attr('stroke','#73818a').attr('stroke-dasharray','2 3').attr('visibility','hidden').style('pointer-events','none');
      const brush=d3.brushX().extent([[m.l,m.t],[w-m.r,h-m.b]]).on('end',event=>{
        if(!event.sourceEvent)return;
        if(!event.selection){updateBrush();return;}
        const [a,b]=event.selection.map(v=>Math.max(2015,Math.min(2100,Math.round(x.invert(v)))));
        state.start=a;state.end=b;hideTip();scheduleRender();
      });
      const brushGroup=svg.append('g').attr('class','brush').call(brush);
      brushGroup.on('pointermove',function(event){
        if(event.buttons)return hideTip();
        const year=Math.max(2015,Math.min(2100,Math.round(x.invert(d3.pointer(event,svg.node())[0]))));
        if(state.smooth&&year<2024){guide.attr('visibility','hidden');return hideTip();}
        guide.attr('x1',x(year)).attr('x2',x(year)).attr('visibility','visible');
        const lines=sets.map(s=>{const d=s.rows.find(r=>r.year===year);return `${s.label}: ${signed(d.value)}${state.model==='mean'?`\n  Model min–max: ${signed(d.min)} to ${signed(d.max)}`:''}`;});
        showTip(event,`${regionName()} · ${state.smooth?`${year-9}–${year} average`:year}\n${lines.join('\n')}\n${state.model==='mean'?'Three-model range, not a confidence interval':state.model}`);
      }).on('pointerleave',()=>{hideTip();guide.attr('visibility','hidden');}).on('pointerdown',hideTip);
      timeline={x,ref,brush,brushGroup};
    }
    updateBrush();
    $('line-title').textContent=`${regionName()} · ${state.smooth?'10-year trailing averages':'annual values'}`;
    $('timeline-unit').textContent=state.measure==='warming'?'°C above 1995–2014':'SSP5-8.5 − SSP1-2.6, °C';
    $('timeline-legend').innerHTML=state.measure==='warming'?'<span class="low">● SSP1-2.6 · low emissions</span><span class="high">◆ SSP5-8.5 · very high emissions</span>':'<span class="gap-ink">— Gap between scenarios</span>';
    if(state.model==='mean')$('timeline-legend').insertAdjacentHTML('beforeend','<span>Shading = three-model min–max, not a confidence interval.</span>');
    svg.attr('aria-label',`${regionName()}, ${state.measure==='warming'?'warming above 1995–2014':'high-minus-low scenario gap'}, ${state.smooth?'10-year trailing averages':'annual values'}, ${modelName()}.`);
  }
  function updateBrush() {
    if(!timeline.x)return;
    const {x,ref,brush,brushGroup}=timeline;
    ref.attr('x',x(state.aStart)).attr('width',Math.max(1,x(state.aEnd)-x(state.aStart)));
    brushGroup.call(brush.move,[x(state.start),x(state.end)]);
    brushGroup.select('.selection').attr('fill',periodColors.b).attr('fill-opacity',.08).attr('stroke',periodColors.b);
  }
  function drawComparison(selector,entries,{height,interactive=false}={}) {
    const svg=d3.select(selector),w=1120,m={l:202,r:280,t:35,b:43};
    const x=d3.scaleLinear().domain(gapDomain).range([m.l,w-m.r]);
    const y=d3.scaleBand().domain(entries.map(d=>d.id)).range([m.t,height-m.b]).padding(.22);
    svg.attr('viewBox',`0 0 ${w} ${height}`);
    svg.selectAll('g.grid').data([null]).join('g').attr('class','grid').attr('transform',`translate(0,${height-m.b})`).call(d3.axisBottom(x).ticks(8).tickSize(-(height-m.b-m.t)).tickFormat(''));
    svg.selectAll('g.x-axis').data([null]).join('g').attr('class','x-axis').attr('transform',`translate(0,${height-m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat(d=>`${d}°C`));
    svg.selectAll('line.zero').data([null]).join('line').attr('class','zero').attr('x1',x(0)).attr('x2',x(0)).attr('y1',m.t-10).attr('y2',height-m.b).attr('stroke','#9ca7ae');
    const heads=[{x:906,text:'A gap',color:periodColors.a},{x:1002,text:'B gap',color:periodColors.b},{x:1110,text:'B − A',color:'#182e40'}];
    svg.selectAll('text.column-head').data(heads).join('text').attr('class','column-head').attr('x',d=>d.x).attr('y',17).attr('text-anchor','end').style('fill',d=>d.color).style('font-weight',700).text(d=>d.text);
    svg.selectAll('text.axis-label').data([null]).join('text').attr('class','axis-label').attr('x',(m.l+w-m.r)/2).attr('y',height-5).attr('text-anchor','middle').text('SSP5-8.5 − SSP1-2.6 (°C) · fixed scale');
    const rows=svg.selectAll('g.compare-row').data(entries,d=>d.id).join(enter=>{
      const g=enter.append('g').attr('class','compare-row');
      g.append('rect').attr('class','hit');g.append('text').attr('class','name');g.append('line').attr('class','connector');
      ['a','b'].forEach(k=>{g.append('line').attr('class',`range-${k}`);g.append('path').attr('class',`dot-${k}`);g.append('text').attr('class',`value-${k}`);});
      g.append('text').attr('class','delta');return g;
    }).attr('transform',d=>`translate(0,${y(d.id)})`).attr('data-id',d=>d.id);
    rows.attr('class',d=>`compare-row${interactive?' row-hit':''}${d.active?' selected-row':''}`);
    if(interactive)rows.attr('role','button').attr('tabindex',0).attr('aria-pressed',d=>d.active).attr('aria-label',d=>regionInfo(d.id)+'. Select region.')
      .on('click',(e,d)=>selectRegion(d.id)).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectRegion(d.id);}});
    rows.on('pointermove',(e,d)=>showTip(e,`${d.name}\nA ${state.aStart}–${state.aEnd}: ${signed(d.a.value)}\nB ${state.start}–${state.end}: ${signed(d.b.value)}\nGap B − gap A: ${signed(d.change.value)}${d.showRange?`\nChange across models: ${signed(d.change.min)} to ${signed(d.change.max)}\nNot a confidence interval`:''}`)).on('pointerleave',hideTip)
      .on('focus',(e,d)=>showTip(e,interactive?regionInfo(d.id):d.name)).on('blur',hideTip);
    rows.select('.hit').attr('width',w).attr('height',y.bandwidth()).attr('rx',4).attr('fill',d=>d.active?'#ede8f4':'#ffffff01');
    rows.select('.name').attr('x',8).attr('y',y.bandwidth()/2+5).style('fill','#182e40').style('font-weight',d=>d.active?750:450).text(d=>d.name);
    rows.select('.connector').attr('x1',d=>x(d.a.value)).attr('x2',d=>x(d.b.value)).attr('y1',y.bandwidth()/2-7).attr('y2',y.bandwidth()/2+7).attr('stroke','#bac1c8').attr('stroke-width',1.3);
    ['a','b'].forEach((k,i)=>{
      const cy=y.bandwidth()/2+(i===0?-7:7),color=periodColors[k];
      rows.select(`.range-${k}`).attr('x1',d=>x(d[k].min)).attr('x2',d=>x(d[k].max)).attr('y1',cy).attr('y2',cy).attr('stroke',color).attr('stroke-width',1.5).attr('stroke-dasharray',i?null:'3 2').attr('opacity',d=>d.showRange?.75:0);
      rows.select(`.dot-${k}`).attr('d',d3.symbol().type(i?d3.symbolDiamond:d3.symbolCircle).size(i?66:55)).attr('transform',d=>`translate(${x(d[k].value)},${cy})`).attr('fill',i?color:'white').attr('stroke',color).attr('stroke-width',1.8);
      rows.select(`.value-${k}`).attr('x',i?1002:906).attr('y',y.bandwidth()/2+5).attr('text-anchor','end').style('fill',color).style('font-variant-numeric','tabular-nums').text(d=>`${number(d[k].value)}°`);
    });
    rows.select('.delta').attr('x',1110).attr('y',y.bandwidth()/2+5).attr('text-anchor','end').style('fill','#182e40').style('font-weight',650).text(d=>signed(d.change.value));
  }
  function renderComparisons() {
    let entries=data.meta.regions.map(r=>({...r,...compare(r.id),active:r.id===state.region,showRange:state.model==='mean'}));
    if(state.sort==='change')entries=[entries[0],...entries.slice(1).sort((a,b)=>b.change.value-a.change.value)];
    drawComparison('#comparison',entries,{height:440,interactive:true});
    $('comparison-period').textContent=`A: ${periodText(state.aStart,state.aEnd)}  |  B: ${periodText(state.start,state.end)}  |  ${modelName()}`;
    const bands=entries.filter(r=>r.id!=='global'),top=bands.reduce((a,b)=>b.change.value>a.change.value?b:a);
    const allSame=bands.every(d=>Math.abs(d.change.value)<1e-10);
    $('comparison-insight').textContent=allSame?'The two selections have the same scenario gap in every band. Choose another period to compare.':`For these selections, ${top.name} has the largest signed B − A change among the six latitude bands: ${signed(top.change.value)} (${number(top.a.value)}°C in A → ${number(top.b.value)}°C in B).`;
    const all=compare(state.region,'mean');
    const models=data.meta.models.map(model=>({id:model,name:model,...compare(state.region,model),active:state.model===model,showRange:false}));
    models.push({id:'mean',name:'Three-model mean',...all,active:state.model==='mean',showRange:true});
    drawComparison('#model-comparison',models,{height:295});
    $('model-context').textContent=`${regionName()} · A ${state.aStart}–${state.aEnd} versus B ${state.start}–${state.end}. ${state.model==='mean'?'The mean row is highlighted.':`${state.model} is highlighted; the other models remain visible for comparison.`}`;
    const changes=all.change.models.map(d=>d.value),pos=changes.filter(d=>d>1e-10).length,neg=changes.filter(d=>d< -1e-10).length;
    const verdict=pos===3?'All three models show a larger scenario gap in B than in A.':neg===3?'All three models show a smaller scenario gap in B than in A.':pos===0&&neg===0?'All three models show no change between these selections.':'The models do not all show the same direction of change.';
    $('model-insight').textContent=`${verdict} Their paired changes range from ${signed(all.change.min)} to ${signed(all.change.max)}. This describes these three runs, not statistical significance.`;
    renderTable(entries);
  }
  function renderTable(entries) {
    $('table-wrap').innerHTML=`<table><caption>${modelName()}. A ${state.aStart}–${state.aEnd}; B ${state.start}–${state.end}. All values in °C. Warming is relative to 1995–2014.</caption><thead><tr><th scope="col">Region</th><th scope="col">A low</th><th scope="col">A high</th><th scope="col">A gap</th><th scope="col">B low</th><th scope="col">B high</th><th scope="col">B gap</th><th scope="col">Gap B − A</th><th scope="col">Change min–max</th></tr></thead><tbody>${entries.map(d=>{
      const aL=C.period(d.id,'ssp126',state.aStart,state.aEnd,state.model),aH=C.period(d.id,'ssp585',state.aStart,state.aEnd,state.model),bL=C.period(d.id,'ssp126',state.start,state.end,state.model),bH=C.period(d.id,'ssp585',state.start,state.end,state.model);
      return `<tr><th scope="row">${d.name}</th><td>${number(aL.value)}</td><td>${number(aH.value)}</td><td>${number(d.a.value)}</td><td>${number(bL.value)}</td><td>${number(bH.value)}</td><td>${number(d.b.value)}</td><td>${number(d.change.value)}</td><td>${state.model==='mean'?`${number(d.change.min)} to ${number(d.change.max)}`:'Single model'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function renderSummary() {
    const d=compare(state.region),yearA=state.aEnd-state.aStart+1,yearB=state.end-state.start+1;
    $('reference-label').textContent=periodText(state.aStart,state.aEnd);$('period-label').textContent=periodText(state.start,state.end);
    $('start').value=state.start;$('end').value=state.end;$('start-out').textContent=state.start;$('end-out').textContent=state.end;
    document.querySelectorAll('[data-period]').forEach(b=>{const active=b.dataset.period===`${state.start},${state.end}`;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
    const notes=[];
    if(yearA!==yearB)notes.push(`Unequal lengths: A has ${yearA} years; B has ${yearB}. Both use mean annual values.`);
    const overlap=Math.max(0,Math.min(state.aEnd,state.end)-Math.max(state.aStart,state.start)+1);
    if(overlap)notes.push(`Periods share ${overlap} ${overlap===1?'year':'years'}.`);
    if(state.start<state.aStart)notes.push('B begins before A; the displayed change is still B minus A.');
    $('period-notice').textContent=notes.length?notes.join(' '):'Two non-overlapping periods of equal length. Change is always B minus A.';
    $('period-notice').classList.toggle('notice-active',notes.length>0);
    $('summary').innerHTML=[['A · scenario gap',d.a.value,'reference-ink',`${state.aStart}–${state.aEnd}`],['B · scenario gap',d.b.value,'current-ink',`${state.start}–${state.end}`],['Gap B − gap A',d.change.value,'',state.model==='mean'?`${number(d.change.min)} to ${number(d.change.max)}°C across models`:'Single model']].map(([label,value,cls,note])=>`<div class="metric"><span>${label}</span><strong class="${cls}">${signed(value)}</strong><em>${note}</em></div>`).join('');
    const low=C.period(state.region,'ssp126',state.start,state.end,state.model),high=C.period(state.region,'ssp585',state.start,state.end,state.model);
    $('current-warming').textContent=`${regionName()}, period B warming: SSP1-2.6 ${signed(low.value)}; SSP5-8.5 ${signed(high.value)}. ${modelName()}.`;
  }
  function render() {
    hideTip();$('region').value=state.region;$('model').value=state.model;$('smoothing').value=state.smooth?'smooth':'annual';$('sort').value=state.sort;
    document.querySelectorAll('[data-measure]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.measure===state.measure));
    updateMap();renderTimeline();renderSummary();renderComparisons();
  }
  function syncReferenceInputs(){$('a-start').value=state.aStart;$('a-end').value=state.aEnd;$('reference-error').hidden=true;}
  $('reference-form').addEventListener('submit',event=>{
    event.preventDefault();const start=Number($('a-start').value),end=Number($('a-end').value);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<2015||end>2100||start>end){$('reference-error').textContent='Use whole years from 2015 to 2100, with start no later than end.';$('reference-error').hidden=false;return;}
    state.aStart=start;state.aEnd=end;syncReferenceInputs();render();
  });
  $('pin-reference').addEventListener('click',()=>{state.aStart=state.start;state.aEnd=state.end;syncReferenceInputs();render();});
  $('region').addEventListener('change',e=>selectRegion(e.target.value));
  $('model').addEventListener('change',e=>{state.model=e.target.value;render();});
  $('smoothing').addEventListener('change',e=>{state.smooth=e.target.value==='smooth';render();});
  $('sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
  document.querySelectorAll('[data-measure]').forEach(b=>b.addEventListener('click',()=>{state.measure=b.dataset.measure;render();}));
  $('start').addEventListener('input',e=>{state.start=+e.target.value;if(state.start>state.end)state.end=state.start;scheduleRender();});
  $('end').addEventListener('input',e=>{state.end=+e.target.value;if(state.end<state.start)state.start=state.end;scheduleRender();});
  document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{[state.start,state.end]=b.dataset.period.split(',').map(Number);render();}));
  $('try-arctic').addEventListener('click',()=>selectRegion('arctic'));
  $('reset').addEventListener('click',()=>{Object.assign(state,defaults);syncReferenceInputs();render();});
  $('download').addEventListener('click',()=>{
    const rows=data.meta.regions.flatMap(r=>['mean',...data.meta.models].map(model=>{
      const d=compare(r.id,model);
      return {region:r.name,region_code:r.id,model,active_model_view:state.model,a_start:state.aStart,a_end:state.aEnd,a_years:state.aEnd-state.aStart+1,b_start:state.start,b_end:state.end,b_years:state.end-state.start+1,a_ssp126_C:C.period(r.id,'ssp126',state.aStart,state.aEnd,model).value,a_ssp585_C:C.period(r.id,'ssp585',state.aStart,state.aEnd,model).value,a_gap_C:d.a.value,a_gap_min_C:d.a.min,a_gap_max_C:d.a.max,b_ssp126_C:C.period(r.id,'ssp126',state.start,state.end,model).value,b_ssp585_C:C.period(r.id,'ssp585',state.start,state.end,model).value,b_gap_C:d.b.value,b_gap_min_C:d.b.min,b_gap_max_C:d.b.max,gap_change_B_minus_A_C:d.change.value,change_min_C:d.change.min,change_max_C:d.change.max,warming_baseline:'1995-2014',range_definition:model==='mean'?'min-max of three paired model values; not a confidence interval':'individual model'};
    }));
    const url=URL.createObjectURL(new Blob([d3.csvFormat(rows)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`warming-comparison-A${state.aStart}-${state.aEnd}-B${state.start}-${state.end}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  setupMap();syncReferenceInputs();render();
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderTimeline,120);});
})();
