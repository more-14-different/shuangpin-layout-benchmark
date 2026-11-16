"""Publish three new CR layouts and update 29ce221cfe using broad-grid stable policies."""
import argparse
import copy
import hashlib

from integrate_cr_frontier_r11 import ROOT, publish, read
from run_cr_anneal import SearchSpace, unpack

LAYOUTS = ROOT / 'research/notes/2026-11-16-cr-frontier-followup-finalists.json'
ROBUST = ROOT / 'research/notes/2026-11-16-cr-toned-stable-policies.json'
COMPONENTS = ROOT / 'research/notes/2026-11-16-cr-frontier-followup-auxiliary.json'
DESTINATION = ROOT / 'a7_CKT_R11_integrated_materials/cr_robust_frontier'
LABELS = {'CR-GPU-f0ae939a38':'带调键道 · 均衡精修 · 稳定辅序',
          'CR-GPU-3d3dcbafc0':'带调键道 · 日常精修 · 稳定辅序',
          'CR-GPU-0a4ee7fb52':'带调键道 · 高移手 · 稳定辅序',
          'CR-GPU-29ce221cfe':'带调键道 · GPU 最低当量 · 稳定辅序'}


def stable_source(bundle, robust, components, space):
    if len(robust['results']) != 4:
        raise ValueError('requires all four complete stability audits')
    reference = robust['reference']
    for path in [COMPONENTS]:
        key = str(path.relative_to(ROOT)).replace('\\','/')
        if hashlib.sha256(path.read_bytes()).hexdigest() != robust['sourceHashes'][key]:
            raise ValueError('stability source hash mismatch: '+key)
    layouts, references = [], {}
    for ident in LABELS:
        prefix = ident.removeprefix('CR-GPU-')
        matches = [row for row in bundle['layouts'] if row['key'].startswith(prefix)]
        if len(matches)!=1:
            raise ValueError(ident+': missing/ambiguous layout')
        layout = copy.deepcopy(matches[0])
        checked = next(row for row in robust['results'] if row['id']==layout['id'])
        policies = next(row for row in components['results'] if row['id']==layout['id'])
        if not policies['cohortEqualityVerified'] or policies['policyCount']!=144:
            raise ValueError(ident+': incomplete policy components')
        candidates = [row for row in policies['policies'] if row['policy']==checked['selectedPolicy']]
        if len(candidates)!=1 or abs(candidates[0]['score']-checked['selectedScore'])>1e-9:
            raise ValueError(ident+': selected policy/score mismatch')
        if checked['selectedRank'] != checked['pooledRanking'][0] or checked['runnerRank'] != checked['pooledRanking'][1]:
            raise ValueError(ident+': inconsistent stability ranking')
        state=layout['state'];memory=space.memory(state)
        if space.key(state)!=layout['key'] or not memory or memory['d']>2 or memory['m']>22 or memory['guard']>24:
            raise ValueError(ident+': invalid state or budget')
        for field,value in dict(memory,**space.daily(state)).items():
            if abs(value-layout['metrics'][field])>1e-9:
                raise ValueError(ident+': stale state metric '+field)
        lookup = dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        if len(lookup)!=1407:
            raise ValueError('legal inventory mismatch')
        expanded=space.expand(state)
        first={py:i for i,a in enumerate(space.f['atoms']) for py in a['pinyin']}
        final={py:i for i,a in enumerate(space.f['rhymeAtoms']) for py in a['pinyin']}
        regions={tone:i for i,r in enumerate(space.f['toneRegions']) for tone in r['tones']}
        for py,codes in enumerate(space.f['tonedCodes']):
            for tone,code in enumerate(codes,1):
                actual=lookup.get(space.f['pinyin'][py]+str(tone))
                expected=None if not code else expanded['firstKeys'][first[py]]+expanded['rhymeKeys'][regions[tone]][final[py]]
                if actual!=expected:
                    raise ValueError(ident+': expanded state/code mismatch')
        layout['id']=ident;layout['annealKey']=layout['key'];layout['origin']=layout['profile']+' follow-up'
        layout['nativeScore']=checked['selectedScore']
        layout['wordAuxiliaryPolicy']=checked['selectedPolicy']
        layout['policySelection']=dict(
            version=robust['version'],rule=robust['selectionRule'],candidateSet=robust['candidateSet'],
            auditSource=str(ROBUST.relative_to(ROOT)).replace('\\','/'),
            auditSha256=hashlib.sha256(ROBUST.read_bytes()).hexdigest(),
            layoutSourceSha256=hashlib.sha256(LAYOUTS.read_bytes()).hexdigest(),
            baselineCostsMs=robust['baselineCostsMs'],reference=reference,
            grids={name:dict(**robust['grids'][name],winner=g['ranking'][0],runner=g['ranking'][1],
                selected=next(r for r in g['ranking'] if r['policy']=='/'.join(checked['selectedPolicy'][k] for k in ['word2','word3','word4'])),
                selectedVsRunner=g['selectedVsRunner']) for name,g in checked['grids'].items()},
            selected=checked['selectedRank'],runner=checked['runnerRank'],
            selectedPolicy=checked['selectedPolicy'],runnerPolicy=checked['runnerPolicy'],
            selectedScore=checked['selectedScore'],runnerScore=checked['runnerScore'],
            defaultScoreGap=checked['defaultScoreGap'],meanRankGap=checked['meanRankGap'],
            sameWinnerAllGrids=checked['sameWinnerAllGrids'])
        order='/'.join(checked['selectedPolicy'][k] for k in ['word2','word3','word4'])
        layout['description']=f"固定声韵布局；全144辅序、六成本0–500%/0–1000%及正成本网格；稳定辅序 {order}"
        layout['memoryAudit'].update(sourceRhymeColumnMergeRules=sum(len(g['roots'])>1 for g in layout['rhymeGroups']),
            sourceRhymeColumnMergeLinks=8,toneRegionMergeLower=sum(10-len(set(row)) for row in state['groupKeys']))
        layouts.append(layout)
        references[ident]=dict(ckt={'v51':{'score':checked['selectedScore']}},
            macro={'daily|native-punctuation':{'score':layout['metrics']['daily']}},
            ergonomics={'leftPinkyQAZPeak4NativeTracks':{'value':checked['selectedPinky']}})
    return dict(tokenKeys=bundle['tokenKeys'],layouts=layouts),references


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reuse-scores',action='store_true')
    args=parser.parse_args()
    unpack(ROOT/'research/config/cr-anneal-inputs.zip',DESTINATION/'inputs')
    space=SearchSpace(DESTINATION/'inputs')
    source,references=stable_source(read(LAYOUTS),read(ROBUST),read(COMPONENTS),space)
    decomposition=read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    publish(source,space.f,decomposition,references,labels=LABELS,source_path=LAYOUTS,
        destination=DESTINATION,reuse_scores=args.reuse_scores,
        audit_path=ROOT/'research/notes/2026-11-16-cr-stable-r11-columns.json')


if __name__=='__main__':
    main()
