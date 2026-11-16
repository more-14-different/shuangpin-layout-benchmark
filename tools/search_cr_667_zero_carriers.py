"""Explore common A/E/O carrier and compensated W/Y moves with derived M-T1."""
import argparse
import copy
import gzip
import hashlib
import itertools
import json
from pathlib import Path

from explore_cr_stable_neighbors import StableNeighbors
from explore_cr_frontier_followup import local_moves
from run_cr_anneal import ROOT,SearchSpace,atomic_json,lock_run

PARENT='f0ae939a38'
SOURCE=ROOT/'research/notes/2026-11-16-cr-balanced-followup-finalists.json'
PREFIX=ROOT/'research/notes/2026-11-17-cr-667-zero-carriers'
OUTPUT=ROOT/'research/.cache/cr-667-zero-carriers-20261117'


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class CarrierSpace(SearchSpace):
    MEMORY_MODEL='M-T1-derived-carrier-associations-v1'

    def memory(self,state):
        physical=super().memory(state)
        if physical is None:return None
        by_name={a['name']:state['firstKeys'][i] for i,a in enumerate(self.f['atoms'])}
        ordinary=sum(len(a['initial'])==1 and a['initial']!='_' and state['firstKeys'][i]!=a['baselineKey']
            for i,a in enumerate(self.f['atoms']))
        carriers=len({by_name['zero-'+name] for name in ['A','E','O']})
        wy=sum(by_name['zero-'+name]!=name for name in ['W','Y'])
        retroflex=sum(name in by_name for name in ['zh','ch','sh'])
        merges=sum(10-len(set(row)) for row in state['groupKeys'])
        common=retroflex+1+ordinary+carriers+wy+merges
        rules=sum(state['partition'].count(g)>1 for g in range(10))
        return dict(d=ordinary,m=common+rules,guard=common+8)


def carrier_moves(state,space):
    indices={a['name']:i for i,a in enumerate(space.f['atoms'])}
    displaced=[i for i,a in enumerate(space.f['atoms']) if len(a['initial'])==1 and a['initial']!='_'
        and state['firstKeys'][i]!=a['baselineKey']]
    w,y=(indices['zero-'+name] for name in ['W','Y'])
    configurations=[('wy-unchanged',[])]
    for idx,name in [(w,'W'),(y,'Y')]:
        for target in space.allowed_first:
            if target==state['firstKeys'][idx]:continue
            for restored in displaced:
                configurations.append((f'{name}>{target}/restore:{space.f["atoms"][restored]["name"]}',
                    [(idx,target),(restored,space.f['atoms'][restored]['baselineKey'])]))
    # Both carrier moves need two refunded ordinary-onset rules at 667.
    for tw,ty in itertools.product(space.allowed_first,repeat=2):
        if tw==state['firstKeys'][w] or ty==state['firstKeys'][y]:continue
        configurations.append((f'W>{tw}/Y>{ty}/restore-both',[(w,tw),(y,ty)]+
            [(i,space.f['atoms'][i]['baselineKey']) for i in displaced]))
    for target in space.allowed_first:
        for description,changes in configurations:
            s=copy.deepcopy(state)
            for name in ['A','E','O']:s['firstKeys'][indices['zero-'+name]]=target
            for idx,key in changes:s['firstKeys'][idx]=key
            if s!=state:yield f'zero-common:AEO>{target}/{description}',s


def carrier_category(state,anchor,space):
    names={a['name']:i for i,a in enumerate(space.f['atoms'])}
    changed=lambda name:state['firstKeys'][names['zero-'+name]]!=anchor['firstKeys'][names['zero-'+name]]
    if changed('W') and changed('Y'):return 'WY'
    if changed('W'):return 'W'
    if changed('Y'):return 'Y'
    return 'AEO' if any(changed(name) for name in 'AEO') else 'unchanged'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase',choices=['prepare','carriers','refine','category-refine','export'],default='carriers')
    parser.add_argument('--workers',type=int,default=12);args=parser.parse_args()
    if not 1<=args.workers<=16:parser.error('workers must be 1 to 16')
    source=read(SOURCE);anchor=source['layouts'][0]
    if not anchor['key'].startswith('667610a3fc'):raise ValueError('wrong center')
    s=StableNeighbors(OUTPUT,PARENT,anchor=anchor,space_class=CarrierSpace);s.workers=args.workers;lock=lock_run(s.output)
    try:
        contract=dict(version='cr-667-zero-carriers-v1',centerKey=anchor['key'],memoryModel=CarrierSpace.MEMORY_MODEL,
            constraints=s.profiles[PARENT],sourceSha256=sha(SOURCE),budget=5000)
        path=s.output/'zero-contract.json'
        if path.exists() and read(path)!=contract:raise ValueError('changed carrier experiment')
        atomic_json(path,contract)
        if args.phase in ['prepare','carriers']:
            candidates=list(s.candidates(anchor['state'],s.profiles[PARENT],carrier_moves(anchor['state'],s.space)))
        elif args.phase in ['refine','category-refine']:
            stage=next(r for r in s.progress['rounds'] if r['phase']=='zero-carriers')
            ordered=sorted((s.cache[k] for k in stage['candidateKeys']),key=lambda r:(r['metrics']['ckt'],r['key']))
            near=ordered[:5] if args.phase=='refine' else [next(r for r in ordered
                if carrier_category(r['state'],anchor['state'],s.space)==category) for category in ['W','Y','WY']]
            candidates=list(s.candidates(anchor['state'],s.profiles[PARENT],(
                (f'carrier-refine:{row["key"][:10]}/{label}',state) for row in near
                for label,state in local_moves(row['state'],s.space)
                if state['partition']==anchor['state']['partition'])))
        if args.phase=='prepare':
            print(json.dumps(dict(candidates=len(candidates),M={str(m):sum(r['metrics']['m']==m for r in candidates)
                for m in range(18,23)},center=s.space.memory(anchor['state']))),flush=True);return
        if args.phase!='export':
            if len(s.cache)+len({r['key'] for r in candidates}-s.cache.keys())>5001:raise ValueError('5000-state budget exceeded')
            center=s.full_score(s.seeds[PARENT])
            for field in ['ckt','pinky','daily']:
                if abs(center['metrics'][field]-anchor['metrics'][field])>1e-9:raise ValueError('667 calibration mismatch')
            phase={'carriers':'zero-carriers','refine':'carrier-refine','category-refine':'category-refine'}[args.phase]
            scored,fresh=s.score_batch(phase,candidates,center)
            winner=s.select(scored,PARENT,center)
            s.progress['centers'][PARENT]=winner
            record=dict(phase=phase,centerKey=anchor['key'],candidateKeys=[r['key'] for r in candidates],
                available=len(candidates),considered=len(candidates),fresh=fresh,before=anchor['rustScore'],
                after=winner['metrics']['ckt'],winner=winner['key'])
            record['carrierCategories']={name:sum(carrier_category(r['state'],anchor['state'],s.space)==name for r in candidates)
                for name in ['unchanged','AEO','W','Y','WY']}
            if args.phase in ['refine','category-refine']:record['branchKeys']=[r['key'] for r in near]
            s.progress['rounds'].append(record);atomic_json(s.cache_path,s.cache);atomic_json(s.state_path,s.progress)
            print(json.dumps(record|dict(candidateKeys='saved')),flush=True)
        else:
            if not s.progress['rounds']:raise ValueError('no carrier stages completed')
            ids={k for stage in s.progress['rounds'] for k in stage['candidateKeys']}
            center=s.full_score(s.seeds[PARENT]);winner=s.select([s.cache[k] for k in ids],PARENT,center)
            s.progress['centers'][PARENT]=winner
            layouts=[s.export_layout(source,representative=winner)];layouts[0]['role']='best_from_667'
            changed=[s.cache[k] for k in ids if carrier_category(s.cache[k]['state'],anchor['state'],s.space)!='unchanged']
            category_counts={}
            for category in ['AEO','W','Y','WY']:
                rows=[r for r in changed if carrier_category(r['state'],anchor['state'],s.space)==category]
                category_counts[category]=len(rows)
                if not rows:continue
                checked=s.full_score(min(rows,key=lambda r:(r['metrics']['ckt'],r['key'])))
                atomic_json(s.cache_path,s.cache)
                print(json.dumps(dict(verifiedCategory=category,key=checked['key'][:10],pinky=checked['metrics']['pinky'])),flush=True)
                existing=next((r for r in layouts if r['key']==checked['key']),None)
                if existing is not None:existing.setdefault('categoryBest',[]).append(category)
                else:
                    item=s.export_layout(source,representative=checked);item['role']='diagnostic_'+category
                    item['categoryBest']=[category];layouts.append(item)
            for item in layouts:
                item['uniqueScoredLayouts']=len(s.cache);item['fullyVerified']=sum(r['metrics'].get('verified',False) for r in s.cache.values())
                item['description']='Zero-carrier exploration anchored at 667610a3fc under 21/231/14'
                item['constraintsSatisfied']=item['metrics']['pinky']<=s.profiles[PARENT]['pinkyCeiling']+1e-12
                item['diagnosticOnly']=item['role'].startswith('diagnostic_')
            atomic_json(s.cache_path,s.cache);atomic_json(s.state_path,s.progress)
            archive=Path(str(PREFIX)+'-scores.json.gz')
            archive.write_bytes(gzip.compress(json.dumps({PARENT:s.cache},ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
            paths=[Path(__file__),SOURCE,ROOT/'tools/explore_cr_stable_neighbors.py',ROOT/'tools/explore_cr_frontier_followup.py',
                ROOT/'tools/run_cr_anneal.py',ROOT/'research/config/cr-anneal-inputs.zip',
                ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe',ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe']
            atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-667-zero-carriers-v1',
                tokenKeys=source['tokenKeys'],firstAtomNames=source['firstAtomNames'],layouts=layouts,stages=s.progress['rounds'],
                contract=contract,contracts={PARENT:s.progress['contract']},evaluatedStates=len(s.cache),
                firstTierRawEndpoints=10100,carrierCategories=category_counts,rootInternalSplits=0,
                representatives='qualified global winner plus category CKT minima as diagnostics; category minima may violate pinky ceiling',
                sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},
                scoreArchive=dict(file=archive.name,sha256=sha(archive))))
            print(json.dumps([dict(role=r['role'],key=r['key'][:10],score=r['rustScore'],daily=r['metrics']['daily'],M=r['metrics']['m'])
                for r in layouts]),flush=True)
    finally:
        if s.engine:s.engine.close()
        lock.close()


if __name__=='__main__':main()
