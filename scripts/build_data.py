"""Reproduce the static browser dataset from the course's CMIP6 Zarr catalog.
Run with xarray, zarr<3, gcsfs, dask, cftime, pandas, numpy available.
No missing years are imputed. All spatial averages include land and ocean.
"""
from pathlib import Path
import sys,json,hashlib,datetime,concurrent.futures,urllib.request,math
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.python'))
import numpy as np, pandas as pd, xarray as xr, gcsfs, dask
def clean_source_metadata(value):
    """Catalog missing/non-finite metadata is JSON null, never a data estimate."""
    if isinstance(value,dict): return {key:clean_source_metadata(item) for key,item in value.items()}
    if isinstance(value,(list,tuple)): return [clean_source_metadata(item) for item in value]
    if isinstance(value,(float,np.floating)) and not math.isfinite(value): return None
    return value
MODELS=['CanESM5','IPSL-CM6A-LR','MPI-ESM1-2-LR']
REGIONS=[('global','Global',-90,90),('arctic','Arctic',60,90),('north-mid','Northern midlatitudes',30,60),('north-tropics','Northern tropics',0,30),('south-tropics','Southern tropics',-30,0),('south-mid','Southern midlatitudes',-60,-30),('antarctic','Antarctic',-90,-60)]
raw=ROOT/'data/raw'
raw.mkdir(parents=True,exist_ok=True)
catalog_path=raw/'cmip6-zarr-consolidated-stores.csv'
if not catalog_path.exists():
    urllib.request.urlretrieve('https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv',catalog_path)
catalog=pd.read_csv(catalog_path)
def choose(model,var,experiment):
    q=catalog[(catalog.source_id==model)&(catalog.variable_id==var)&(catalog.experiment_id==experiment)]
    if var=='tas': q=q[(q.table_id=='Amon')&(q.member_id=='r1i1p1f1')]
    else:
        exact=q[q.member_id=='r1i1p1f1']
        if len(exact): q=exact
    if q.empty: raise ValueError((model,var,experiment))
    return clean_source_metadata(q.sort_values(['version','zstore']).iloc[-1].to_dict())
def process(model):
    cache=ROOT/'data/raw'/f'{model}-regional.json'
    if cache.exists(): return json.loads(cache.read_text())
    fs=gcsfs.GCSFileSystem(token='anon')
    area_ref=choose(model,'areacella','historical')
    area=xr.open_zarr(fs.get_mapper(area_ref['zstore']),consolidated=True).areacella.load()
    refs=[area_ref]; all_years={}; coverage=[]
    for exp,begin,end in [('historical','1995','2014'),('ssp126','2015','2100'),('ssp585','2015','2100')]:
        ref=choose(model,'tas',exp); refs.append(ref)
        ds=xr.open_zarr(fs.get_mapper(ref['zstore']),consolidated=True,use_cftime=True)
        time_years=np.array([t.year for t in ds.time.values])
        tas=ds.tas.isel(time=np.flatnonzero((time_years>=int(begin))&(time_years<=int(end))))
        assert tas.attrs['units']=='K'
        assert tas.sizes['time']==(int(end)-int(begin)+1)*12
        assert len(set((t.year,t.month) for t in tas.time.values))==tas.sizes['time']
        assert np.isfinite(area.values).all() and (area.values>0).all()
        assert np.allclose(tas.lat.values,area.lat.values) and np.allclose(tas.lon.values,area.lon.values)
        print(f'{model} {exp}: loading {tas.shape}',flush=True)
        with dask.config.set(scheduler='threads',num_workers=4): tas=tas.load()
        assert np.isfinite(tas.values).all(), 'Missing temperature cells'
        days=np.array([t.daysinmonth for t in tas.time.values])
        years=np.array([t.year for t in tas.time.values])
        annual={}
        for rid,name,lo,hi in REGIONS:
            mask=(area.lat.values>=lo)&((area.lat.values<hi) if hi<90 else (area.lat.values<=hi))
            weights=np.where(mask[:,None],area.values.astype('float64'),0)
            assert float(weights.sum())>0
            monthly=np.einsum('tij,ij->t',tas.values,weights)/weights.sum()
            annual[rid]={str(y):float(np.average(monthly[years==y],weights=days[years==y])) for y in range(int(begin),int(end)+1)}
        all_years[exp]=annual
        coverage.append({'experiment':exp,'months':tas.sizes['time'],'latitudeCells':tas.sizes['lat'],'longitudeCells':tas.sizes['lon'],'calendar':str(ds.time.encoding.get('calendar','standard'))})
    baselines={rid:float(np.mean(list(all_years['historical'][rid].values()))) for rid,_,_,_ in REGIONS}
    rows=[{'model':model,'scenario':exp,'region':rid,'year':int(year),'anomaly':round(v-baselines[rid],5)} for exp in ['historical','ssp126','ssp585'] for rid,_,_,_ in REGIONS for year,v in all_years[exp][rid].items()]
    result={'model':model,'sources':refs,'coverage':coverage,'baselineKelvin':baselines,'rows':rows}
    cache.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8');print(model+' complete',flush=True)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results=list(pool.map(process,MODELS))
rows=[r for result in results for r in result['rows']]
df=pd.DataFrame(rows)
assert not df.duplicated(['model','scenario','region','year']).any()
assert len(df)==3*7*(20+86*2)
assert df[df.scenario=='historical'].groupby(['model','region']).anomaly.mean().abs().max()<0.00001
meta={'title':'Exploring Regional Warming Under Different Climate Scenarios','retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':[1995,2014],'models':MODELS,'member':'r1i1p1f1','scenarios':{'ssp126':'SSP1-2.6','ssp585':'SSP5-8.5'},'regions':[{'id':rid,'name':name,'south':lo,'north':hi} for rid,name,lo,hi in REGIONS],'method':'Monthly tas (K), native-grid areacella area weights; cells selected by latitude center, land and ocean included; annual means weighted by days per month; subtract each model-region 1995–2014 mean of annual means. Scenario and period comparisons use equal weights per model and per year.','catalog':'https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv','limitations':'Three availability-selected models, one realization each, not a representative or complete CMIP6 ensemble. Selected-model min–max is not a confidence interval. Latitude bands are not countries. Scenarios are conditional projections, not forecasts. Baseline is recent history, not preindustrial.'}
(ROOT/'data/climate.json').write_text(json.dumps({'meta':meta,'rows':rows},ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
df.to_csv(ROOT/'data/climate.csv',index=False)
manifest={'meta':meta,'sources':clean_source_metadata([s for result in results for s in result['sources']]),'coverage':{r['model']:r['coverage'] for r in results},'checks':{'rows':len(df),'duplicates':0,'missingValues':int(df.isna().sum().sum()),'baselineMeansNearZero':True},'sha256':hashlib.sha256((ROOT/'data/climate.csv').read_bytes()).hexdigest()}
(ROOT/'data/provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
print(df.query('year>=2081 and scenario!="historical"').groupby(['region','scenario']).anomaly.mean().round(2).to_string(),flush=True)
