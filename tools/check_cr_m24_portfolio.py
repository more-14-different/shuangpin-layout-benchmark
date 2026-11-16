"""Check a stopped portable portfolio checkpoint and report per-route results."""
import argparse
import json
from pathlib import Path
from types import SimpleNamespace
import sqlite3
import subprocess
import zipfile

from run_cr_m24_portfolio import ROOT,PortfolioSpace,eligible,source_contract
from run_cr_anneal import atomic_json,digest
from prepare_cr_m24_portfolio import sha


def check(folder,bundle):
    folder=folder.resolve()
    with sqlite3.connect('file:'+ (folder/'search.sqlite').as_posix()+'?mode=ro',uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('SQLite integrity check failed')
        cp=json.loads(db.execute('SELECT data FROM checkpoint WHERE id=1').fetchone()[0])
        cache_count=db.execute('SELECT COUNT(*) FROM cache').fetchone()[0]
    with zipfile.ZipFile(bundle) as z:manifest=json.loads(z.read('manifest.json'))
    for name,expected in manifest['files'].items():
        if Path(name).name!=name or sha(folder/'inputs'/name)!=expected:raise ValueError('frozen input mismatch: '+name)
    c=cp['contract'];settings=SimpleNamespace(seed=c['seed'],batch=c['batch'],cycle=c['cycle'],temp=c['temp'],min_temp=c['minTemp'],cache_limit=c['cacheLimit'])
    if c!=source_contract(settings,manifest):raise ValueError('checkpoint source/parameter contract changed')
    s=PortfolioSpace(folder/'inputs')
    for row in cp['frontier']+cp['chains']:
        if s.key(row['state'])!=row['key']:raise ValueError('wrong layout key')
        if s.memory(row['state'])!={k:row['metrics'][k] for k in ['d','m','guard']}:raise ValueError('wrong memory ledger')
        if abs(s.daily(row['state'])['daily']-row['metrics']['daily'])>1e-9:raise ValueError('daily replay mismatch')
        if not any(eligible(row['metrics'],p) for p in s.spec['profiles'].values()):raise ValueError('ineligible published checkpoint state')
    for chain in cp['chains']:
        if not eligible(chain['metrics'],s.spec['profiles'][chain['route']]):raise ValueError('chain violates its daily route')
    if not all(r['metrics']['verified'] for r in cp['frontier']):raise ValueError('frontier lacks CPU verification')
    report=dict(version='cr-m24-portfolio-check-v1',integrity='ok',round=cp['round'],evaluations=cp['evaluations'],cacheRows=cache_count,
        chains=len(cp['chains']),steps=[c['steps'] for c in cp['chains']],restarts=sum(c['restarts'] for c in cp['chains']),
        frontier=len(cp['frontier']),bestByRoute={name:min((r['metrics']['ckt'] for r in cp['frontier'] if eligible(r['metrics'],p)),default=None)
            for name,p in s.spec['profiles'].items()},bundleSha256=sha(bundle),sourceContract=cp['contract'],
        sourceHashes={p:sha(ROOT/p) for p in ['tools/run_cr_m24_portfolio.py','tools/run_cr_m24_portfolio.ps1',
            'tools/prepare_cr_m24_portfolio.py','tools/check_cr_m24_portfolio.py','tests/test_cr_m24_portfolio.py']})
    try:
        report['gpuObservedAtCheck']=subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total','--format=csv,noheader'],text=True,timeout=15).strip()
    except (OSError,subprocess.SubprocessError):report['gpuObservedAtCheck']=None
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path)
    p.add_argument('--bundle',type=Path,default=ROOT/'research/config/cr-m24-portfolio-inputs.zip');p.add_argument('--report',type=Path);a=p.parse_args()
    report=check(a.output,a.bundle)
    if a.report:atomic_json(a.report,report)
    print(json.dumps({k:v for k,v in report.items() if k not in ['sourceHashes','sourceContract']}))
