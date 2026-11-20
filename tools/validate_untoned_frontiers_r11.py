"""Independently audit the published eight-frontier payload and provenance."""
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-20-untoned-frontiers-r11'
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
sys.path[:0]=[str(REPLAY),str(ROOT/'tools')]
import memory_r2
from integrate_shenyun_21x26_production import missing_by_map

def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))

hashes={}
def sha(p):
    p=Path(p)
    if str(p) not in hashes:
        hashes[str(p)]=hashlib.sha256(p.read_bytes()).hexdigest()
    return hashes[str(p)]

def check_sources(report):
    for p,expected in report['sourceHashes'].items():
        assert sha(p)==expected,p

def git_source_audit():
    differences=[]
    checked=0
    for source,expected in list(hashes.items()):
        file=Path(source)
        try:
            relative=file.relative_to(ROOT).as_posix()
        except ValueError:
            continue
        blob=subprocess.run(['git','show',':'+relative],cwd=ROOT,capture_output=True)
        if blob.returncode:
            continue
        checked+=1
        blob_sha=hashlib.sha256(blob.stdout).hexdigest()
        if blob_sha!=expected:
            assert blob.stdout.replace(b'\r\n',b'\n')==file.read_bytes().replace(b'\r\n',b'\n'),relative
            differences.append(dict(path=relative,lineEndingsOnly=True,workingSHA256=expected,gitBlobSHA256=blob_sha))
    return dict(verifiedTrackedFiles=checked,lineEndingDifferences=differences)

def main():
    config=read(str(PREFIX)+'-candidates.json')
    publication=read(str(PREFIX)+'-publication.json')
    browser=read(str(PREFIX)+'-browser.json')
    assert publication['completed'] and browser['completed']
    for report in [config,publication,browser]:
        check_sources(report)
    assert sha(publication['html'])==publication['htmlAfterSha256']==browser['htmlSha256']
    text=Path(publication['html']).read_text(encoding='utf-8')
    start=text.index('>',text.index('<script id="payload"'))+1
    end=text.index('</script>',start)
    data=json.loads(gzip.decompress(base64.b64decode(text[start:end])))
    del text
    entries={e['id']:e for e in data['entries']}
    assert len(entries)==len(data['entries'])==866
    assert data['finalSelection']['currentCatalogueCount']==866
    ids={r['id'] for r in config['candidates']}
    missing={k:sorted(v) for k,v in missing_by_map(data,ids).items()}
    assert not any(missing.values()),missing
    results=[]
    for candidate in config['candidates']:
        ident=candidate['id']
        entry=entries[ident]
        replay=read(str(PREFIX)+'-scores-'+ident+'.json')
        check_sources(replay)
        audit=memory_r2.audit(data,entry)
        assert audit['M']==candidate['M']==entry['memoryAuditR2']['M']
        assert audit['ordinaryDisplacedCount']==2 and audit['branchCount']==0
        assert audit['coverage']==399
        codes=[entry['codeList'][p] for p,_ in data['base']]
        assert 'QZ' not in codes and 'ZQ' not in codes
        for i in [0,1]:
            keys={code[i] for code in codes}
            assert len(keys)==21 and not keys.intersection('AVUIO')
        assert entry['tone']=='IVUAO'
        metrics=entry['productionCandidateMetrics']
        assert metrics['productionMetricVersion']=='v52'
        assert metrics['cktV52Policies']['candidate']==replay['policies']
        assert metrics['cktV52AuxOrderSelection']['selectedPolicies']==replay['robustSelection']['selectedPolicies']
        for field,expected in replay['v52']['aggregate'].items():
            assert math.isclose(metrics['cktV52Aggregate'][field],expected,rel_tol=0,abs_tol=1e-10)
            name='aggregate'+field[0].upper()+field[1:]
            assert math.isclose(entry['readmeBenchmarkMetrics'][name],expected,rel_tol=0,abs_tol=1e-10)
        assert math.isclose(data['cktV52']['schemes'][ident]['v52']['score'],replay['v52']['score'],abs_tol=1e-12)
        assert math.isclose(metrics['cktV52CostDoubled'],replay['doubledScore'],abs_tol=1e-12)
        components=read_components(candidate['componentSource'])
        for mode in ['keytao','sanpin']:
            assert len(components['cases'][mode]['results'])==144
            for row in components['cases'][mode]['results']:
                for track in row['tracks'].values():
                    effective=track['motorUpperMs']+sum(track[f]*c for f,c in zip(components['coefficients'],components['baselineCostsMs']))
                    assert abs(effective-track['effectiveMs'])<1e-9
        results.append(dict(id=ident,M=audit['M'],D=2,coverage=399,branches=0,
            qzEmpty=True,zqEmpty=True,score=replay['v52']['score'],two=replay['doubledScore']))
    result=dict(completed=True,htmlSha256=publication['htmlAfterSha256'],catalogue=866,
        preservedExistingSchemes=publication['preservedExistingSchemes'],independentPythonMemoryAudit=results,
        missingByBenchmarkMap=missing,verifiedSourceFiles=len(hashes),sourceGitBlobAudit=git_source_audit(),browserPageErrors=browser['pageErrors'],
        sourceHashes={str(p):sha(p) for p in [Path(__file__),REPLAY/'memory_r2.py',REPLAY/'audit.py',
            ROOT/'tools/integrate_shenyun_21x26_production.py',Path(str(PREFIX)+'-publication.json'),Path(str(PREFIX)+'-browser.json')]})
    Path(str(PREFIX)+'-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(result,ensure_ascii=False))

def read_components(p):
    return json.loads(gzip.decompress(Path(p).read_bytes()))

if __name__=='__main__':
    main()
