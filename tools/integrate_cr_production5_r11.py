"""Publish the five requested CR frontiers at their first broad-grid auxiliary policy."""
import argparse
import hashlib

from integrate_cr_frontier_r11 import ROOT,HTML,publish,read,write
from integrate_cr_stable_r11 import stable_source
from run_cr_anneal import SearchSpace,unpack

DESTINATION=ROOT/'a7_CKT_R11_integrated_materials/cr_production5'
SOURCE=ROOT/'research/config/cr-production5-r11.json'
AUDIT=ROOT/'research/notes/2026-11-17-cr-production5-r11-columns.json'
LABELS={
    'CR-GPU-87de6cc69c':'带调键道 · 均衡低当量 · 稳健第一辅序',
    'CR-GPU-667610a3fc':'带调键道 · 均衡高日常 · 稳健第一辅序',
    'CR-GPU-29ce221cfe':'带调键道 · GPU 最低当量 · 稳定辅序',
    'CR-GPU-6a384d9d0d':'带调键道 · M21 低当量 · 稳健第一辅序',
    'CR-GPU-795c0eee49':'带调键道 · M21 高日常 · 稳健第一辅序',
}


def production_source(manifest,space):
    layouts=[];references={};tokens=None;provenance={}
    for group in manifest['groups']:
        layout_path=ROOT/group['layouts'];robust_path=ROOT/group['robustness'];components_path=ROOT/group['components']
        for path in [layout_path,robust_path,components_path]:
            key=path.relative_to(ROOT).as_posix()
            if hashlib.sha256(path.read_bytes()).hexdigest()!=group['sha256'][key]:
                raise ValueError('publication input hash mismatch: '+key)
        labels={ident:LABELS[ident] for ident in group['ids']}
        bundle,checked=stable_source(read(layout_path),read(robust_path),read(components_path),space,
            labels=labels,layout_path=layout_path,robust_path=robust_path,components_path=components_path)
        if tokens is None:tokens=bundle['tokenKeys']
        if tokens!=bundle['tokenKeys']:raise ValueError('different inventory order across sources')
        for layout in bundle['layouts']:
            ident=layout['id'];expected=manifest['expected'][ident]
            if abs(layout['nativeScore']-expected['cktV51'])>1e-9:
                raise ValueError(ident+': expected stable CKT mismatch')
            if layout['wordAuxiliaryPolicy']!=expected['wordAuxiliaryPolicy']:
                raise ValueError(ident+': expected stable auxiliary policy mismatch')
            if layout['memoryAudit']['memoryLower']!=expected['memoryLower']:
                raise ValueError(ident+': expected memory mismatch')
            if abs(layout['metrics']['daily']-expected['daily'])>1e-9:
                raise ValueError(ident+': expected daily mismatch')
            if ident in references:raise ValueError('duplicate requested ID')
            provenance[ident]=dict(layoutSource=group['layouts'],stabilitySource=group['robustness'],
                componentSource=group['components'])
        layouts.extend(bundle['layouts']);references.update(checked)
    if set(references)!=set(LABELS):raise ValueError('requires exactly the five requested layouts')
    by_id={r['id']:r for r in layouts}
    return dict(tokenKeys=tokens,layouts=[by_id[ident] for ident in LABELS],provenance=provenance),references


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--reuse-scores',action='store_true');args=p.parse_args()
    unpack(ROOT/'research/config/cr-anneal-inputs.zip',DESTINATION/'inputs')
    space=SearchSpace(DESTINATION/'inputs');source,references=production_source(read(SOURCE),space)
    write(DESTINATION/'publication-source.json',source)
    publish(source,space.f,read(ROOT/'research/config/ckt-v51-toned-2121-seeds.json')['decomposition'],references,
        labels=LABELS,source_path=SOURCE,destination=DESTINATION,audit_path=AUDIT,reuse_scores=args.reuse_scores)


if __name__=='__main__':main()
