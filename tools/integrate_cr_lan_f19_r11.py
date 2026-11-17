"""Publish fixed-Lan f19 with its dual-pinky-constrained robust auxiliary policy."""
import argparse
import copy

from integrate_cr_frontier_r11 import ROOT,publish,read,write
from integrate_cr_stable_r11 import stable_source
from run_cr_anneal import unpack
from search_cr_667_zero_carriers import CarrierSpace,sha

LAYOUTS=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-finalists.json'
ROBUST=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-constrained-robustness.json'
COMPONENTS=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-auxiliary.json'
VERIFICATION=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability-verification.json'
DESTINATION=ROOT/'a7_CKT_R11_integrated_materials/cr_lan_f19'
AUDIT=ROOT/'research/notes/2026-11-17-cr-lan-f19-r11-columns.json'
IDENT='CR-LAN-f19a0ad1dc'
LABELS={IDENT:'带调键道 · 固定兰道声母 · 稳健第一辅序'}


def publication_source(space):
    bundle=read(LAYOUTS);verified=read(VERIFICATION);memory=verified['memory']
    if len(bundle['layouts'])!=1 or not bundle['layouts'][0]['key'].startswith('f19a0ad1dc'):
        raise ValueError('requires exactly the requested fixed Lan sound layout')
    for file in [LAYOUTS,ROBUST,COMPONENTS]:
        if verified['sourceHashes'][file.relative_to(ROOT).as_posix()]!=sha(file):
            raise ValueError('full native verification source changed: '+str(file))
    if [memory[k] for k in ['lower','guard','D','F']]!=[24,25,2,0]:
        raise ValueError('unexpected independently derived memory ledger')
    layout=bundle['layouts'][0]
    layout['memoryAudit']=dict(copy.deepcopy(memory['audit']),ordinaryD=memory['D'],
        memoryLower=memory['lower'],memoryGuard=memory['guard'])
    layout['memoryDefinition']=memory['definition']
    source,references=stable_source(bundle,read(ROBUST),read(COMPONENTS),space,labels=LABELS,
        layout_path=LAYOUTS,robust_path=ROBUST,components_path=COMPONENTS,memory_budget=(24,26))
    layout=source['layouts'][0]
    if layout['wordAuxiliaryPolicy']!=dict(word2='21',word3='213',word4='14'):
        raise ValueError('unexpected constrained robust winner')
    selected=next(p for p in verified['policies'] if p['policy']==layout['wordAuxiliaryPolicy'])
    if not selected['passesPinkyConstraints'] or abs(selected['score']-layout['nativeScore'])>1e-9:
        raise ValueError('selected native audit mismatch')
    layout['description']='固定生产兰道声母；全144辅序枚举、72套双小指合规候选的六成本宽域稳健第一；纯形辅序21/213/14；M24/25、D2'
    layout['origin']='fixed production Lan onsets; whole-root regrouping and rhyme-key search'
    layout['policySelection'].update(candidatePolicyCount=144,rankedPolicyCount=72,
        pinkyCeiling=layout['constraints']['pinkyCeiling'],rightPinkyCeiling=layout['constraints']['rightPinkyCeiling'])
    source['provenance']={file.relative_to(ROOT).as_posix():sha(file) for file in [LAYOUTS,ROBUST,COMPONENTS,VERIFICATION]}
    return source,references


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--reuse-scores',action='store_true');args=p.parse_args()
    unpack(ROOT/'research/config/cr-anneal-inputs.zip',DESTINATION/'inputs')
    space=CarrierSpace(DESTINATION/'inputs');source,references=publication_source(space)
    write(DESTINATION/'publication-source.json',source)
    publish(source,space.f,read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition'],references,
        labels=LABELS,source_path=LAYOUTS,destination=DESTINATION,audit_path=AUDIT,reuse_scores=args.reuse_scores)


if __name__=='__main__':main()
