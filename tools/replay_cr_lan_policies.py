"""Exact word3-policy substitution for every fixed-Lan state, followed by direct CPU checks."""
import copy
import gzip
import json
from pathlib import Path

from explore_cr_lan_fixed import PREFIX,OUTPUT,POLICY,PROFILES,read,sha,ROOT
from prepare_cr_m24_portfolio import make_layout
from run_cr_anneal import Engine,unpack,atomic_json
from search_cr_667_zero_carriers import CarrierSpace
from explore_cr_stable_neighbors import adapt_shape_corpus

POLICY_PREFIX=Path(str(PREFIX)+'-policy')


def substitute(metrics,audit,order):
    baseline=next(r for r in audit['word3OrderAudit'] if r['order']=='231')
    chosen=next(r for r in audit['word3OrderAudit'] if r['order']==order)
    reference=audit['word3Reference']['effectiveMs']
    fourth=(metrics['ckt']/10)**4+((chosen['metric']['effectiveMs']/reference)**4-(baseline['metric']['effectiveMs']/reference)**4)/6
    m=copy.deepcopy(metrics);m['ckt']=10*fourth**.25
    m['pinkyTracks'][2]=chosen['leftPinky'];m['rightPinkyTracks'][2]=chosen['rightPinky']
    m['pinky']=max(m['pinkyTracks']);m['rightPinky']=max(m['rightPinkyTracks']);m['verified']=False
    return m


def eligible(m,profile):
    p=PROFILES[profile]
    return (m['d']<=2 and m['m']<=24 and m['guard']<=26 and m['daily']>=p['dailyFloor']-1e-9 and
        m['pinky']<=p['pinkyCeiling']+1e-12 and m['rightPinky']<=p['rightPinkyCeiling']+1e-12)


def main():
    base=read(str(PREFIX)+'-finalists.json');audit=read(str(PREFIX)+'-word3-invariance.json')
    path=PREFIX.parent/base['scoreArchive']['file']
    if sha(path)!=base['scoreArchive']['sha256']:raise ValueError('baseline archive mismatch')
    rows=list(json.loads(gzip.decompress(path.read_bytes()))['lan'].values());orders=[r['order'] for r in audit['word3OrderAudit']]
    selected={};summary=[]
    for order in orders:
        variants=[dict(row,metrics=substitute(row['metrics'],audit,order)) for row in rows]
        result=dict(order=order,qualified={})
        for profile in PROFILES:
            qualified=sorted((r for r in variants if eligible(r['metrics'],profile)),key=lambda r:(r['metrics']['ckt'],r['key']))
            result['qualified'][profile]=len(qualified)
            if not qualified:continue
            winner=qualified[0];result['best_'+profile]=dict(key=winner['key'],metrics=winner['metrics'])
            identity=winner['key'],order
            selected.setdefault(identity,dict(row=winner,roles=[]))['roles'].append('best_'+profile+'_order'+order)
        summary.append(result)
    # Score substitution changes only the constant word3 term; each selected state
    # is nevertheless fully replayed from the adapted native corpus on CPU.
    layouts=[]
    for order in orders:
        chosen=[v for (key,o),v in selected.items() if o==order]
        if not chosen:continue
        folder=OUTPUT/'policy-replay'/order;unpack(ROOT/'research/config/cr-anneal-inputs.zip',folder)
        policy=dict(POLICY,word3=order);content,_=adapt_shape_corpus((folder/'corpus.bin').read_bytes(),policy)
        (folder/'corpus.bin').write_bytes(content);space=CarrierSpace(folder)
        engine=Engine(ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',folder,'cpu',2,300)
        try:
            for candidate in chosen:
                row=candidate['row'];actual=engine.score([space.expand(row['state'])],True)[0]
                for field in ['ckt','pinky','rightPinky']:
                    if abs(actual[field]-row['metrics'][field])>1e-9:raise ValueError('policy substitution/CPU mismatch '+field)
                metrics=dict(row['metrics']);metrics.update(actual)
                layout=make_layout(space,row['state'],metrics,base['tokenKeys'],'CRLAN-'+row['key'][:10]+'-'+order)
                layout.update(wordAuxiliaryPolicy=policy,roles=candidate['roles'],
                    qualifiedProfiles=[p for p in PROFILES if eligible(metrics,p)])
                layouts.append(layout)
        finally:engine.close()
    for profile in PROFILES:
        feasible=[l for l in layouts if profile in l['qualifiedProfiles']]
        if feasible:min(feasible,key=lambda l:(l['rustScore'],l['key']))['roles'].append('best_'+profile+'_across_orders')
    component_fields=['motorUpperMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions']
    permitted=[r for r in audit['word3OrderAudit'] if r['leftPinky']<=PROFILES['speed']['pinkyCeiling']+1e-12 and
        r['rightPinky']<=PROFILES['speed']['rightPinkyCeiling']+1e-12]
    dominant=[r['order'] for r in permitted if all(all(r['metric'][field]<=other['metric'][field]+1e-12
        for field in component_fields) for other in permitted)]
    atomic_json(Path(str(POLICY_PREFIX)+'-finalists.json'),dict(version='cr-lan-word3-policy-replay-v1',
        tokenKeys=base['tokenKeys'],firstAtomNames=base['firstAtomNames'],layouts=layouts,profiles=PROFILES,
        contract=dict(base['contract'],wordAuxiliaryPolicy=dict(word2='21',word3='per-layout',word4='14')),
        baselineSearchContract=base['contract'],rootInternalSplits=0,baselineArchive=base['scoreArchive'],policySummary=summary,
        evaluatedPhysicalLayouts=len(rows),derivedPolicyVariants=len(rows)*len(orders),
        constrainedWord3Dominance=dict(eligibleOrders=[r['order'] for r in permitted],componentFields=component_fields,dominantOrders=dominant,
            scope='same fixed complete onset map and same other tracks; nonnegative auxiliary/selection/scan/page costs; not a robustness comparison between different sound layouts or all word2/word4 policies'),
        derivation='same first keys and 21/14 word2/word4 policy; replace the fixed independent word3 contribution in the fourth-power CKT sum and its two finger loads; each exported winner has separate direct CPU native replay',
        sourceHashes={p.relative_to(ROOT).as_posix():sha(p) for p in [Path(__file__),Path(str(PREFIX)+'-finalists.json'),
            Path(str(PREFIX)+'-word3-invariance.json'),path]}))
    print(json.dumps([dict(id=l['id'],policy=l['wordAuxiliaryPolicy'],score=l['rustScore'],daily=l['metrics']['daily'],
        left=l['metrics']['pinky'],right=l['metrics']['rightPinky'],roles=l['roles']) for l in layouts]),flush=True)


if __name__=='__main__':main()
