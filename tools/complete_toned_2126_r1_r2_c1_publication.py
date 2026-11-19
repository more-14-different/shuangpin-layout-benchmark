"""Compute the existing collision and article benchmarks for R1/R2/C1."""
import argparse
import hashlib
import json
from pathlib import Path

import integrate_snow_jiandao_toned_r11 as bridge
from shenyun_collision_benchmark import read_word_corpus,evaluate_toned_layout

ROOT=Path(__file__).resolve().parents[1]


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--main',type=Path,default=ROOT.parent/'shuangpin-layout-benchmark');a=p.parse_args()
    main=a.main.resolve();dest=main/'a7_CKT_R11_integrated_materials/toned2126-r1-r2-c1'
    bridge.REPLAY=main/'research/.cache/R11_integrated_replay'
    data=json.loads((main/'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json').read_text(encoding='utf8'))
    corpus=read_word_corpus([bridge.SNOW/n for n in ['snow_pinyin.base.dict.yaml','snow_pinyin.ext.dict.yaml','snow_pinyin.tencent.dict.yaml']],allowed_pinyin={data['pinyin'][i] for i,_ in data['base']},preserve_tones=True)
    for key in ['R1','R2','C1']:
        file=dest/(key+'.json');raw=json.loads(file.read_text(encoding='utf8'));native=raw['native'];fixture=raw['fixture']
        columns=json.loads((dest/(key+'.columns.json')).read_text(encoding='utf8'))
        assert columns['version']=='tone-in-main-column-contracts-v3' and columns['nativeId']==native['id']
        digest=hashlib.sha256(json.dumps(native['tonedCodes'],separators=(',',':')).encode()).hexdigest()
        assert columns['tonedCodesSha256']==digest
        columns['collision']=evaluate_toned_layout(fixture,corpus)
        native['columns']=columns;native['macro']=bridge.macro_replay(data,fixture)
        file.write_text(json.dumps(raw,ensure_ascii=False,separators=(',',':')),encoding='utf8')
        print(key,'collision and article replay complete',native['macro']['daily|native-punctuation']['score'],flush=True)


if __name__=='__main__':main()
