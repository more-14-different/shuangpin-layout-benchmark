"""Exact frozen daily punctuation replay for every proposed layout; shortlist for full load audit."""
import argparse
import json
import sys
from pathlib import Path
from prepare_toned_rhyme_neighbors import ROOT, read
from integrate_snow_jiandao_toned_r11 import REPLAY


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('prefix')
    parser.add_argument('--select', action='store_true')
    parser.add_argument('--filter-to', help='retain baselines and candidates improving exact daily score before CKT scoring')
    args = parser.parse_args()
    job = read(args.prefix + '-job.json')
    f = job['fixture']
    if args.filter_to:
        macros = read(args.prefix + '-comfort.json')
        ids = {r['id'] for r in macros if r['score'] > 122.77842860194683}
        ids.update(c['id'] for c in job['candidates'] if c['kind'] == 'baseline')
        job['candidates'] = [c for c in job['candidates'] if c['id'] in ids]
        job['dailyScreenSource'] = args.prefix
        (ROOT / (args.filter_to + '-job.json')).write_text(json.dumps(job,indent=2),encoding='utf8')
        (ROOT / (args.filter_to + '-comfort.json')).write_text(json.dumps([r for r in macros if r['id'] in ids],indent=2),encoding='utf8')
        print('Retained',len(ids),'candidates')
        return
    if not args.select:
        sys.path.insert(0, str(REPLAY))
        from macroxue.engine import evaluate
        data = read('research/.cache/toned-representative-macro-input.json')['data']
        assert data['pinyin'] == f['pinyin']
        first = {p:i for i,a in enumerate(f['atoms']) for p in a['pinyin']}
        final = {p:i for i,a in enumerate(f['rhymeAtoms']) for p in a['pinyin']}
        region = {t:i for i,r in enumerate(f['toneRegions']) for t in r['tones']}
        reading = {}
        for char, py, tone, weight, _ in data['characters']:
            if (char,py) not in reading or weight > reading[char,py][1]:
                reading[char,py] = tone,weight
        pindex = {p:i for i,p in enumerate(f['pinyin'])}
        tokens = data['macroxue']['corpora']['daily']['tokens']
        sequence = [t['key'] if 'key' in t else (first[pindex[t['pinyin']]],
                    final[pindex[t['pinyin']]], region[reading[t['char'],pindex[t['pinyin']]][0]]) for t in tokens]
        legal = [(first[p],final[p],region[t+1]) for p,row in enumerate(f['tonedCodes']) for t,code in enumerate(row) if code]
        rows = []
        for c in job['candidates']:
            a,b = c['state']['firstKeys'],c['state']['rhymeKeys']
            strokes = ''.join(t if isinstance(t,str) else a[t[0]]+b[t[2]][t[1]] for t in sequence).lower()
            m = evaluate(strokes,len(tokens))
            codes = {a[i]+b[r][k] for i,k,r in legal}
            rows.append(dict(id=c['id'],score=m['score'],dailyLeftPinky=m['finger_load'][0]/m['hits'],
                             heatQAZ={k:m['heat_map'][k] for k in 'qaz'},qzEmpty='QZ' not in codes,
                             zqEmpty='ZQ' not in codes,occupied=len(codes),memory=c['memory'],guard=c['memoryGuard']))
        (ROOT / (args.prefix + '-comfort.json')).write_text(json.dumps(rows,indent=2),encoding='utf8')
        print('Replayed',len(rows),'daily corpora')
        return
    scores = read(args.prefix + '-scores.json')
    assert scores['completed'] == scores['total']
    macros = {r['id']:r for r in read(args.prefix + '-comfort.json')}
    rows = [dict(macros[r['id']],ckt=r['score']) for r in scores['results']]
    eligible = [r for r in rows if r['ckt'] < 9.203609845305458 and r['score'] > 122.77842860194683]
    selected = []
    for qz in [True,False]:
        subset = [r for r in eligible if r['qzEmpty']==qz]
        for key in ['ckt','dailyLeftPinky','score']:
            selected.extend(sorted(subset,key=lambda r:r[key],reverse=key=='score')[:4])
    selected = list({r['id']:r for r in selected}.values())
    ids = {r['id'] for r in selected}
    chosen = dict(job,candidates=[c for c in job['candidates'] if c['id'] in ids])
    # Exporter needs anchor scores when the baseline is not among the shortlist.
    (ROOT / (args.prefix + '-selected-job.json')).write_text(json.dumps(chosen,indent=2),encoding='utf8')
    selected_scores = dict(scores,results=[r for r in scores['results'] if r['id'] in ids],completed=len(ids),total=len(ids))
    (ROOT / (args.prefix + '-selected-scores.json')).write_text(json.dumps(selected_scores,indent=2),encoding='utf8')
    (ROOT / (args.prefix + '-screen.json')).write_text(json.dumps(dict(eligible=len(eligible),selected=selected,results=rows),indent=2),encoding='utf8')
    print(json.dumps(dict(eligible=len(eligible),selected=selected),indent=2))


if __name__ == '__main__':
    main()
