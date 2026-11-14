"""Original M-R2 audit of every newly fully scored annealing state, resumable by key."""
import base64
import gzip
import json
import re
from verify_untoned_2126_recenter_memory import ROOT, HEADS, FINALS, audit, split, sha

DIRECTORY=ROOT/'research/.cache/untoned-2126-anneal-100k-20261115'


def main():
    checkpoint_file=DIRECTORY/'checkpoint.json'
    saved=json.loads(checkpoint_file.read_text(encoding='utf-8'))
    for file,digest in saved['sourceHashes'].items():
        assert sha(file)==digest, f'Source changed: {file}'
    html=(ROOT/'a7_CKT_R11.html').read_text(encoding='utf-8')
    data=json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)',html)[1])))
    production=next(e for e in data['entries'] if e['id']=='SNOW-SHENYUN-21X26-D3V1-BALANCED')
    pairs=[]
    for py,code in zip(data['pinyin'],production['codeList']):
        if code is None:
            pairs.append(None)
        else:
            h,f=split(py,True)
            pairs.append((HEADS.index(h),27+FINALS.index('ve' if f=='ue' else f)))
    contract={'fingerprint':saved['fingerprint'],'memoryScriptSha256':sha(ROOT/'research/.cache/R11_integrated_replay/memory_r2.py'),'auditorSha256':sha(__file__),'helperSha256':sha(ROOT/'tools/verify_untoned_2126_recenter_memory.py')}
    cache_file=DIRECTORY/'memory-verified-keys.json.gz'
    verified=set()
    if cache_file.exists():
        previous=json.loads(gzip.decompress(cache_file.read_bytes()))
        assert previous['contract']==contract
        verified.update(previous['keys'])
    journal_file=DIRECTORY/'scores.jsonl'
    # Read a stable prefix; an in-flight final line is never counted as verified.
    raw_journal=journal_file.read_bytes()
    complete=raw_journal[:raw_journal.rfind(b'\n')+1]
    rows=[json.loads(line) for line in complete.splitlines() if line]
    seen=set();added=0
    for row in rows:
        assert row['fingerprint']==saved['fingerprint'] and row['key'] not in seen
        seen.add(row['key'])
        if row['key'] in verified:
            continue
        state=base64.b64decode(row['key'])
        assert len(state)==62 and all(k<26 for k in state)
        keys=[chr(65+k) for k in state]
        codes=[None if pair is None else keys[pair[0]]+keys[pair[1]] for pair in pairs]
        result=audit(data,{**production,'codeList':codes})
        assert result['M']==row['audit']['M']<=40
        assert result['ordinaryDisplacedCount']==row['audit']['D']<=3
        assert result['branchCount']==row['audit']['branches']==0
        assert result['unique']==result['coverage']==399
        assert sum(keys[27+FINALS.index(v)]!=v.upper() for v in 'aeiou')==row['audit']['V']<=1
        common=[codes[p] for p,_ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common
        assert set(c[0] for c in common).isdisjoint('AEUIO')
        verified.add(row['key']);added+=1
        if added%5000==0:
            print(json.dumps({'memoryNew':added,'prefixTotal':len(rows),'verifiedCached':len(verified)}),flush=True)
    cache_file.write_bytes(gzip.compress(json.dumps({'contract':contract,'keys':sorted(verified)}).encode(),compresslevel=9,mtime=0))
    report={'version':1,'passed':True,**contract,'completedAtSnapshot':saved['completed'],'uniqueNewHardLegalVerified':len(seen),'newlyAudited':added,'journalBytesVerified':len(complete)}
    if saved['completed']:
        assert len(complete)==len(raw_journal)
        assert len(seen)==saved['options']['newFullScores']==saved['totalNew']==100000
        assert sha(journal_file)==saved['scoreJournalSha256']
        report['journalSha256']=sha(journal_file)
    (ROOT/'research/notes/2026-11-15-untoned-2126-anneal-100k-memory-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))


if __name__=='__main__':
    main()
