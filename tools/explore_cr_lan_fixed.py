"""Transfer session rhyme layouts to frozen production Lan onsets, then refine rhymes only."""
import argparse
import copy
import gzip
import itertools
import json
from pathlib import Path
import random

from explore_cr_frontier_followup import Followup,local_moves
from explore_cr_stable_neighbors import adapt_shape_corpus
from prepare_cr_m24_portfolio import make_layout
from run_cr_anneal import ROOT,unpack,atomic_json,digest,lock_run
from search_cr_667_zero_carriers import CarrierSpace,read,sha

PREFIX=ROOT/'research/notes/2026-11-17-cr-lan-fixed'
OUTPUT=ROOT/'research/.cache/cr-lan-fixed-20261117'
MAPPING=Path('D:/C2D/Documents/rime-snow-pinyin/config/shenyun-21x21-mapping.json')
SNOW=MAPPING.parent.parent
SOURCE=ROOT/'research/notes/2026-11-17-cr-m24-portfolio-finalists.json'
POLICY=dict(word2='21',word3='231',word4='14')
PROFILES=dict(speed=dict(maxM=24,maxGuard=26,maxD=2,dailyFloor=119.46664129382486,
    pinkyCeiling=.09032422256372921,rightPinkyCeiling=.07468205050495597),
    balanced=dict(maxM=24,maxGuard=26,maxD=2,dailyFloor=126.23457023071755,
    pinkyCeiling=.09032422256372921,rightPinkyCeiling=.07468205050495597))


class LanSearch(Followup):
    def __init__(self):
        self.output=OUTPUT;self.output.mkdir(parents=True,exist_ok=True)
        manifest=unpack(ROOT/'research/config/cr-anneal-inputs.zip',OUTPUT/'inputs')
        corpus,audit=adapt_shape_corpus((OUTPUT/'inputs/corpus.bin').read_bytes(),POLICY)
        (OUTPUT/'inputs/corpus.bin').write_bytes(corpus)
        self.space=CarrierSpace(OUTPUT/'inputs');mapping=read(MAPPING)['initialMap']
        self.fixed=[mapping[a['name'].removeprefix('zero-')] for a in self.space.f['atoms']]
        schema=(SNOW/'snow_sanpin.schema.yaml').read_text(encoding='utf8')
        for name,key in mapping.items():
            if name=='YU':pattern='xform/(^| )yu/$1'+key+'v/'
            elif name in 'AEO' and len(name)==1:pattern='xform/(^| )(?='+name.lower()+')/$1'+key+'/'
            elif name in ['W','Y']:pattern='xform/(^| )'+name.lower()+'/$1'+key+'/'
            else:pattern='xform/(^| )'+name+'/$1'+key+'/'
            if pattern not in schema:raise ValueError('mapping/schema mismatch '+name)
        if '__include: snow_sanpin.schema.yaml:/sanpin_algebra' not in (SNOW/'snow_jiandao.schema.yaml').read_text(encoding='utf8'):
            raise ValueError('Lan schemas no longer share algebra')
        self.profiles=copy.deepcopy(PROFILES);self.cache_path=OUTPUT/'cache.json';self.state_path=OUTPUT/'state.json'
        self.cache=read(self.cache_path) if self.cache_path.exists() else {}
        paths=[MAPPING,SNOW/'snow_sanpin.schema.yaml',SNOW/'snow_jiandao.schema.yaml',
            SNOW/'config/shenyun-21x26-mapping.json',SNOW/'config/snow-zhudao-mapping.json']
        contract=dict(version='cr-lan-fixed-v1',manifest=digest(manifest),sourceSha256=sha(SOURCE),
            wordAuxiliaryPolicy=POLICY,corpusSha256=digest(list(corpus)),memoryModel=self.space.MEMORY_MODEL,
            fixedFirstKeys=self.fixed,maxD=2,maxM=24,maxGuard=26,rootInternalSplits=0,
            sourceHashes={str(p):sha(p) for p in paths},budget=6000)
        self.progress=read(self.state_path) if self.state_path.exists() else dict(contract=contract,profiles=self.profiles,rounds=[],transfers=[])
        if self.progress['contract']!=contract or self.progress['profiles']!=self.profiles:raise ValueError('changed fixed-Lan experiment contract')
        self.workers=12;self.score_max_d=2;self.score_max_m=24;self.track_pinkies=True;self.engine=None

    def fits(self,m,profile,*,peaks=False):
        p=self.profiles[profile]
        return (m['d']<=2 and m['m']<=24 and m['guard']<=26 and m['daily']>=p['dailyFloor']-1e-9 and
            (not peaks or (m['pinky']<=p['pinkyCeiling']+1e-12 and m['rightPinky']<=p['rightPinkyCeiling']+1e-12)))

    def candidates(self,moves):
        seen=set()
        for label,state in moves:
            if state['firstKeys']!=self.fixed:raise ValueError('fixed onsets changed')
            m=self.space.memory(state)
            if not m or m['d']>2 or m['m']>24 or m['guard']>26:continue
            key=self.space.key(state)
            if key in seen:continue
            seen.add(key);m.update(self.space.daily(state))
            if not self.fits(m,'speed'):continue
            yield dict(key=key,state=state,label=label,metrics=m)

    def full_score(self,item):
        previous=self.cache.get(item['key'],item)['metrics'];checked=super().full_score(item)
        for field in ['pinky','rightPinky']:
            if field in previous and abs(previous[field]-checked['metrics'][field])>1e-9:raise ValueError('full/incremental '+field+' mismatch')
        return checked

    def transfers(self):
        selected=[]
        for old in read(SOURCE)['layouts']:
            state=copy.deepcopy(old['state']);state['firstKeys']=self.fixed[:]
            m=dict(self.space.memory(state),**self.space.daily(state));row=self.full_score(dict(key=self.space.key(state),state=state,
                metrics=m,label='transfer:'+old['key'][:10]))
            selected.append(dict(origin=old['key'],key=row['key'],metrics=row['metrics'],original=old['metrics']))
        self.progress['transfers']=selected;atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps([dict(origin=r['origin'][:10],key=r['key'][:10],metrics=r['metrics']) for r in selected]),flush=True)

    def rhyme_moves(self,state):
        for label,candidate in local_moves(state,self.space):
            if candidate['firstKeys']==self.fixed:yield label,candidate

    def stage(self,phase):
        if not self.progress['transfers']:raise ValueError('run transfer calibration first')
        anchor=self.full_score(self.cache[self.progress['transfers'][0]['key']])
        if phase=='local':
            branches={row['key']:self.cache[row['key']] for row in self.progress['transfers']}
            moves=((r['key'][:10]+'/'+label,s) for r in branches.values() for label,s in self.rhyme_moves(r['state']))
        elif phase=='beam':
            rows=sorted(self.cache.values(),key=lambda r:(r['metrics']['ckt'],r['key']))
            eligible=[r for r in rows if self.fits(r['metrics'],'speed',peaks=True)]
            balanced=[r for r in rows if self.fits(r['metrics'],'balanced',peaks=True)]
            diagnostic_balanced=[r for r in rows if self.fits(r['metrics'],'balanced')]
            branches={r['key']:r for r in rows[:1]+eligible[:1]+balanced[:1]+diagnostic_balanced[:1]}
            moves=((r['key'][:10]+'/'+label,s) for r in branches.values() for label,s in self.rhyme_moves(r['state']))
        elif phase=='joint':
            rows=sorted(self.cache.values(),key=lambda r:(r['metrics']['ckt'],r['key']))
            balanced=[r for r in rows if self.fits(r['metrics'],'balanced',peaks=True)]
            speed=[r for r in rows if self.fits(r['metrics'],'speed',peaks=True)]
            diagnostic_balanced=[r for r in rows if self.fits(r['metrics'],'balanced')]
            branches={r['key']:r for r in rows[:2]+speed[:1]+balanced[:1]+diagnostic_balanced[:2]};rng=random.Random(21212417)
            def generated():
                for i in range(20000):
                    s=copy.deepcopy(rng.choice(list(branches.values()))['state'])
                    for _ in range(rng.randint(2,5)):
                        if rng.random()<.3:
                            a,b=rng.sample(range(18),2);s['partition'][a],s['partition'][b]=s['partition'][b],s['partition'][a]
                        elif rng.random()<.2:s['partition'][rng.randrange(18)]=rng.randrange(10)
                        elif rng.random()<.5:
                            row=s['groupKeys'][rng.randrange(3)];a,b=rng.sample(range(10),2);row[a],row[b]=row[b],row[a]
                        else:
                            r=rng.randrange(3);s['groupKeys'][r][rng.randrange(10)]=rng.choice(self.space.f['toneRegions'][r]['keys'])
                    yield f'joint:{i}',s
            moves=generated()
        else:raise ValueError(phase)
        limit=min(1000,max(0,6000-len(self.cache)))
        candidates=list(itertools.islice(self.candidates(moves),limit)) if phase=='joint' else list(self.candidates(moves))
        if len(self.cache)+len({r['key'] for r in candidates}-self.cache.keys())>6000:raise ValueError('6000-state budget exceeded')
        scored,fresh=self.score_batch(phase,candidates,anchor)
        record=dict(phase=phase,branches=list(branches),candidateKeys=[r['key'] for r in candidates],considered=len(candidates),fresh=fresh,
            qualified={p:sum(self.fits(r['metrics'],p,peaks=True) for r in scored) for p in self.profiles},
            bestCkt=min((r['metrics']['ckt'] for r in scored),default=None))
        if phase=='joint':record['candidateLimit']=limit;record['randomSeed']=21212417
        self.progress['rounds'].append(record);atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps(record|dict(candidateKeys='saved')),flush=True)

    def export(self):
        source=read(SOURCE);rows=sorted(self.cache.values(),key=lambda r:(r['metrics']['ckt'],r['key']));reps=[('diagnostic_minimum',rows[0])]
        for profile in self.profiles:
            # This envelope is a diagnostic only: the original left guard is NOT changed.
            envelope=[r for r in rows if self.fits(r['metrics'],profile) and r['metrics']['pinky']<=.09060178865841471+1e-12 and
                r['metrics']['rightPinky']<=self.profiles[profile]['rightPinkyCeiling']+1e-12]
            if envelope:reps.append(('diagnostic_lan_baseline_envelope_'+profile,envelope[0]))
        for profile in self.profiles:
            qualified=[r for r in rows if self.fits(r['metrics'],profile,peaks=True)]
            if qualified:reps.append(('best_'+profile,qualified[0]))
        reps.extend(('transfer_'+r['origin'][:10],self.cache[r['key']]) for r in self.progress['transfers'])
        layouts=[]
        for role,row in reps:
            old=next((l for l in layouts if l['key']==row['key']),None)
            if old:old['roles'].append(role);continue
            checked=self.full_score(row);layout=make_layout(self.space,row['state'],checked['metrics'],source['tokenKeys'],'CRLAN-'+row['key'][:10])
            layout.update(roles=[role],qualifiedProfiles=[p for p in self.profiles if self.fits(checked['metrics'],p,peaks=True)])
            layouts.append(layout)
        archive=Path(str(PREFIX)+'-scores.json.gz');archive.write_bytes(gzip.compress(json.dumps(dict(lan=self.cache),ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
        coverage=dict(word3LeftMinimum=min(r['metrics']['pinkyTracks'][2] for r in rows),
            word3LeftMaximum=max(r['metrics']['pinkyTracks'][2] for r in rows),
            qualified={p:sum(self.fits(r['metrics'],p,peaks=True) for r in rows) for p in self.profiles},
            memoryHistogram={str(m):sum(r['metrics']['m']==m for r in rows) for m in range(18,25)},
            changedGroupings=sum(r['state']['partition']!=self.cache[self.progress['transfers'][0]['key']]['state']['partition'] for r in rows))
        atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-lan-fixed-v1',tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],
            layouts=layouts,contract=self.progress['contract'],profiles=self.profiles,transfers=self.progress['transfers'],stages=self.progress['rounds'],
            sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [Path(__file__),SOURCE,ROOT/'tools/prepare_cr_m24_portfolio.py',ROOT/'tools/explore_cr_frontier_followup.py']},
            evaluatedStates=len(self.cache),coverage=coverage,rootInternalSplits=0,scoreArchive=dict(file=archive.name,sha256=sha(archive))))
        atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps([dict(key=l['key'][:10],roles=l['roles'],metrics=l['metrics'],qualified=l['qualifiedProfiles']) for l in layouts]),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--phase',choices=['transfer','local','beam','joint','export'],default='transfer');a=p.parse_args()
    s=LanSearch();lock=lock_run(s.output)
    try:
        if a.phase=='transfer':s.transfers()
        elif a.phase=='export':s.export()
        else:s.stage(a.phase)
    finally:
        if s.engine:s.engine.close()
        lock.close()


if __name__=='__main__':main()
