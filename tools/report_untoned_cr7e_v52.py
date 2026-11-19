"""Summarize fixed-initial CKT v5.2 experiments without mixing coding contracts."""
import base64
import gzip
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-19-untoned-cr7e-v52'

def main():
    search=json.loads(Path(str(PREFIX)+'.json').read_text(encoding='utf-8'))
    verification=json.loads(Path(str(PREFIX)+'-verification.json').read_text(encoding='utf-8'))
    assert search['completed'] and verification['completed']
    baseline={r['id']:r for r in verification['results'] if r['id'].startswith('OC21-')}
    candidates=[r for r in verification['results'] if r['id'].startswith('U7E-') and 'optimal1x' in r]
    rows=[]
    for row in verification['results']:
        item={k:row[k] for k in ('id','audit','score','doubledScore')}
        if 'optimal1x' in row:
            item.update(optimal1x=row['optimal1x'],optimal2x=row['optimal2x'])
            item['fixedPolicyVsBaselines']={ident:{'oneCostDelta':row['score']-b['score'],'twoCostDelta':row['doubledScore']-b['doubledScore']} for ident,b in baseline.items()}
            item['optimalPolicyVsBaselines']={ident:{'oneCostDelta':row['optimal1x']['score']-b['optimal1x']['score'],
                'twoCostDelta':row['optimal2x']['score']-b['optimal2x']['score']} for ident,b in baseline.items()}
        rows.append(item)
    out=dict(version='untoned-cr7e-v52-summary-1',fixedInitials=search['initialMap'],
        sourceLayout='CR-REF-7e650f7a4c: initial keys only; native toned finals are not transplanted',
        comparisonContract='untoned traditional 21x21, shape/tone members equally weighted; M-R2, not M-T1',
        cognitiveCostDefinition='all six cognitive coefficients multiply by 1 or 2; fixed motor, fixed S005 routes, denominator repriced at the same multiplier',
        exactStates=len(search['states']),screenedCenters=sum('center' in s for s in search['stages']),
        inspectedLegalNeighborCandidates=sum(s.get('legalCandidates',0) for s in search['stages']),
        rows=rows,initialTransplants=[r for r in rows if any(s['id']==r['id'] and s.get('mutation','').startswith('transplant ') for s in search['states'].values())],
        scope='bounded multi-seed, multi-center proxy-screened search; no global or full one-hop optimality proof')
    out['foundStrictImprovementBothCostsVsE1']=any(r['score']<baseline['OC21-e1f155973380']['score'] and r['doubledScore']<baseline['OC21-e1f155973380']['doubledScore'] for r in candidates)
    e1=baseline['OC21-e1f155973380']
    out['trackEffectiveTimeDifferencesVsE1']={r['id']:{mode:{kind:{
        'oneCostMs':t['effectiveMs']-e1['modes'][mode][kind]['effectiveMs'],
        'twoCostMs':2*(t['effectiveMs']-e1['modes'][mode][kind]['effectiveMs'])-(t['motorUpperMs']-e1['modes'][mode][kind]['motorUpperMs'])
        } for kind,t in tracks.items()} for mode,tracks in r['modes'].items()} for r in candidates}
    out['sources']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(str(PREFIX)+'.json'),Path(str(PREFIX)+'-verification.json'),Path(str(PREFIX)+'-memory.json'),Path(str(PREFIX)+'-optimal-replay.json'),Path(__file__)]}
    target=Path(str(PREFIX)+'-summary.json');target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    work=ROOT/'research/.cache/untoned-cr7e-v52-20261119'
    archive={name:{'sha256':hashlib.sha256((work/name).read_bytes()).hexdigest(),'base64':base64.b64encode((work/name).read_bytes()).decode()} for name in ['pilot-search.js','pilot-report.json','screened-search-v1.js','screened-report-v1.json','native-verification-source.js','native-verification-checkpoint.json','verified-bf-policy-checkpoint.json']}
    Path(str(PREFIX)+'-search-revisions.json.gz').write_bytes(gzip.compress(json.dumps(archive).encode(),mtime=0))
    print(json.dumps({'exactStates':out['exactStates'],'screenedCenters':out['screenedCenters'],'rows':rows},ensure_ascii=False))

if __name__=='__main__':main()
