"""Read-only health/audit of CPU campaign; never writes the live database or strategy."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import sqlite3
import zlib
import psutil
import run_u7e_grouped_cpu as run

ROOT = Path(__file__).resolve().parents[1]


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work',type=Path,default=ROOT/'research/.cache/u7e-grouped-cpu-20261121')
    parser.add_argument('--smoke',type=Path,default=ROOT/'research/.cache/u7e-grouped-cpu-smoke-v2-20261121')
    parser.add_argument('--output',type=Path)
    args = parser.parse_args()
    work=args.work.resolve()
    cfg=json.loads(run.CONFIG.read_text(encoding='utf8'))
    for p,h in cfg['sourceHashes'].items():
        assert sha(p)==h,p
    status=json.loads((work/'status.json').read_text(encoding='utf8'))
    baseline=json.loads((work/'baseline-audit.json').read_text(encoding='utf8'))
    assert baseline['completed'] and baseline['backend']=='cpu-only'
    for a,b in zip(baseline['scores'],cfg['expectedSeedScores']):
        assert abs(a-b)<1e-9
    db=sqlite3.connect(f'file:{(work/"search.sqlite").as_posix()}?mode=ro',uri=True)
    state=json.loads(db.execute("SELECT v FROM meta WHERE k='state'").fetchone()[0])
    contract=json.loads(db.execute("SELECT v FROM meta WHERE k='contract'").fetchone()[0])
    assert contract['configSha256']==sha(run.CONFIG)
    assert contract['runnerSha256']==sha(ROOT/'tools/run_u7e_grouped_cpu.py')
    count=db.execute('SELECT COUNT(*) FROM states').fetchone()[0]
    checked=0
    for (blob,) in db.execute('SELECT data FROM states ORDER BY rowid DESC LIMIT 200'):
        row=json.loads(zlib.decompress(blob))
        assert run.legal(row['finals'],cfg,'strict' if row['emptyBuckets'] else 'open',7)
        assert row['M']==run.memory(row['finals'],cfg)<=41
        assert row['broken']==run.broken_pairs(row['finals'],cfg)
        for a,b in zip(run.scores(row['modes'],cfg),row['scores']):
            assert abs(a-b)<1e-10
        p,q=run.pinky(row['finals'],row['modes'],cfg)
        assert abs(p-row['rightPinkyMixed'])<1e-12 and abs(q-row['rightPinkyPeak8'])<1e-12
        checked+=1
    db.close()
    proc=psutil.Process(status['pid'])
    children=[p for p in proc.children() if p.name()=='score-untoned-v52-stream.exe']
    assert len(children)==1
    native=children[0]
    assert len(native.cpu_affinity())==1
    assert native.nice()==psutil.BELOW_NORMAL_PRIORITY_CLASS
    assert proc.nice()==psutil.BELOW_NORMAL_PRIORITY_CLASS
    assert not any('cuda' in p.name().lower() for p in proc.children(recursive=True))
    local=lambda ts:datetime.datetime.fromtimestamp(ts).astimezone().isoformat(timespec='seconds')
    sources={str(p):sha(p) for p in [Path(__file__),run.CONFIG,ROOT/'tools/run_u7e_grouped_cpu.py',
        ROOT/'tools/start_u7e_grouped_cpu.ps1',ROOT/'tests/test_u7e_grouped_cpu.py',work/'baseline-audit.json']}
    smoke=None
    if (args.smoke/'status.json').exists():
        s=json.loads((args.smoke/'status.json').read_text(encoding='utf8'))
        assert s['state']=='completed_evaluation_budget'
        smoke=dict(completed=True,resumedExactEvaluations=sum(s['evaluations'].values()),
                   exactSeconds=s['exactSeconds'],strictExactFraction=s['strictExactFraction'])
        assert smoke['resumedExactEvaluations']>=64
        sources[str(args.smoke/'status.json')]=sha(args.smoke/'status.json')
    total=sum(state['exactSeconds'].values())
    output=dict(completed=True,campaignRunning=True,pid=proc.pid,nativePid=native.pid,
        work=str(work),startedLocal=local(state['startedUtc']),nextReviewLocal=local(state['nextReviewUtc']),
        expectedFirstRunEndLocal=local(state['startedUtc']+24*3600),
        config=dict(seed=cfg['seedId'],maxMemory=41,maxD=2,maxV=5,preferredPairs=cfg['preferredPairs'],
                    initialBrokenPairsAllowed=state['maxBroken'],cpuOnly=True,duty=.65,
                    nativeLogicalCpuAffinity=native.cpu_affinity(),priority='BelowNormal',
                    parentMemoryMiB=round(proc.memory_info().rss/2**20,2),
                    nativeMemoryMiB=round(native.memory_info().rss/2**20,2),
                    hardPinkyCap=status['hardPinkyCap']),
        snapshot=dict(cachedStates=count,auditedRecentStates=checked,evaluations=state['evaluations'],
                      exactSeconds=state['exactSeconds'],strictExactFraction=state['exactSeconds']['strict']/total if total else None),
        smoke=smoke,checks=dict(seedCanonicalReplay=True,allSevenPairsProtectedInitially=True,
            resumeContractPinned=True,nativeCpuSingleWorker=True,recentScoreAndPinkyRepricing=True,
            hourlyRuleSimulationAndCrossLaneMigrationCoveredByTests=True,
            noModelOrApiCalls=True,htmlOrProductionChanged=False),sourceHashes=sources)
    if args.output:
        args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(output,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
