"""Extract the f19 sound layout for complete 144-policy robustness evaluation."""
from pathlib import Path
import copy

from run_cr_anneal import ROOT,atomic_json
from search_cr_667_zero_carriers import read,sha

PREFIX=ROOT/'research/notes/2026-11-17-cr-lan-f19-stability'
SOURCE=ROOT/'research/notes/2026-11-17-cr-lan-fixed-policy-finalists.json'


def main():
    b=read(SOURCE);layout=copy.deepcopy(next(l for l in b['layouts'] if 'best_speed_across_orders' in l['roles']))
    if not layout['key'].startswith('f19a0ad1dc'):raise ValueError('unexpected requested sound layout')
    layout['constraints']=b['profiles']['speed'];layout['profile']='speed'
    atomic_json(Path(str(PREFIX)+'-finalists.json'),dict(version='cr-lan-f19-stability-input-v1',
        tokenKeys=b['tokenKeys'],firstAtomNames=b['firstAtomNames'],layouts=[layout],
        sourceHashes={SOURCE.relative_to(ROOT).as_posix():sha(SOURCE)}))
    print(layout['id'],layout['rustScore'])


if __name__=='__main__':main()
