"""Bounded Common399 M-R2 neighborhood screen; leaves production untouched."""
import base64
import argparse
import copy
import gzip
import gc
import hashlib
import itertools
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--seed-report', type=Path)
parser.add_argument('--seed-id')
parser.add_argument('--tag', default='untoned-2121-v51')
parser.add_argument('--relaxed-home', action='store_true')
parser.add_argument('--allow-occupied', action='store_true')
parser.add_argument('--no-historical', action='store_true')
parser.add_argument('--screen-width', type=int, default=12)
args = parser.parse_args()
CACHE = ROOT / 'research/.cache' / args.tag
CACHE.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'research/.cache/R11_integrated_replay'))
from memory_r2 import audit
from audit import split
from macroxue.engine import evaluate

html = (ROOT / 'a7_CKT_R11.html').read_text(encoding='utf-8')
data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)', html)[1])))
baseline = next(e for e in data['entries'] if e['id'] == 'QZ-e8f37a0998f9')
expected_score = 9.56789806405906
expected_moving_hand = 135.21763800074055
if args.seed_report:
    seed = next(e for e in json.loads(args.seed_report.read_text())['results'] if e['id'] == args.seed_id)
    baseline = copy.deepcopy(baseline)
    baseline['initialMap'] = seed['initialMap']
    baseline['finalMap'] = seed['finalMap']
    for i, py in enumerate(data['pinyin']):
        if baseline['codeList'][i]:
            h, r = split(py, baseline['initialMap']['Y'] != baseline['initialMap']['YU'])
            baseline['codeList'][i] = baseline['initialMap'][h] + baseline['finalMap']['ve' if r == 'ue' else r]
    expected_score, expected_moving_hand = seed['score'], seed['movingHand']
assert audit(data, baseline)['M'] == 42
candidates = []
seen = set()
def visit(entry, mutation):
    codes = entry['codeList']
    signature = tuple(codes)
    if signature in seen:
        return
    seen.add(signature)
    common = [codes[p] for p, _ in data['base']]
    if any(not c for c in common) or (not args.allow_occupied and ('QZ' in common or 'ZQ' in common)):
        return
    if [len({c[i] for c in common}) for i in (0, 1)] != [21, 21]:
        return
    if any(set(c) & set(entry['tone']) for c in common):
        return
    a = audit(data, entry)
    if a['M'] > 42 or a['ordinaryDisplacedCount'] > 2 or not a['allowedStructure']:
        return
    entry['id'] = f'N{len(candidates):04}'
    entry['mutation'] = mutation
    entry['audit'] = {k: a[k] for k in ['M', 'ordinaryDisplacedCount', 'coverage', 'unique', 'branchCount']}
    entry['audit'].update(qzEmpty='QZ' not in common, zqEmpty='ZQ' not in common)
    candidates.append(entry)

visit(copy.deepcopy(baseline), 'baseline')
for field, position in [('initialMap', 0), ('finalMap', 1)]:
    for a, b in itertools.combinations(baseline[field], 2):
        if baseline[field][a] == baseline[field][b]:
            continue
        e = copy.deepcopy(baseline)
        e[field][a], e[field][b] = e[field][b], e[field][a]
        for i, py in enumerate(data['pinyin']):
            if not baseline['codeList'][i]:
                continue
            h, r = split(py, e['initialMap']['Y'] != e['initialMap']['YU'])
            if r == 'ue': r = 've'
            e['codeList'][i] = e['initialMap'][h] + e['finalMap'][r]
        visit(e, f'{field}:{a}({baseline[field][a]})<->{b}({baseline[field][b]})')
if args.allow_occupied and not args.no_historical:
    for entry in data['entries']:
        if entry.get('capacity') == [21, 21] and entry.get('tone') == baseline['tone'] and entry.get('initialMap') and entry.get('finalMap'):
            visit(copy.deepcopy(entry), 'historical:' + entry['id'])
corpus = json.loads((ROOT / 'research/.cache/R11_integrated_replay/R9_corpora.json').read_text(encoding='utf-8'))['daily']['tokens']
indices = {py: i for i, py in enumerate(data['pinyin'])}
for e in candidates:
    strokes = ''.join(t.get('key') or e['codeList'][indices[t['pinyin']]].lower() for t in corpus)
    e['movingHand'] = evaluate(strokes, len(corpus))['score']
assert abs(candidates[0]['movingHand'] - expected_moving_hand) < 1e-8
(CACHE / 'candidates.json').write_text(json.dumps(candidates), encoding='utf-8')
provenance = {'benchmarkCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'snowCommit': subprocess.check_output(['git', '-C', 'D:/C2D/Documents/rime-snow-pinyin', 'rev-parse', 'HEAD'], text=True).strip(),
              'payloadSha256': hashlib.sha256(html.encode()).hexdigest(),
              'candidateSha256': hashlib.sha256((CACHE / 'candidates.json').read_bytes()).hexdigest(),
              'constraint': 'M-R2 <=42; D <=2; Common399 coverage399; actual capacity21x21; original auxiliary semantics; QZ/ZQ occupancy follows allowOccupied',
              'seedReport': str(args.seed_report), 'seedId': args.seed_id, 'relaxedHome': args.relaxed_home, 'allowOccupied': args.allow_occupied,
              'scope': 'One token transposition from selected seed; fixed production auxiliary policies; proxy preselection, not exhaustive CKT optimization'}
(ROOT / f'research/notes/2026-11-14-{args.tag}-provenance.json').write_text(json.dumps(provenance, indent=2))

# Reuse the production scoring functions verbatim; only replace the CLI and
# execution harness. All candidates and the anchor use the same v5.1 policy.
source = (ROOT / 'tools/score_ckt_v5_v51_scheme.js').read_text(encoding='utf-8')
source = source.replace('require("./auxiliary_semantics.js")', 'require(' + json.dumps(str(ROOT / 'tools/auxiliary_semantics.js')) + ')')
source = source.replace('const benchmark = path.resolve(__dirname, "..");', 'const benchmark = ' + json.dumps(str(ROOT)) + ';')
source = source.replace('entry.capacity[1] !== 26', 'entry.capacity[1] !== 21')
source = source[:source.index('  const v5Reference =')] + r'''
  const policy = {keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
  const reference = Object.fromEntries(['keytao','sanpin'].map(mode => [mode,evaluateV51ReferenceMode(referenceEntry,mode,policy[mode])]));
  const candidates = JSON.parse(fs.readFileSync(path.join(__dirname,'candidates.json'),'utf8'));
  function proxy(e) {
    let total=0,home=0,cost=0;
    for(const [p,w] of data.base) {const c=e.codeList[p];total+=w;home+=w*[...c].filter(k=>'ASDFGHJKL'.includes(k)).length/2;cost+=w*motor(c).upperMs;}
    return {home:home/total,motor:cost/total};
  }
  for(const e of candidates) e.proxy=proxy(e);
  const base=candidates[0];
  // Keep both comfort-preserving and unconstrained speed directions.
  const rank=[...candidates].sort((a,b)=>a.proxy.motor-b.proxy.motor);
  const small=[...candidates].filter(e=>e.proxy.motor<base.proxy.motor).sort((a,b)=>b.proxy.motor-a.proxy.motor);
  const selected=RELAXED_HOME ? [base,...rank.slice(0,12),...small.slice(0,12),...rank.filter(e=>e.movingHand>=base.movingHand).slice(0,12),...rank.filter(e=>e.mutation.startsWith('initialMap')).slice(0,4)] : [base,...rank.filter(e=>e.proxy.home>=base.proxy.home).slice(0,20),...rank.slice(0,12),...small.slice(0,12),...rank.filter(e=>e.mutation.startsWith('initialMap')).slice(0,8),...rank.filter(e=>e.proxy.home>=base.proxy.home && e.movingHand>=base.movingHand).slice(0,12)];
  if(RELAXED_HOME) selected.push(...candidates.filter(e=>/finalMap:(v\(.*<->vn\(|van\(.*<->vn\(|in\(.*<->iu\(|ia\(.*<->v\()/.test(e.mutation)));
  if(ALLOW_OCCUPIED) selected.push(...rank.filter(e=>!e.audit.qzEmpty||!e.audit.zqEmpty).slice(0,12),...rank.filter(e=>e.mutation.startsWith('historical:')).slice(0,8));
  if(ALLOW_OCCUPIED) selected.push(...rank.filter(e=>(!e.audit.qzEmpty||!e.audit.zqEmpty)&&!e.mutation.startsWith('historical:')).slice(0,12),...rank.filter(e=>e.mutation.startsWith('historical:QZ-')).slice(0,5));
  const unique=[...new Map(selected.map(e=>[e.id,e])).values()];
  const results=fs.existsSync(args.output)?JSON.parse(fs.readFileSync(args.output,'utf8')).results:[];
  for(const r of results) r.movingHand=candidates.find(e=>e.id===r.id && e.mutation===r.mutation).movingHand;
  for(const e of unique) {
    if(results.some(r=>r.id===e.id && r.mutation===e.mutation)) continue;
    const modes=Object.fromEntries(['keytao','sanpin'].map(mode=>[mode,evaluateV51ReferenceMode(e,mode,policy[mode])]));
    const result={id:e.id,mutation:e.mutation,audit:e.audit,proxy:e.proxy,movingHand:e.movingHand,score:normalizedScore(modes,reference),initialMap:e.initialMap,finalMap:e.finalMap};
    results.push(result); console.log(JSON.stringify({mutation:result.mutation,score:result.score}));
    fs.writeFileSync(args.output,JSON.stringify({generated:candidates.length,selected:unique.length,screen:'Common399 two-key motor: top20 home-preserving + top12 unrestricted + 12 smallest improvements + top8 initial swaps + top12 preserving home and moving-hand',policy,results},null,2));
  }
  if(Math.abs(results.find(r=>r.mutation==='baseline').score-EXPECTED_SCORE)>1e-10) throw Error('seed baseline mismatch');
}
main();
'''
source = source.replace('RELAXED_HOME', json.dumps(args.relaxed_home)).replace('ALLOW_OCCUPIED', json.dumps(args.allow_occupied)).replace('EXPECTED_SCORE', repr(expected_score))
source = source.replace('slice(0,12)', f'slice(0,{args.screen_width})')
if args.relaxed_home:
    source = source.replace('Common399 two-key motor: top20 home-preserving + top12 unrestricted + 12 smallest improvements + top8 initial swaps + top12 preserving home and moving-hand', 'Common399 two-key motor: top12 unrestricted + 12 smallest improvements + top12 preserving moving-hand + top4 initial swaps; no home gate')
(CACHE / 'score.js').write_text(source, encoding='utf-8')
print('legal candidates:', len(candidates), flush=True)
del data, html, candidates, baseline
gc.collect()
subprocess.run(['node', str(CACHE / 'score.js'), '--id', 'QZ-e8f37a0998f9', '--html', str(ROOT / 'a7_CKT_R11.html'), '--snow', 'D:/C2D/Documents/rime-snow-pinyin', '--output', str(ROOT / f'research/notes/2026-11-14-{args.tag}-neighbors.json')], check=True)
