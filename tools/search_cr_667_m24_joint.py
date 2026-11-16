"""M24/26 whole-group and onset search with two native pinky guards."""
import argparse
import copy
import gzip
import itertools
import json
import random
from pathlib import Path

from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_frontier_followup import paired_moves
from search_cr_667_zero_carriers import CarrierSpace,PARENT,SOURCE,read,sha
from run_cr_anneal import ROOT,atomic_json,lock_run

PREFIX=ROOT/'research/notes/2026-11-17-cr-667-m24-d2-joint'
OUTPUT=ROOT/'research/.cache/cr-667-m24-d2-joint-20261117'
COMPATIBLE=ROOT/'research/.cache/cr-667-m24-joint-20261117'/PARENT
BASE_NATIVE=ROOT/'research/notes/2026-11-17-cr-667-zero-carriers-native.json'
KNOWN87=ROOT/'research/notes/2026-11-17-cr-667-neighbors-finalists.json'
KNOWN87_NATIVE=ROOT/'research/notes/2026-11-17-cr-667-neighbors-native.json'


def families(state,anchor,space):
    changed=set()
    for i,a in enumerate(space.f['atoms']):
        if state['firstKeys'][i]!=anchor['firstKeys'][i]:
            changed.add('zero' if a['name'].startswith('zero-') else 'retro' if a['name'] in ['zh','ch','sh'] else 'ordinary')
    if state['groupKeys']!=anchor['groupKeys']:changed.add('rhyme')
    return changed


def local_moves(state,space,*,full_zero=False):
    for i,a in enumerate(space.f['atoms']):
        for target in space.allowed_first:
            if target!=state['firstKeys'][i]:
                s=copy.deepcopy(state);s['firstKeys'][i]=target
                yield 'first:'+a['name']+'>'+target,s
    for a,b in itertools.combinations(range(len(state['firstKeys'])),2):
        if state['firstKeys'][a]!=state['firstKeys'][b]:
            s=copy.deepcopy(state);s['firstKeys'][a],s['firstKeys'][b]=s['firstKeys'][b],s['firstKeys'][a]
            yield f'first-swap:{a}/{b}',s
    for region,row in enumerate(state['groupKeys']):
        for a,b in itertools.combinations(range(10),2):
            if row[a]!=row[b]:
                s=copy.deepcopy(state);s['groupKeys'][region][a],s['groupKeys'][region][b]=row[b],row[a]
                yield f'whole-group-swap:{region}/{a}/{b}',s
    for a,b in itertools.combinations(range(10),2):
        s=copy.deepcopy(state)
        for row in s['groupKeys']:row[a],row[b]=row[b],row[a]
        if s!=state:yield f'whole-group-swap:all/{a}/{b}',s
    indices={a['name']:i for i,a in enumerate(space.f['atoms'])}
    if full_zero:
        targets=itertools.product(space.allowed_first,repeat=3)
    else:
        targets=((target,state['firstKeys'][indices['zero-W']],state['firstKeys'][indices['zero-Y']]) for target in space.allowed_first)
    for aeo,w,y in targets:
        s=copy.deepcopy(state)
        for name in 'AEO':s['firstKeys'][indices['zero-'+name]]=aeo
        s['firstKeys'][indices['zero-W']]=w;s['firstKeys'][indices['zero-Y']]=y
        if s!=state:yield f'zero-common:{aeo}/{w}/{y}',s
    if full_zero:
        for keys in itertools.product(space.allowed_first,repeat=3):
            s=copy.deepcopy(state)
            for name,key in zip('AEO',keys):s['firstKeys'][indices['zero-'+name]]=key
            if s!=state:yield 'zero-split:'+''.join(keys),s


class JointSearch(StableNeighbors):
    def __init__(self):
        self.anchor=read(SOURCE)['layouts'][0]
        super().__init__(OUTPUT,PARENT,anchor=self.anchor,space_class=CarrierSpace)
        native=read(BASE_NATIVE)['results'][0]['fixed']['ergonomics']
        self.profiles[PARENT].update(maxM=24,rightPinkyCeiling=native['rightPinkyPeak4NativeTracks']['value'])
        self.score_max_d=2;self.score_max_m=24;self.track_pinkies=True;self.workers=12
        contract=dict(self.progress['contract'],version='cr-667-m24-d2-joint-v1',maxD=2,maxGuard=26,
            wholeGroupSwapsOnly=True,baseNativeSha256=sha(BASE_NATIVE),budget=10000,
            incrementalSha256=sha(ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe'),
            fullScorerSha256=sha(ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe'))
        self.state_path=self.output/'joint-state.json'
        if self.state_path.exists():
            self.progress=read(self.state_path)
            if self.progress['contract']!=contract or self.progress['profiles']!=self.profiles:raise ValueError('changed joint search contract')
        else:self.progress=dict(contract=contract,profiles=self.profiles,centers=copy.deepcopy(self.seeds),rounds=[])

    def fits(self,m,*,peaks=False):
        p=self.profiles[PARENT]
        return (m['m']<=24 and m['guard']<=26 and m['d']<=2 and
            (not peaks or (m['daily']+1e-10>=p['dailyFloor'] and m['pinky']<=p['pinkyCeiling']+1e-12 and
             m['rightPinky']<=p['rightPinkyCeiling']+1e-12)))

    def candidates(self,state,profile,moves):
        seen=set()
        for label,s in moves:
            if s['partition']!=self.anchor['state']['partition']:raise ValueError('group membership changed')
            if any(sorted(a)!=sorted(b) for a,b in zip(s['groupKeys'],self.anchor['state']['groupKeys'])):
                raise ValueError('rhyme move rather than whole-group exchange')
            m=self.space.memory(s)
            if not m or not self.fits(m):continue
            key=self.space.key(s)
            if key in seen:continue
            seen.add(key);daily=self.space.daily(s)
            if daily['daily']+1e-10<profile['dailyFloor']:continue
            yield dict(key=key,state=s,label=label,metrics=dict(m,**daily))

    def full_score(self,item):
        before=self.cache.get(item['key'],item)['metrics']
        result=super().full_score(item)
        for field in ['pinky','rightPinky']:
            if field in before and abs(before[field]-result['metrics'][field])>1e-9:raise ValueError('incremental/full '+field+' mismatch')
        return result

    def select(self,candidates,name,center):
        rows=sorted((r for r in candidates if self.fits(r['metrics'],peaks=True)),key=lambda r:(r['metrics']['ckt'],r['key']))
        if rows and rows[0]['metrics']['ckt']<center['metrics']['ckt']-1e-10:return self.full_score(rows[0])
        return center

    def import_compatible(self,candidates):
        if not (COMPATIBLE/'cache.json').exists():return dict(count=0)
        previous=read(COMPATIBLE/'joint-state.json');old=read(COMPATIBLE/'cache.json')
        for field in ['incrementalSha256','fullScorerSha256','corpusSha256','memoryModel','wordAuxiliaryPolicy']:
            if previous['contract'][field]!=self.progress['contract'][field]:raise ValueError('incompatible score import '+field)
        count=0
        for row in candidates:
            key=row['key']
            if key in self.cache or key not in old:continue
            imported=old[key]
            if imported['state']!=row['state'] or not self.fits(imported['metrics']):raise ValueError('invalid D2 score reuse')
            for field in ['m','guard','d','daily']:
                if abs(row['metrics'][field]-imported['metrics'][field])>1e-9:raise ValueError('import metrics mismatch')
            self.cache[key]=dict(row,metrics=copy.deepcopy(imported['metrics']));count+=1
        atomic_json(self.cache_path,self.cache)
        return dict(count=count,source=(COMPATIBLE/'cache.json').relative_to(ROOT).as_posix(),sha256=sha(COMPATIBLE/'cache.json'))

    def run_stage(self,phase):
        anchor=self.full_score(self.seeds[PARENT]);center=self.full_score(self.progress['centers'][PARENT])
        record=dict(phase=phase,branchKeys=[])
        if phase=='local':moves=local_moves(self.anchor['state'],self.space,full_zero=True)
        elif phase=='coupled':
            stage=next(r for r in self.progress['rounds'] if r['phase']=='local')
            rows=sorted((self.cache[k] for k in stage['candidateKeys']),key=lambda r:(r['metrics']['ckt'],r['key']))
            selected={name:[r for r in rows if families(r['state'],self.anchor['state'],self.space)=={name}][:16]
                for name in ['retro','ordinary','rhyme']}
            wy=[i for i,a in enumerate(self.space.f['atoms']) if a['name'] in ['zero-W','zero-Y']]
            for kind,has_wy in [('zero_aeo',False),('zero_wy',True)]:
                selected[kind]=[r for r in rows if families(r['state'],self.anchor['state'],self.space)=={'zero'} and
                    any(r['state']['firstKeys'][i]!=self.anchor['state']['firstKeys'][i] for i in wy)==has_wy][:16]
            selected['mixed']=[r for r in rows if len(families(r['state'],self.anchor['state'],self.space))>1][:16]
            record['families']={name:[r['key'] for r in group] for name,group in selected.items()}
            moves=(move for a,b in itertools.combinations(selected,2)
                for x in selected[a] for y in selected[b] for move in paired_moves(self.anchor['state'],[x,y]))
        elif phase=='beam':
            ordered=sorted(self.cache.values(),key=lambda r:(r['metrics']['ckt'],r['key']))
            eligible=[r for r in ordered if self.fits(r['metrics'],peaks=True)]
            zero=[r for r in ordered if 'zero' in families(r['state'],self.anchor['state'],self.space)]
            branches={r['key']:r for r in eligible[:2]+ordered[:1]+zero[:1]}
            record['branchKeys']=list(branches)
            moves=((r['key'][:10]+'/'+label,state) for r in branches.values() for label,state in local_moves(r['state'],self.space))
        elif phase=='zero-refine':
            indices={a['name']:i for i,a in enumerate(self.space.f['atoms'])}
            def split_with_wy(row):
                first=row['state']['firstKeys']
                return len({first[indices['zero-'+name]] for name in 'AEO'})>1 and any(
                    first[indices['zero-'+name]]!=name for name in ['W','Y'])
            rows=sorted((r for r in self.cache.values() if split_with_wy(r)),key=lambda r:(r['metrics']['ckt'],r['key']))
            eligible=[r for r in rows if self.fits(r['metrics'],peaks=True)]
            branches={r['key']:r for r in eligible[:1]+rows[:1]}
            record['branchKeys']=list(branches)
            moves=((r['key'][:10]+'/'+label,state) for r in branches.values() for label,state in local_moves(r['state'],self.space))
        elif phase=='joint':
            ordered=sorted(self.cache.values(),key=lambda r:(r['metrics']['ckt'],r['key']))
            bases=[center]+ordered[:3];record['branchKeys']=[r['key'] for r in bases];record['randomSeed']=66724026
            rng=random.Random(record['randomSeed']);indices={a['name']:i for i,a in enumerate(self.space.f['atoms'])}
            special=[i for i,a in enumerate(self.space.f['atoms']) if a['name'].startswith('zero-') or a['name'] in ['zh','ch','sh']]
            def random_moves():
                for attempt in range(30000):
                    s=copy.deepcopy(rng.choice(bases)['state'])
                    for _ in range(rng.randint(1,4)):
                        if rng.random()<.25:
                            key=rng.choice(self.space.allowed_first)
                            for name in 'AEO':s['firstKeys'][indices['zero-'+name]]=key
                        elif rng.random()<.5:
                            pool=special if rng.random()<.75 else list(range(len(s['firstKeys'])))
                            a,b=rng.sample(pool,2);s['firstKeys'][a],s['firstKeys'][b]=s['firstKeys'][b],s['firstKeys'][a]
                        else:
                            pool=special if rng.random()<.75 else list(range(len(s['firstKeys'])))
                            s['firstKeys'][rng.choice(pool)]=rng.choice(self.space.allowed_first)
                    for _ in range(rng.randint(1,3)):
                        row=s['groupKeys'][rng.randrange(3)];a,b=rng.sample(range(10),2);row[a],row[b]=row[b],row[a]
                    yield f'joint:{attempt}',s
            moves=random_moves()
        else:raise ValueError(phase)
        if phase=='joint':
            limit=min(1000,max(0,10001-len(self.cache)));record['candidateLimit']=limit
            candidates=list(itertools.islice(self.candidates(center['state'],self.profiles[PARENT],moves),limit))
        else:candidates=list(self.candidates(center['state'],self.profiles[PARENT],moves))
        if phase=='zero-refine' and len(self.cache)+len({r['key'] for r in candidates}-self.cache.keys())>10001 and len(branches)>1:
            branch=next(iter(branches.values()));record['branchKeys']=[branch['key']]
            candidates=list(self.candidates(center['state'],self.profiles[PARENT],local_moves(branch['state'],self.space)))
        if phase=='local':record['compatibleReuse']=self.import_compatible(candidates)
        missing={r['key'] for r in candidates}-self.cache.keys()
        if len(self.cache)+len(missing)>10001:raise ValueError('10000 new-layout budget exceeded')
        scored,fresh=self.score_batch(phase,candidates,anchor);winner=self.select(scored,PARENT,center)
        self.progress['centers'][PARENT]=winner
        record.update(candidateKeys=[r['key'] for r in candidates],considered=len(candidates),fresh=fresh,
            before=center['metrics']['ckt'],after=winner['metrics']['ckt'],winner=winner['key'],
            eligible=sum(self.fits(r['metrics'],peaks=True) for r in scored))
        self.progress['rounds'].append(record);atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps(record|dict(candidateKeys='saved')),flush=True)

    def export(self):
        source=read(SOURCE);anchor=self.full_score(self.seeds[PARENT]);rows=sorted(self.cache.values(),key=lambda r:(r['metrics']['ckt'],r['key']))
        winner=self.select(rows,PARENT,anchor);representatives=[('best_qualified',winner)]
        improving=[r for r in rows if self.fits(r['metrics'],peaks=True) and r['metrics']['ckt']<anchor['metrics']['ckt']-1e-10]
        if improving:
            representatives.append(('best_qualified_daily',max(improving,key=lambda r:(r['metrics']['daily'],-r['metrics']['ckt']))))
            cheaper=[r for r in improving if r['metrics']['m']<=23 and r['metrics']['guard']<=25]
            if cheaper:representatives.append(('best_qualified_M23',cheaper[0]))
        zeros=[r for r in rows if 'zero' in families(r['state'],self.anchor['state'],self.space)]
        eligible_zero=[r for r in zeros if self.fits(r['metrics'],peaks=True)]
        if eligible_zero:representatives.append(('best_qualified_zero',eligible_zero[0]))
        indices={a['name']:i for i,a in enumerate(self.space.f['atoms'])}
        def split_and_wy(row):
            first=row['state']['firstKeys']
            return len({first[indices['zero-'+name]] for name in 'AEO'})>1 and any(
                first[indices['zero-'+name]]!=name for name in ['W','Y'])
        eligible_combined=[r for r in eligible_zero if split_and_wy(r)]
        if eligible_combined:representatives.append(('best_qualified_split_and_WY',eligible_combined[0]))
        combined=[r for r in zeros if split_and_wy(r)]
        if combined:representatives.append(('diagnostic_split_and_WY',combined[0]))
        if zeros:representatives.append(('diagnostic_zero_minimum',zeros[0]))
        representatives.append(('diagnostic_unconstrained_minimum',rows[0]))
        representatives.append(('baseline_667',anchor))
        layouts=[]
        for role,row in representatives:
            old=next((r for r in layouts if r['key']==row['key']),None)
            if old is not None:old['roles'].append(role);continue
            checked=self.full_score(row);item=self.export_layout(source,representative=checked)
            item.update(roles=[role],constraintsSatisfied=self.fits(checked['metrics'],peaks=True),
                changedFamilies=sorted(families(row['state'],self.anchor['state'],self.space)),
                description='667 M24/26 onset and whole-rhyme-group search with two pinky guards')
            layouts.append(item)
        archive=Path(str(PREFIX)+'-scores.json.gz');archive.write_bytes(gzip.compress(json.dumps({PARENT:self.cache},ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
        historical=read(KNOWN87);known=historical['layouts'][0]
        if not known['key'].startswith('87de6cc69c') or historical['contracts'][PARENT]['corpusSha256']!=self.progress['contract']['corpusSha256']:
            raise ValueError('incomparable historical reference')
        known_native=next(r for r in read(KNOWN87_NATIVE)['results'] if r['id']==known['id'])
        e=known_native['fixed']['ergonomics']
        known_metrics=dict(known['metrics'],ckt=known_native['fixed']['score'],
            pinky=e['leftPinkyQAZPeak4NativeTracks']['value'],rightPinky=e['rightPinkyPeak4NativeTracks']['value'])
        comparison=dict(key=known['key'],metrics=known_metrics,constraintsSatisfied=self.fits(known_metrics,peaks=True),
            provenance='historical independent JS native replay; same fixed policy and adapted corpus hash; not imported as a search center')
        coverage=dict(familyChanges={name:sum(name in families(r['state'],self.anchor['state'],self.space) for r in rows)
                for name in ['zero','retro','ordinary','rhyme']},
            splitAndWY=len(combined),qualifiedSplitAndWY=len(eligible_combined),
            qualified=sum(self.fits(r['metrics'],peaks=True) for r in rows),
            improvingQualified=len(improving),
            memoryHistogram={str(m):sum(r['metrics']['m']==m for r in rows) for m in range(18,25)})
        retro_to_p=[r for r in rows if any(r['state']['firstKeys'][indices[name]]=='P' and
            self.anchor['state']['firstKeys'][indices[name]]!='P' for name in ['zh','ch','sh'])]
        coverage['retroMovedToP']=dict(scored=len(retro_to_p),qualified=sum(self.fits(r['metrics'],peaks=True) for r in retro_to_p))
        coverage['pinkyRejections']=dict(left=sum(r['metrics']['pinky']>self.profiles[PARENT]['pinkyCeiling']+1e-12 for r in rows),
            right=sum(r['metrics']['rightPinky']>self.profiles[PARENT]['rightPinkyCeiling']+1e-12 for r in rows))
        paths=[Path(__file__),SOURCE,BASE_NATIVE,ROOT/'tools/search_cr_667_zero_carriers.py',ROOT/'tools/explore_cr_frontier_followup.py',
            ROOT/'tools/explore_cr_stable_neighbors.py',ROOT/'research/config/cr-anneal-inputs.zip',
            ROOT/'research/ckt-v4-core/src/pinky.rs',ROOT/'research/ckt-v4-core/src/bin/audit-toned-rhyme-neighbors.rs',
            ROOT/'research/ckt-v4-core/src/bin/score-toned-stream.rs',KNOWN87,KNOWN87_NATIVE]
        atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-667-m24-d2-joint-v1',tokenKeys=source['tokenKeys'],
            firstAtomNames=source['firstAtomNames'],layouts=layouts,stages=self.progress['rounds'],constraints=self.profiles[PARENT],
            contract=self.progress['contract'],rootInternalSplits=0,evaluatedStates=len(self.cache),
            knownReference87=comparison,
            coverage=coverage,
            sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},scoreArchive=dict(file=archive.name,sha256=sha(archive))))
        atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps([dict(key=r['key'][:10],roles=r['roles'],metrics=r['metrics'],qualified=r['constraintsSatisfied']) for r in layouts]),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--phase',choices=['calibrate','local','coupled','beam','joint','zero-refine','export'],default='local');args=p.parse_args()
    s=JointSearch();lock=lock_run(s.output)
    try:
        if args.phase=='calibrate':
            row=s.full_score(s.seeds[PARENT]);native=read(BASE_NATIVE)['results'][0]['fixed']['ergonomics']
            for name,key in [('pinky','leftPinkyQAZPeak4NativeTracks'),('rightPinky','rightPinkyPeak4NativeTracks')]:
                if abs(row['metrics'][name]-native[key]['value'])>1e-9:raise ValueError('baseline '+name+' mismatch')
            atomic_json(s.cache_path,s.cache);atomic_json(s.state_path,s.progress);print(json.dumps(row['metrics']),flush=True)
        elif args.phase=='export':s.export()
        else:s.run_stage(args.phase)
    finally:
        if s.engine:s.engine.close()
        lock.close()


if __name__=='__main__':main()
