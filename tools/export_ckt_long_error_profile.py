"""Rebuild pinned XGB errors and export a snapshot-bound experimental profile.

No human 5/6-key validation is implied. No upstream or production files are changed.
"""
import argparse
import ast
import base64
import contextlib
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

import numpy as np
import xgboost

ROOT = Path(__file__).resolve().parents[1]
PIN = 'e37cbcfe454f872f05df7b37c686be0b6974cf19'
SOURCES = {
    '分析-错误率.py': '4125b0b0077debb9bd1a5a22126a5eb2bfe9ea2535a84d3e6b825524f1b2b63b',
    '分析-按键时间.py': 'd710c08ae1efe6dd466ed0e93b1ea63da1ec7f93709d4b9e987b1d46f4367690',
    '数据/击键测速数据.tsv': 'e010cfe686660ff2579dccf95e27ed834121aa26a65bb744eec9750472c30f95',
}


def fingerprint(snapshot):
    h = hashlib.sha256((snapshot['keys']+'\0'+snapshot['commit']+'\0').encode())
    for role in snapshot['roles']:
        h.update((role+'\0').encode())
        h.update(base64.b64decode(snapshot['tables'][role]['base64']))
    return h.hexdigest()


def export(cache, output, all_roles=False):
    cache.mkdir(parents=True, exist_ok=True)
    upstream = cache/'upstream'
    for name, expected in SOURCES.items():
        p = upstream/name
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            url = f'https://raw.githubusercontent.com/zhanghaozhecn/better-keystroke-timing/{PIN}/'+urllib.parse.quote(name)
            p.write_bytes(urllib.request.urlopen(url, timeout=30).read())
        if hashlib.sha256(p.read_bytes()).hexdigest() != expected:
            raise ValueError('pinned input hash mismatch: '+name)
    p = upstream/'分析-错误率.py'
    source = p.read_text(encoding='utf-8')
    namespace = {'__file__':str(p.resolve()), '__name__':'long_error_profile_export'}
    # Pinned script trains the same models; stop before OOF diagnostics / artifact writes.
    prefix = source[:source.index('_oof = np.zeros(N)')]
    with (cache/'error-profile-fit.log').open('w', encoding='utf-8') as log, contextlib.redirect_stdout(log):
        exec(compile(prefix,str(p),'exec'),namespace)
        node = next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name == '_feat_by_name')
        exec(compile(ast.Module(body=[node],type_ignores=[]),str(p),'exec'),namespace)
    snapshot = json.loads((ROOT/'tools/ckt_v4_upstream_role_tables.json').read_text())
    if snapshot['commit'] != PIN:
        raise ValueError('unsupported upstream motor commit')
    ns = namespace
    letters = ns['LETTERS']
    if letters.upper() != snapshot['keys']:
        raise ValueError('key order mismatch')
    # Pair lookup arrays avoid materializing 837,000 Python context objects.
    bb = np.array([[f('a',b) for f in ns['FEATS_BB']] for b in letters])
    bb = (bb-ns['muB'])/ns['sdB']
    fi = np.array([ns['COL_TO_FINGER'][ns['LETTER_TO_COL'][b]] in (3,4) for b in letters],float)
    bb = np.column_stack([bb,(fi-ns['muI'][0])/ns['sdI'][0]])
    ab = np.array([[[f(a,b) for f in ns['FEATS_AB']] for b in letters] for a in letters])
    ab = (ab-ns['muF'])/ns['sdF']
    pa = np.array([[[f(p,a) for _,f in ns['PF_FUN']] for a in letters] for p in letters])
    pa = (pa-ns['muP'])/ns['sdP']
    next_features = []
    for i,(name,f) in enumerate(ns['NF_FUN']):
        lookup = np.array([[f('a',x,y) if '(b,n)' in name else f(x,'a',y) for y in letters] for x in letters])
        next_features.append(((lookup-ns['muN'][i])/ns['sdN'][i], '(b,n)' in name))
    tables = {}
    max_feature_difference = 0
    role_axes = {0:'ab',1:'abn',2:'pab',3:'abn',4:'pabn',5:'pab'}
    role_names = ['L2i1','L3i1','L3i2','L4i1','L4i2','L4i3']
    for role in (range(6) if all_roles else [4,5]):
        axes_names = role_axes[role]
        dimensions = len(axes_names)
        shape = [30]*dimensions
        values = np.empty(30**dimensions,dtype='<f4')
        for start in range(0,len(values),16384):
            stop = min(start+16384,len(values))
            axes = dict(zip(axes_names,np.unravel_index(np.arange(start,stop),shape)))
            empty = np.full(stop-start,30)
            p_,a,b,n = [axes.get(k,empty) for k in ['p','a','b','n']]
            features = np.zeros((stop-start,140),dtype=float)
            for offset,indices in [(0,p_),(31,a),(61,b),(91,n)]:
                features[np.arange(stop-start),offset+indices] = 1
            features[:,122:126] = bb[b]
            features[:,126:131] = ab[a,b]
            if 'p' in axes_names:
                features[:,131:133] = pa[p_,a]
            if 'n' in axes_names:
                for j,(lookup,is_bn) in enumerate(next_features):
                    features[:,133+j] = lookup[b if is_bn else a,n]
            features[:,137:140] = ns['ROLE_IND'][role]
            # Independent upstream named-feature path validates every block boundary.
            for row in {0,stop-start-1}:
                expected = ns['_feat_by_name'](letters[p_[row]] if 'p' in axes_names else '',
                    letters[a[row]],letters[b[row]],letters[n[row]] if 'n' in axes_names else '',role)
                max_feature_difference = max(max_feature_difference,float(np.max(np.abs(features[row,122:]-expected))))
            if max_feature_difference > 1e-10:
                raise ValueError('vectorized feature mismatch')
            values[start:stop] = ns['XGB_ERR'].predict_proba(features)[:,1]
        tables[role_names[role]] = dict(shape=shape,base64=base64.b64encode(values.tobytes()).decode())
        print('exported',role,len(values),flush=True)
    profile = dict(version='ckt-long-error-profile-v1',keys=snapshot['keys'],upstreamCommit=PIN,
        snapshotFingerprint=fingerprint(snapshot),errorRecoveryMs=snapshot['errorRecoveryMs'],
        positionDelta=float(ns['delta']),positionDeltaSE=float(ns['se'][ns['I_PS']]),
        fit=dict(events=len(ns['events']),errors=int(ns['Yerr'].sum()),xgboostVersion=xgboost.__version__,
                 sourceHashes=SOURCES,maximumNamedFeatureDifference=max_feature_difference),
        interpretation='Rebuilt pinned XGB context baseline plus companion LR position effect. Original separate error artifact unavailable; experimental, not calibrated for five/six keys.',
        errorTables=tables)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(profile,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in profile.items() if k!='errorTables'},ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,default=ROOT/'research/.cache/ckt-long-code-audit-20261118')
    parser.add_argument('--output',type=Path,default=ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile.json')
    parser.add_argument('--all-roles',action='store_true',help='Also export two/three/four-key boundary roles for block-success composition')
    args = parser.parse_args()
    export(args.cache,args.output,args.all_roles)
