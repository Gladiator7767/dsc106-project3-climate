'use strict';
(async()=>{
  const C=window.Climate;
  try{
    C.init(await d3.json('data/climate.json'));
    const regions=C.data.meta.regions.filter(r=>r.id!=='global');
    const short={'arctic':'Arctic','north-mid':'N. midlatitudes','north-tropics':'N. tropics','south-tropics':'S. tropics','south-mid':'S. midlatitudes','antarctic':'Antarctic'};
    const p=(r,s)=>C.period(r,s,2081,2100);
    function axis(svg,x,y,label){
      svg.append('g').attr('class','grid').attr('transform',`translate(${x.range()[0]},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(x.range()[1]-x.range()[0])).tickFormat(''));
      svg.append('g').attr('transform',`translate(0,${y.range()[0]})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')));
      svg.append('g').attr('transform',`translate(${x.range()[0]},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>`${d}°`));
      svg.append('text').attr('x',x.range()[0]).attr('y',16).attr('class','axis-title').text(label);
    }
    const s1=d3.select('#eda1'),x=d3.scaleLinear().domain([2015,2100]).range([45,535]),y=d3.scaleLinear().domain([0,6]).range([280,28]);
    axis(s1,x,y,'Global annual temperature change (°C)');
    C.scenarios.forEach(s=>s1.append('path').datum(C.series('global',s)).attr('fill','none').attr('stroke',C.colors[s]).attr('stroke-width',2.5).attr('stroke-dasharray',s==='ssp585'?'6 3':null).attr('d',d3.line().x(d=>x(d.year)).y(d=>y(d.value))));
    document.getElementById('note1').textContent=`Three-model annual means. In 2081–2100, the period mean is ${C.format(p('global','ssp126').value)} for SSP1-2.6 and ${C.format(p('global','ssp585').value)} for SSP5-8.5. A global mean leaves the geography unexplored.`;
    const s2=d3.select('#eda2'),rank=regions.map(r=>({...r,value:p(r.id,'ssp585').value})).sort((a,b)=>b.value-a.value);
    const bx=d3.scaleLinear().domain([0,12]).range([130,515]),by=d3.scaleBand().domain(rank.map(r=>r.id)).range([35,275]).padding(.35);
    s2.append('g').attr('transform','translate(0,280)').call(d3.axisBottom(bx).ticks(5).tickFormat(d=>`${d}°`));
    rank.forEach(r=>{s2.append('text').attr('x',122).attr('y',by(r.id)+by.bandwidth()/2+4).attr('text-anchor','end').text(short[r.id]);s2.append('rect').attr('x',bx(0)).attr('y',by(r.id)).attr('height',by.bandwidth()).attr('width',bx(r.value)-bx(0)).attr('fill',r.id==='arctic'?C.colors.ssp585:'#a2b3bc');s2.append('text').attr('x',bx(r.value)+5).attr('y',by(r.id)+by.bandwidth()/2+4).text(r.value.toFixed(1));});
    s2.append('text').attr('x',130).attr('y',18).text('SSP5-8.5 · 2081–2100 · °C');
    document.getElementById('note2').textContent=`The Arctic has the largest mean change in this subset: ${C.format(rank[0].value)}. The same period and baseline are used for all six bands; latitude boundaries are based on native-grid cell centers.`;
    const s3=d3.select('#eda3'),dy=d3.scaleBand().domain(regions.map(r=>r.id)).range([35,275]).padding(.45);
    s3.append('g').attr('transform','translate(0,280)').call(d3.axisBottom(bx).ticks(5).tickFormat(d=>`${d}°`));
    s3.append('text').attr('x',130).attr('y',18).text('2081–2100 period means · °C');
    regions.forEach(r=>{const cy=dy(r.id)+dy.bandwidth()/2,lo=p(r.id,'ssp126').value,hi=p(r.id,'ssp585').value;s3.append('text').attr('x',122).attr('y',cy+4).attr('text-anchor','end').text(short[r.id]);s3.append('line').attr('x1',bx(lo)).attr('x2',bx(hi)).attr('y1',cy).attr('y2',cy).attr('stroke','#aebcc2').attr('stroke-width',2);[lo,hi].forEach((v,i)=>s3.append('path').attr('d',d3.symbol().type(i?d3.symbolDiamond:d3.symbolCircle).size(60)).attr('transform',`translate(${bx(v)},${cy})`).attr('fill',C.colors[C.scenarios[i]]));});
    const s4=d3.select('#eda4'),periods=[[2021,2040],[2041,2060],[2061,2080],[2081,2100]],hx=d3.scaleBand().domain([0,1,2,3]).range([130,545]).padding(.04),hy=d3.scaleBand().domain(regions.map(r=>r.id)).range([45,275]).padding(.04),color=d3.scaleSequential(d3.interpolateOranges).domain([0,7]);
    s4.append('text').attr('x',130).attr('y',15).text('SSP5-8.5 minus SSP1-2.6 (°C)');
    periods.forEach((p,i)=>s4.append('text').attr('x',hx(i)+hx.bandwidth()/2).attr('y',36).attr('text-anchor','middle').style('font-size','11px').text(`${p[0]}–${p[1]}`));
    regions.forEach(r=>{s4.append('text').attr('x',122).attr('y',hy(r.id)+hy.bandwidth()/2+4).attr('text-anchor','end').text(short[r.id]);periods.forEach(([a,b],i)=>{const gap=C.period(r.id,'ssp585',a,b).value-C.period(r.id,'ssp126',a,b).value;s4.append('rect').attr('x',hx(i)).attr('y',hy(r.id)).attr('width',hx.bandwidth()).attr('height',hy.bandwidth()).attr('fill',color(gap));s4.append('text').attr('x',hx(i)+hx.bandwidth()/2).attr('y',hy(r.id)+hy.bandwidth()/2+4).attr('text-anchor','middle').style('fill',gap>3.5?'white':'#182e40').text(gap.toFixed(1));});});
    s4.append('text').attr('x',130).attr('y',304).style('font-size','12px').text('Lighter → darker: smaller → larger gap; exact values in cells.');
    const s5=d3.select('#eda5'),mx=d3.scaleLinear().domain([0,15]).range([145,535]),my=d3.scalePoint().domain(C.data.meta.models).range([65,245]);
    s5.append('g').attr('transform','translate(0,280)').call(d3.axisBottom(mx).ticks(5).tickFormat(d=>`${d}°`));
    s5.append('text').attr('x',145).attr('y',20).text('Arctic · 2081–2100 · °C');
    C.data.meta.models.forEach(model=>{const yy=my(model);s5.append('text').attr('x',138).attr('y',yy+4).attr('text-anchor','end').text(model);C.scenarios.forEach((s,i)=>{const v=C.period('arctic',s,2081,2100,model).value;s5.append('path').attr('d',d3.symbol().type(i?d3.symbolDiamond:d3.symbolCircle).size(85)).attr('transform',`translate(${mx(v)},${yy})`).attr('fill',C.colors[s]);s5.append('text').attr('x',mx(v)).attr('y',yy-13).attr('text-anchor','middle').style('fill',C.colors[s]).text(v.toFixed(1));});});
    const ar=p('arctic','ssp585');document.getElementById('note5').textContent=`The three high-emissions Arctic period means span ${ar.min.toFixed(2)}–${ar.max.toFixed(2)}°C. A single mean conceals this spread. These are selected models, not a probability sample or a confidence interval.`;
    const s6=d3.select('#eda6'),yy=d3.scaleLinear().domain([0,12]).range([280,28]);axis(s6,x,yy,'Arctic · SSP5-8.5 · temperature change (°C)');
    [false,true].forEach(smooth=>s6.append('path').datum(C.series('arctic','ssp585','mean',smooth)).attr('fill','none').attr('stroke',smooth?C.colors.ssp585:'#a1aeb5').attr('stroke-width',smooth?3:1.5).attr('d',d3.line().x(d=>x(d.year)).y(d=>yy(d.value))));
    document.getElementById('load-status').hidden=true;
  }catch(e){const el=document.getElementById('load-status');el.className='error';el.textContent='Could not load charts: '+e.message;}
})();
