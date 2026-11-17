"""Validate a stopped fixed-Lan checkpoint and optionally CPU-replay its frontier."""
import argparse
import json
from pathlib import Path
import sqlite3
from types import SimpleNamespace
import zipfile

from run_cr_lan_213 import ROOT,LanSpace,production,admissible,source_contract
from run_cr_m24_portfolio import checked_metrics
from run_cr_anneal import Engine,atomic_json
from search_cr_667_zero_carriers import sha


def check(folder,bundle,replay=False):
    folder=folder.resolve()
    with sqlite3.connect('file:'+ (folder/'search.sqlite').as_posix()+'?mode=ro',uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity failed')
        cp=json.loads(db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone()[0])
        cache_rows=db.execute('SELECT COUNT(*) FROM cache').fetchone()[0]
    with zipfile.ZipFile(bundle) as z:manifest=json.loads(z.read('manifest.json'))
    for name,expected in manifest['files'].items():
        if Path(name).name!=name or sha(folder/'inputs'/name)!=expected:raise ValueError('changed frozen input '+name)
    c=cp['contract'];settings=SimpleNamespace(seed=c['seed'],batch=c['batch'],cycle=c['cycle'],temp=c['temp'],min_temp=c['minTemp'],
        exchange_every=c['exchangeEvery'],verify_every=c['verifyEvery'],cache_limit=c['cacheLimit'])
    if source_contract(settings,manifest)!=c:raise ValueError('source/parameter contract mismatch')
    space=LanSpace(folder/'inputs');p=space.constraints;routes=space.spec['routes']
    for row in cp['frontier']+cp['chains']:
        if space.key(row['state'])!=row['key']:raise ValueError('layout key mismatch')
        if space.memory(row['state'])!={k:row['metrics'][k] for k in ['d','m','guard']}:raise ValueError('memory/onset invariant failed')
        if abs(space.daily(row['state'])['daily']-row['metrics']['daily'])>1e-9:raise ValueError('daily replay mismatch')
        if not any(admissible(row['metrics'],p,route) for route in routes.values()):raise ValueError('outside exploration domain')
    for chain in cp['chains']:
        if not admissible(chain['metrics'],p,routes[chain['route']]):raise ValueError('chain violates its route')
    if not all(r['metrics']['verified'] for r in cp['frontier']):raise ValueError('frontier lacks exact CPU audit')
    feasible=[r for r in cp['frontier'] if production(r['metrics'],p)]
    published=json.loads((folder/'solutions.json').read_text(encoding='utf8'))
    if {r['key'] for r in published['layouts']}!={r['key'] for r in feasible}:raise ValueError('solutions/diagnostic archive mismatch')
    engine=None
    try:
        if replay:
            engine=Engine(ROOT/'research/ckt-v4-core/target/release/score-toned-stream.exe',folder/'inputs','cpu',2,300)
            for row in cp['frontier']:
                checked_metrics(space,row['state'],engine.score([space.expand(row['state'])],True)[0],row['metrics'])
    finally:
        if engine:engine.close()
    best=max(feasible,key=lambda r:(r['metrics']['daily'],-r['metrics']['ckt']),default=None)
    return dict(version='cr-lan-213-check-v1',integrity='ok',round=cp['round'],evaluations=cp['evaluations'],cacheRows=cache_rows,
        chains=len(cp['chains']),steps=[r['steps'] for r in cp['chains']],accepted=sum(r['accepted'] for r in cp['chains']),
        restarts=sum(r['restarts'] for r in cp['chains']),exchanges=cp['exchanges'],operatorCounts=cp['operatorCounts'],
        proposalSizeCounts=cp['proposalSizeCounts'],proposalAttempts=cp['proposalAttempts'],
        feasibleFrontier=len(feasible),diagnosticFrontier=len(cp['frontier'])-len(feasible),
        bestFeasible=None if best is None else dict(key=best['key'],metrics=best['metrics']),
        cpuReplayedFrontier=replay,bundleSha256=sha(bundle),sourceContract=c,
        sourceHashes={p:sha(ROOT/p) for p in ['tools/run_cr_lan_213.py','tools/prepare_cr_lan_213.py',
            'tools/run_cr_lan_213.ps1','tools/check_cr_lan_213.py','tests/test_cr_lan_213.py']})


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path)
    p.add_argument('--bundle',type=Path,default=ROOT/'research/config/cr-lan-213-inputs.zip')
    p.add_argument('--cpu-replay',action='store_true');p.add_argument('--report',type=Path);a=p.parse_args()
    report=check(a.output,a.bundle,a.cpu_replay)
    if a.report:atomic_json(a.report,report)
    print(json.dumps({k:v for k,v in report.items() if k not in ['sourceContract','sourceHashes']}))
