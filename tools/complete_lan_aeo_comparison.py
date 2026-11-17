"""Complete columns for the useful AEO endpoints, then assemble the full sweep."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import copy
import csv
from pathlib import Path
import subprocess
import sys

import compare_cr_lan_zero_carriers as comparison
from integrate_cr_lan_f19_r11 import LAYOUTS
from run_cr_anneal import ROOT,unpack
from search_cr_667_zero_carriers import CarrierSpace,read,sha
from integrate_cr_frontier_r11 import write

DIR=ROOT/'research/.cache/lan-aeo-all-20261118'
NOTES=ROOT/'research/notes'
TONED=NOTES/'2026-11-18-lan-aeo-toned.json'
UNTONED=NOTES/'2026-11-18-lan-aeo-untoned.json'
TONED_COLUMNS=NOTES/'2026-11-18-lan-aeo-toned-columns.json'
OUTPUT=NOTES/'2026-11-18-lan-aeo-comparison.json'


def full_toned_columns():
    comparison.DESTINATION=DIR/'toned-full';comparison.OUTPUT=TONED_COLUMNS
    comparison.VARIANTS={f'AEO-to-{k}':{f'zero-{a}':k for a in 'AEO'} for k in ['N','F','E']}
    manifest=comparison.prepare()
    sweep=read(TONED)['families'][0]
    for row in manifest['variants']:
        fixture=comparison.DESTINATION/(row['id']+'.fixture.json');f=read(fixture)
        f['expected']['score']=next(r['score'] for r in sweep['rows'] if r['target']==row['name'][-1])
        write(fixture,f)
    with ThreadPoolExecutor(max_workers=2) as executor:list(executor.map(comparison.score_variant,manifest['variants']))
    previous=sys.argv;sys.argv=[__file__,'--reuse-scores']
    try:comparison.main()
    finally:sys.argv=previous


def assemble():
    toned=read(TONED);untoned=read(UNTONED)
    if not toned['completed'] or not untoned['completed']:raise ValueError('incomplete enumeration')
    unpack(ROOT/'research/config/cr-anneal-inputs.zip',DIR/'toned-inputs')
    space=CarrierSpace(DIR/'toned-inputs');base=read(LAYOUTS)['layouts'][0]
    for row in toned['families'][0]['rows']:
        state=copy.deepcopy(base['state'])
        if row['target']!='original':
            for i,atom in enumerate(space.f['atoms']):
                if atom['name'] in ['zero-A','zero-E','zero-O']:state['firstKeys'][i]=row['target']
        row.update(daily=space.daily(state)['daily'],key=space.key(state),state=state)
    # Reproduce original LU/FA and M-R2 formulas on the imported production entry.
    sys.path.insert(0,str(ROOT/'research/.cache/R11_integrated_replay'))
    import logic
    from memory_r2 import audit
    source=logic.D
    for row in untoned['families'][0]['rows']:
        entry=read(DIR/f'untoned-{row["target"]}.entry.json')
        # The frozen support table and Common399 index order must agree.
        if source['pinyin']!=space.f['pinyin']:raise ValueError('pinyin inventory mismatch')
        memory=audit(source,entry)
        if memory['M']!=row['audit']['M'] or memory['unique']!=row['audit']['unique']:
            raise ValueError('independent untoned M-R2 audit mismatch')
        row.update(memoryAudit=memory,logicUniformity=logic.lu(entry),factorAudit=logic.fa(entry))
        if row['target']=='original':
            for value,expected in [(row['logicUniformity']['score'],entry['logicUniformity']['score']),
                                   (row['factorAudit']['score'],entry['logicAudit']['score'])]:
                if abs(value-expected)>1e-9:raise ValueError('original LU/FA baseline mismatch')
    paths=[TONED,UNTONED,TONED_COLUMNS,NOTES/'2026-11-18-lan-aeo-untoned-columns.json',
        NOTES/'2026-11-18-cr-lan-zero-carriers.json',Path(__file__),
        ROOT/'tools/enumerate_lan_aeo.js',ROOT/'tools/score_lan_aeo_untoned_columns.js',
        ROOT/'research/.cache/R11_integrated_replay/logic.py',ROOT/'research/.cache/R11_integrated_replay/memory_r2.py',
        ROOT/'research/.cache/R11_integrated_replay/source.json']
    result=dict(version='lan-aeo-comparison-v1',soundKeys=toned['soundKeys'],families=toned['families']+untoned['families'],
        auxiliaryPolicyReoptimized=False,
        columnCoverage=dict(toned=['original','C','R','N','F','E'],untoned=['original','C','R','N','F']),
        scope='all 21 common-carrier endpoints plus baseline per family have complete native CKT, finger loads, memory and daily replay; extra 20-contract columns are computed for the explicitly listed representatives',
        tonedSelectedColumns=read(TONED_COLUMNS),tonedCRColumns=read(NOTES/'2026-11-18-cr-lan-zero-carriers.json'),
        untonedSelectedColumns=read(NOTES/'2026-11-18-lan-aeo-untoned-columns.json'),
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths},htmlSha256=toned['htmlSha256'])
    result['htmlUnchanged']=sha(ROOT/'a7_CKT_R11.html')==result['htmlSha256']
    if not result['htmlUnchanged']:raise ValueError('HTML changed')
    write(OUTPUT,result)
    with OUTPUT.with_suffix('.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        fields=['family','target','cktV51','deltaCKT','daily','deltaDaily','memoryModel','memoryLower','memoryGuard','M','D',
            'occupiedBuckets','leftPinkyNativePeak','rightPinkyNativePeak','passesLeft','passesRight','QZoccupied','ZQoccupied']
        writer=csv.DictWriter(stream,fields);writer.writeheader()
        for family in result['families']:
            base=family['rows'][0]
            for row in family['rows']:
                if family['family']=='toned':
                    e=row['ergonomics'];daily=row['daily'];base_daily=base['daily']
                    item=dict(memoryModel='M-T1',memoryLower=row['memory']['lower'],memoryGuard=row['memory']['guard'],D=row['memory']['D'],
                        occupiedBuckets=row['occupiedBuckets'],leftPinkyNativePeak=e['leftPinkyQAZPeak4NativeTracks']['value'],
                        rightPinkyNativePeak=e['rightPinkyPeak4NativeTracks']['value'],passesLeft=row['passesLeft'],passesRight=row['passesRight'])
                else:
                    daily=row['erg20']['mx'];base_daily=base['erg20']['mx']
                    item=dict(memoryModel='M-R2',M=row['audit']['M'],D=row['audit']['D'],occupiedBuckets=row['audit']['unique'],
                        leftPinkyNativePeak=max(e['leftPinkyQAZPeak4NativeTracks']['value'] for e in row['ergonomics'].values()),
                        rightPinkyNativePeak=max(e['rightPinkyPeak4NativeTracks']['value'] for e in row['ergonomics'].values()),
                        QZoccupied=row['audit']['qz'],ZQoccupied=row['audit']['zq'])
                writer.writerow(dict(item,family=family['family'],target=row['target'],cktV51=row['score'],deltaCKT=row['score']-base['score'],
                    daily=daily,deltaDaily=daily-base_daily))
    print('Complete AEO comparison:',OUTPUT)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--phase',choices=['toned-columns','assemble'],required=True)
    args=p.parse_args()
    if args.phase=='toned-columns':full_toned_columns()
    else:assemble()


if __name__=='__main__':main()
