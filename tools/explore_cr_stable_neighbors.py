"""Finite sound-layout search at the published stable auxiliary policies."""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import struct

from explore_cr_frontier_followup import Followup,local_moves
from run_cr_anneal import ROOT, SearchSpace, unpack, atomic_json, digest, lock_run

PREFIX=ROOT/'research/notes/2026-11-16-cr-stable-neighbors'
OUTPUT=ROOT/'research/.cache/cr-stable-neighbors-20261116'
PARENTS=['0a4ee7fb52','3d3dcbafc0','29ce221cfe']
SUPPORTED_PARENTS=PARENTS+['f0ae939a38']
LAYOUTS=ROOT/'research/notes/2026-11-16-cr-frontier-followup-finalists.json'
STABILITY=ROOT/'research/notes/2026-11-16-cr-toned-stable-policies.json'


def shape_permutation(order,n,baseline):
    requested=[int(p)-1 for p in order]
    if len(requested)!=len(baseline) or len(set(requested))!=len(requested) or any(p<0 or p>=n for p in requested):
        raise ValueError('invalid word auxiliary shape order')
    result=[None]*n
    for old,new in zip(baseline,requested,strict=True):
        result[old]=new
    remaining=iter(i for i in range(n) if i not in requested)
    return [next(remaining) if v is None else v for v in result]


def adapt_shape_corpus(content,policy):
    """Reorder ONLY word shape slots for the scorer's fixed 12/213/24 readers.

    This is a policy-specific scoring view, not a different word dictionary.
    Pinyin, tones, weights, word order and character bytes are unchanged.
    """
    if content[:8]!=b'CKTV4COR' or struct.unpack_from('<HH',content,8)!=(2,0):
        raise ValueError('requires native corpus v2 without flags')
    header_len=struct.unpack_from('<I',content,12)[0]
    header=json.loads(content[16:16+header_len])
    if 'shapePolicyAdapter' in header:
        raise ValueError('refusing to adapt an already adapted shape corpus')
    body=bytearray(content[16+header_len:]);counts=struct.unpack_from('<IIII',body,0)
    if tuple(header['counts'][k] for k in ['character','word2','word3','word4'])!=counts:
        raise ValueError('header/body counts mismatch')
    offset=16
    for _ in range(counts[0]):
        size=struct.unpack_from('<H',body,offset)[0];offset+=2+size+2+1+8+2+1
    changed=0
    for n,count,baseline in [(2,counts[1],[0,1]),(3,counts[2],[1,0,2]),(4,counts[3],[1,3])]:
        permutation=shape_permutation(policy['word'+str(n)],n,baseline)
        for _ in range(count):
            start=offset+3*n+8;old=body[start:start+n]
            if len(old)!=n:
                raise ValueError('truncated native word template')
            new=bytes(old[i] for i in permutation)
            changed+=new!=old;body[start:start+n]=new;offset=start+n
    if offset+4!=len(body) or struct.unpack_from('<I',body,offset)[0]!=0xc4c0ca5e:
        raise ValueError('native end marker mismatch')
    header['shapePolicyAdapter']=dict(version=1,wordAuxiliaryPolicy=policy,
        readerPolicy='12/213/24',sourceSha256=hashlib.sha256(content).hexdigest(),
        semantic='shape slot permutation only; pinyin/tone/weight/order/characters unchanged')
    encoded=json.dumps(header,ensure_ascii=False,separators=(',',':')).encode('utf8')
    return content[:12]+struct.pack('<I',len(encoded))+encoded+body,dict(changedWordShapes=changed,counts=list(counts))


class StableNeighbors(Followup):
    def __init__(self,output,parent,*,anchor=None):
        self.output=output/parent;self.output.mkdir(parents=True,exist_ok=True)
        bundle=json.loads(LAYOUTS.read_text(encoding='utf8'))
        stable=json.loads(STABILITY.read_text(encoding='utf8'))
        layout=next(r for r in bundle['layouts'] if r['key'].startswith(parent))
        selected=next(r for r in stable['results'] if r['id']==layout['id'])
        self.parent=parent;self.policy=selected['selectedPolicy']
        self.manifest=unpack(ROOT/'research/config/cr-anneal-inputs.zip',self.output/'inputs')
        corpus_path=self.output/'inputs/corpus.bin'
        corpus,audit=adapt_shape_corpus(corpus_path.read_bytes(),self.policy)
        corpus_path.write_bytes(corpus)
        self.space=SearchSpace(self.output/'inputs')
        metrics=dict(layout['metrics'],ckt=selected['selectedScore'],pinky=selected['selectedPinky'])
        # pinkyTracks from the former policy must never be reused as new evidence.
        metrics.pop('pinkyTracks',None)
        metrics['verified']=False
        self.seeds={parent:dict(key=layout['key'],state=layout['state'],metrics=metrics,origin=layout['id'])}
        self.profiles={parent:dict(maxM=metrics['m'],dailyFloor=0 if parent=='29ce221cfe' else metrics['daily'],
            pinkyCeiling=1 if parent=='29ce221cfe' else metrics['pinky'])}
        if anchor is not None:
            if anchor['parent']!=parent or anchor['wordAuxiliaryPolicy']!=self.policy or anchor['constraints']!=self.profiles[parent]:
                raise ValueError('pinned anchor changes the policy or constraints')
            if self.space.key(anchor['state'])!=anchor['key']:
                raise ValueError('pinned anchor state key mismatch')
            self.seeds={parent:dict(key=anchor['key'],state=copy.deepcopy(anchor['state']),
                metrics=copy.deepcopy(anchor['metrics']),origin=anchor['id'])}
        self.cache_path=self.output/'cache.json';self.state_path=self.output/'state.json'
        self.cache=json.loads(self.cache_path.read_text(encoding='utf8')) if self.cache_path.exists() else {}
        contract=dict(version='stable-neighbors-v1',bundle=digest(self.manifest),layouts=digest(bundle),stability=digest(stable),
            wordAuxiliaryPolicy=self.policy,corpusSha256=hashlib.sha256(corpus).hexdigest(),adapter=audit,
            maxD=2,maxGuard=24,shapeKeysByMeaning='AVUIO',toneKeysByTone='IVUAO',parent=parent)
        if anchor is not None:
            contract['pinnedAnchor']=dict(key=anchor['key'],digest=digest(self.seeds[parent]))
        self.progress=json.loads(self.state_path.read_text(encoding='utf8')) if self.state_path.exists() else dict(
            contract=contract,profiles=self.profiles,centers=copy.deepcopy(self.seeds),rounds=[])
        if self.progress['contract']!=contract or self.progress['profiles']!=self.profiles:
            raise ValueError('changed experiment inputs or constraints; use a new output')
        self.engine=None

    def export_layout(self,bundle):
        self.audit_seeds();self.cross_profile({})
        atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        item=self.full_score(self.progress['centers'][self.parent]);state=item['state'];f=self.space.f
        expanded=self.space.expand(state)
        decomposition=json.loads((ROOT/'research/config/ckt-v51-toned-2121-seeds.json').read_text(encoding='utf8'))['decomposition']
        finals={r['pinyin']:r['fullFinal'] for r in decomposition}
        first={py:i for i,a in enumerate(f['atoms']) for py in a['pinyin']}
        final={py:i for i,a in enumerate(f['rhymeAtoms']) for py in a['pinyin']}
        region={t:i for i,r in enumerate(f['toneRegions']) for t in r['tones']}
        groups=[]
        for g in range(10):
            pys=[py for i,a in enumerate(f['rhymeAtoms']) if state['partition'][self.space.spec['finalRoots'][i]]==g for py in a['pinyin']]
            groups.append(dict(roots=[r for i,r in enumerate(self.space.spec['roots']) if state['partition'][i]==g],
                finals=sorted({finals[f['pinyin'][py]] for py in pys}),
                keys={r['name']:state['groupKeys'][i][g] for i,r in enumerate(f['toneRegions'])}))
        token_pairs=[(py,t) for py,c in enumerate(f['tonedCodes']) for t,code in enumerate(c,1) if code]
        if [f['pinyin'][py]+str(t) for py,t in token_pairs]!=bundle['tokenKeys']:
            raise ValueError('token order mismatch')
        return dict(id='CRN-'+self.parent+'-'+item['key'][:10],parent=self.parent,
            profile='speed' if self.parent=='29ce221cfe' else ('balanced' if self.parent=='f0ae939a38' else 'daily'),key=item['key'],state=state,
            description='New stable-policy neighborhood search from '+self.parent,
            wordAuxiliaryPolicy=self.policy,rustScore=item['metrics']['ckt'],metrics=item['metrics'],
            before=self.seeds[self.parent]['metrics'],anchorKey=self.seeds[self.parent]['key'],constraints=self.profiles[self.parent],
            firstKeys={a['name']:state['firstKeys'][i] for i,a in enumerate(f['atoms'])},rhymeGroups=groups,
            memoryAudit=dict(ordinaryD=item['metrics']['d'],ordinaryF=0,memoryLower=item['metrics']['m'],memoryGuard=item['metrics']['guard']),
            tonedCodes=[expanded['firstKeys'][first[py]]+expanded['rhymeKeys'][region[t]][final[py]] for py,t in token_pairs],
            rounds=self.progress['rounds'],uniqueScoredLayouts=len(self.cache),
            fullyVerified=sum(r['metrics'].get('verified',False) for r in self.cache.values()))

    def transfer(self):
        """Rescore other routes' best sound layouts under THIS route's policy."""
        self.audit_seeds();center=self.full_score(self.progress['centers'][self.parent]);moves=[];sources={}
        for parent in PARENTS:
            path=self.output.parent/parent/'cache.json'
            if parent==self.parent or not path.exists():continue
            content=path.read_bytes();rows=json.loads(content).values()
            selected=sorted(rows,key=lambda r:r['metrics']['ckt'])[:20]
            sources[parent]=dict(sha256=hashlib.sha256(content).hexdigest(),keys=[r['key'] for r in selected])
            for row in selected:
                moves.append(('transfer:'+parent+'/'+row['key'][:10],row['state']))
        candidates=list(self.candidates(center['state'],self.profiles[self.parent],moves))
        scored,fresh=self.score_batch(f'{len(self.progress["rounds"])+1}-transfer-{self.parent}',candidates,center)
        winner=self.select(scored,self.parent,center);self.progress['centers'][self.parent]=winner
        item=dict(available=len(candidates),considered=len(candidates),fresh=fresh,
            before=center['metrics']['ckt'],after=winner['metrics']['ckt'],winner=winner['key'],metrics=winner['metrics'])
        record=dict(phase='transfer',seed=None,sources=sources,candidateKeys=[r['key'] for r in candidates],profiles={self.parent:item})
        self.cross_profile(record);self.progress['rounds'].append(record)
        atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps(dict(profile=self.parent,**item)),flush=True)

    def beam(self,width):
        """Expand complete one-step neighborhoods of the best scored local alternatives."""
        self.audit_seeds();center=self.full_score(self.progress['centers'][self.parent])
        local=list(self.candidates(center['state'],self.profiles[self.parent],local_moves(center['state'],self.space)))
        if any(r['key'] not in self.cache for r in local):
            raise ValueError('run local or polish at the current center before beam')
        branches=sorted((self.cache[r['key']] for r in local if r['key']!=center['key']),
            key=lambda r:(r['metrics']['ckt'],r['key']))[:width]
        def moves():
            for branch in branches:
                for label,state in local_moves(branch['state'],self.space):
                    yield 'beam:'+branch['key'][:10]+'/'+label,state
        candidates=list(self.candidates(center['state'],self.profiles[self.parent],moves()))
        scored,fresh=self.score_batch(f'{len(self.progress["rounds"])+1}-beam-{self.parent}',candidates,center)
        winner=self.select(scored,self.parent,center);self.progress['centers'][self.parent]=winner
        item=dict(available=len(candidates),considered=len(candidates),fresh=fresh,
            before=center['metrics']['ckt'],after=winner['metrics']['ckt'],winner=winner['key'],metrics=winner['metrics'])
        record=dict(phase='beam',seed=None,branchKeys=[r['key'] for r in branches],profiles={self.parent:item})
        self.cross_profile(record);self.progress['rounds'].append(record)
        atomic_json(self.cache_path,self.cache);atomic_json(self.state_path,self.progress)
        print(json.dumps(dict(profile=self.parent,**item)),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=OUTPUT)
    p.add_argument('--prefix',type=Path,default=PREFIX)
    p.add_argument('--parents',default=','.join(PARENTS))
    p.add_argument('--phase',choices=['local','coupled','polish','beam','transfer','export'],default='local')
    p.add_argument('--limit',type=int,default=180);p.add_argument('--seed',type=int,default=20261116)
    p.add_argument('--workers',type=int,default=8)
    p.add_argument('--beam-width',type=int,default=3)
    a=p.parse_args();exports=[];caches={};contracts={}
    if not 1<=a.workers<=16:p.error('workers must be between 1 and 16')
    if not 1<=a.beam_width<=10:p.error('beam-width must be between 1 and 10')
    parents=a.parents.split(',')
    if len(set(parents))!=len(parents) or any(parent not in SUPPORTED_PARENTS for parent in parents):
        p.error('parents must be distinct supported layout IDs')
    if a.phase=='export' and parents!=PARENTS and a.prefix.resolve()==PREFIX:
        p.error('use --prefix to keep exports for a different parent selection separate')
    for parent in parents:
        s=StableNeighbors(a.output,parent);s.workers=a.workers;lock=lock_run(s.output)
        try:
            if a.phase=='export':
                exports.append(s.export_layout(json.loads(LAYOUTS.read_text(encoding='utf8'))))
                caches[parent]=s.cache;contracts[parent]=s.progress['contract']
            elif a.phase=='transfer':s.transfer()
            elif a.phase=='beam':s.beam(a.beam_width)
            else:
                s.run(a.phase,a.limit,a.seed)
        finally:
            if s.engine:s.engine.close()
            lock.close()
    if a.phase=='export':
        bundle=json.loads(LAYOUTS.read_text(encoding='utf8'))
        a.prefix.parent.mkdir(parents=True,exist_ok=True)
        archive=Path(str(a.prefix)+'-scores.json.gz')
        archive.write_bytes(gzip.compress(json.dumps(caches,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
        paths=[Path(__file__),ROOT/'tools/explore_cr_frontier_followup.py',ROOT/'tools/run_cr_anneal.py',LAYOUTS,STABILITY,
            ROOT/'research/config/cr-anneal-inputs.zip',ROOT/'research/config/ckt-v51-toned-2121-seeds.json',
            ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',ROOT/'research/ckt-v4-core/target/release/audit-toned-rhyme-neighbors.exe']
        atomic_json(Path(str(a.prefix)+'-finalists.json'),dict(version='cr-stable-neighbors-v1',tokenKeys=bundle['tokenKeys'],
            keyDefinition='sha256 of expanded sound-key mapping plus D/M/guard memory ledger; excludes auxiliary policy',
            firstAtomNames=bundle['firstAtomNames'],layouts=exports,contracts=contracts,
            sourceHashes={str(path.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
            scoreArchive=dict(file=archive.name,sha256=hashlib.sha256(archive.read_bytes()).hexdigest())))
        print(json.dumps([dict(id=r['id'],before=r['before']['ckt'],after=r['metrics']['ckt'],daily=r['metrics']['daily']) for r in exports]),flush=True)


if __name__=='__main__':
    main()
