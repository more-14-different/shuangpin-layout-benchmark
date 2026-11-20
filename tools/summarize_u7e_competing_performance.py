"""Audit five own-robust-policy candidates; add frozen daily moving-hand replay."""
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-21-u7e-competing'
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
sys.path.insert(0,str(REPLAY))
from macroxue.engine import evaluate,LAYOUT
import memory_r2
IDS=['U7R-ba54b6e08e04','UED-18c004bd1f31','UQO-f32062502583','UQO-61c93a2c344c','U7G-87a5d1a954d2']
KINDS=['character','word2','word3','word4']
WEIGHTS=[1,3,1,1]

def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,r):Path(p).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')

def main():
    data=[read(str(PREFIX)+'-'+ident+'.json') for ident in IDS]
    prior_path=ROOT/'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'
    prior=read(prior_path)['auditInput'];pindex={p:i for i,p in enumerate(prior['pinyin'])}
    corpora_path=REPLAY/'R9_corpora.json';corpora=read(corpora_path)
    chen_path=REPLAY/'R8_public_pair_models.json';chen=read(chen_path)['chen'];chen_index={k:i for i,k in enumerate(chen['keys'])}
    columns_path=ROOT/'research/notes/2026-11-20-untoned-frontiers-r11-columns.json';old_columns=read(columns_path)['schemes']
    sources={};rows=[];audits=[]
    for r in data:
        for p,h in r['sourceHashes'].items():assert sha(p)==h,p
        assert r['initialMap']==data[0]['initialMap']
        audit=memory_r2.audit(prior,{**r,'capacity':[21,21]});assert audit['M']==41 and audit['ordinaryDisplacedCount']==2 and audit['coverage']==399 and audit['branchCount']==0
        audits.append(dict(id=r['id'],M=41,D=2,coverage=399,unique=audit['unique'],branches=0))
        combined_keys={};combined_pairs={};expected_keys=0;expected_pairs=0;collision=[]
        for mode in ['keytao','sanpin']:
            for kind,w in zip(KINDS,WEIGHTS):
                track=r['terminalCodes'][mode][kind]
                expected_keys+=w*track['meanKeys']/12;expected_pairs+=w*track['meanPairs']/12
                for k,v in track['expectedKeys'].items():combined_keys[k]=combined_keys.get(k,0)+w*v/12
                for k,v in track['expectedPairs'].items():combined_pairs[k]=combined_pairs.get(k,0)+w*v/12
                raw=r['rawMainCode'][mode]
                target=raw['jointWord2Word4']['byKind'][kind] if kind in ['word2','word4'] else raw['intrinsic'][kind]['byKind'][kind]
                assert abs(target['nonFirstRate']-r['modes'][mode][kind]['firstAuxRate'])<1e-12
                assert abs(sum(v for rank,v in track['rankMass'].items() if int(rank)>1)-r['modes'][mode][kind]['selectionRate'])<1e-12
        assert abs(sum(combined_keys.values())-expected_keys)<1e-10
        assert abs(sum(combined_pairs.values())-expected_pairs)<1e-10
        e=r['ergonomics'];assert abs(e['meanKeys']-expected_keys)<1e-10
        for keys,field in [('QAZ','leftPinky'),("P;/[]\\'",'rightPinky'),("ASDFGHJKL;'",'home')]:
            assert abs(sum(combined_keys.get(k,0) for k in keys)/expected_keys-e[field])<1e-12
        same_hand=0;same_finger=0;different_key_same_finger=0
        for p,v in combined_pairs.items():
            a,b=LAYOUT[p[0].lower()],LAYOUT[p[1].lower()]
            if (a[0]<5)==(b[0]<5):same_hand+=v
            if a[2]==b[2]:
                same_finger+=v
                if p[0]!=p[1]:different_key_same_finger+=v
        assert abs(same_hand/expected_pairs-e['sameHand'])<1e-12
        assert abs(same_finger/expected_pairs-e['sameFinger'])<1e-12
        assert abs(different_key_same_finger/expected_pairs-e['differentKeySameFinger'])<1e-12
        chen_value=sum(v*chen['matrix'][chen_index[p[0]]][chen_index[p[1]]] for p,v in combined_pairs.items())/expected_pairs
        daily={}
        for name,corpus in corpora.items():
            daily[name]={}
            for variant in ['native-punctuation','hanzi-only']:
                tokens=[t for t in corpus['tokens'] if variant=='native-punctuation' or 'pinyin' in t]
                strokes=''.join(t.get('key') or r['codeList'][pindex[t['pinyin']]].lower() for t in tokens)
                result=evaluate(strokes,len(tokens));daily[name][variant]=result
        primary=daily['daily']['native-punctuation']
        if r['id'] in old_columns:
            old=old_columns[r['id']]['readmeBenchmarkMetrics']
            assert abs(primary['score']-old['dailyEightScenarioMovingHand'])<1e-10
            assert abs(r['common399']['frequencyWeightedNonFirst']-old['s2FrequencyWeightedMiss'])<1e-12
        for kind in KINDS:
            base=lambda mode:r['rawMainCode'][mode]['intrinsic'][kind]['byKind'][kind]['nonFirstRate']
            joint=lambda mode:r['rawMainCode'][mode]['jointWord2Word4']['byKind'][kind]['nonFirstRate'] if kind in ['word2','word4'] else base(mode)
            metric=lambda field:sum(r['modes'][mode][kind][field]/2 for mode in ['keytao','sanpin'])
            collision.append(dict(kind=kind,intrinsicMainCodeNonFirstRate=sum(base(m)/2 for m in ['keytao','sanpin']),sharedPoolMainCodeNonFirstRate=sum(joint(m)/2 for m in ['keytao','sanpin']),terminalSelectionRate=metric('selectionRate'),secondAuxRate=metric('secondAuxRate'),thirdAuxRate=metric('thirdAuxRate'),meanKeys=metric('meanKeys'),motorUpperMs=metric('motorUpperMs'),effectiveMs=metric('effectiveMs')))
        rows.append(dict(id=r['id'],label=r['label'],ckt=r['ckt'],policies=r['policies'],common399=r['common399'],aggregate=r['aggregate'],ergonomics={k:v for k,v in e.items() if k not in ['sufficientStatistics','byTrack','keyShares']},chenWithinCodePairCost=chen_value,daily= daily,collisionByKind=collision))
        p=Path(str(PREFIX)+'-'+r['id']+'.json');sources[str(p)]=sha(p)
    partition_checks=[]
    for a,b in [(0,2),(1,3)]:
        for mode in ['keytao','sanpin']:
            for kind in KINDS:
                assert data[a]['rawMainCode'][mode]['intrinsic'][kind]['partitionSha256']==data[b]['rawMainCode'][mode]['intrinsic'][kind]['partitionSha256']
        partition_checks.append(dict(first=IDS[a],second=IDS[b],intrinsicCharacterAndAllWordLengthsIdentical=True,scope='Partition of base-code row IDs, before word2/word4 shared-pool competition; physical codes may differ.'))
    for r in data[1:]:
        for mode in ['keytao','sanpin']:
            assert r['modes'][mode]['word3']==data[0]['modes'][mode]['word3']
    for p in [Path(__file__),prior_path,corpora_path,chen_path,columns_path,REPLAY/'macroxue/engine.py',REPLAY/'memory_r2.py',REPLAY/'audit.py']:
        sources[str(p)]=sha(p)
    output=dict(completed=True,scope='Five fixed U7E-initial M41 candidates, each own robust policy. Terminal-letter loads include auxiliaries; 1:3:1:1 event mix, members equal, weighted expected keystrokes before shares. Pair rates are code-internal, not natural-text typing. Daily moving-hand uses frozen natural-text raw two-key codes and punctuation, excludes auxiliaries/selection/space/errors; its relative cost is not ms or fatigue.',rows=rows,verification=dict(independentMemory=audits,independentExpectedKeyPairAggregation=True,independentFingerGeometry=True,rawMissEqualsFirstAuxRate=True,terminalRankMassEqualsSelectionRate=True,baselineDailyReplayExact=True,pairedIntrinsicPartitionChecks=partition_checks,allWord3TracksExactlyIdentical=True),sourceHashes=sources)
    write(str(PREFIX)+'-summary.json',output)
    for row in rows:
        e=row['ergonomics'];print(row['label'],[round(row['daily']['daily']['native-punctuation']['score'],6),round(e['home']*100,4),round(e['differentKeySameFinger']*100,4),round(e['leftPinky']*100,4),round(e['rightPinky']*100,4),round(row['chenWithinCodePairCost'],6)],'miss',row['common399']['frequencyWeightedNonFirst'],'selection',row['aggregate']['selectionRate'])

if __name__=='__main__':main()
