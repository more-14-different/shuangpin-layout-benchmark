"""Freeze the four independently audited CR seeds and all runtime inputs."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
IDS = ['CR0-0374', 'CR1-0004', 'CR1-0009', 'CR1-1036']

def read(p):
    return json.loads((ROOT/p).read_text(encoding='utf-8-sig'))

def main():
    jobs = [read(f'research/.cache/cf1892-{r}-job.json') for r in ['r0','r1']]
    job = jobs[-1]; f = job['fixture']
    candidates = {c['id']:c for j in jobs for c in j['candidates']}
    bench = {r['id']:r for r in read('research/notes/2026-11-13-cf1892-regroup-benchmark.json')['results']}
    seeds = []
    for id in IDS:
        c, b = candidates[id], bench[id]
        seeds.append(dict(id=id, state=dict(partition=c['partition'], groupKeys=c['groupKeys'],
                          firstKeys=c['state']['firstKeys']), expected=dict(ckt=b['ckt']['v51']['score'],
                          daily=b['macro']['daily|native-punctuation']['score'],
                          pinky=b['ergonomics']['leftPinkyQAZPeak4NativeTracks']['value'])))
    data = read('research/.cache/toned-representative-macro-input.json')['data']
    assert data['pinyin'] == f['pinyin']
    first = {p:i for i,a in enumerate(f['atoms']) for p in a['pinyin']}
    final = {p:i for i,a in enumerate(f['rhymeAtoms']) for p in a['pinyin']}
    region = {t:i for i,r in enumerate(f['toneRegions']) for t in r['tones']}
    reading = {}
    for char, py, tone, weight, _ in data['characters']:
        if (char,py) not in reading or weight > reading[char,py][1]: reading[char,py] = tone,weight
    pi = {p:i for i,p in enumerate(f['pinyin'])}
    sequence = [t['key'] if 'key' in t else [first[pi[t['pinyin']]], final[pi[t['pinyin']]],
                region[reading[t['char'],pi[t['pinyin']]][0]]]
                for t in data['macroxue']['corpora']['daily']['tokens']]
    spec = dict(version=1, roots=job['rootNames'], finalRoots=job['finalRoots'], seeds=seeds,
                dailySequence=sequence, contract='CKT v5.1 native four tracks 1:3:1:1; 12/213/24; IVUAO; no QZ restriction')
    files = {'fixture.json':json.dumps(f,ensure_ascii=False).encode(),
             'seeds.json':json.dumps(spec,ensure_ascii=False).encode()}
    for name, source in {
        'corpus.bin':'research/.cache/ckt-v51-toned-native-corpus.bin',
        'snapshot.json':'tools/ckt_v4_upstream_role_tables.json',
        'moving_hand.py':'research/.cache/R11_integrated_replay/macroxue/engine.py',
        'MOVING_HAND_LICENSE':'research/.cache/R11_integrated_replay/macroxue/LICENSE',
    }.items(): files[name] = (ROOT/source).read_bytes()
    manifest = dict(version=1, files={n:hashlib.sha256(b).hexdigest() for n,b in files.items()},
                    seedAudit='research/notes/2026-11-13-cf1892-regroup-benchmark.json')
    files['manifest.json'] = json.dumps(manifest,indent=2).encode()
    target = ROOT/'research/config/cr-anneal-inputs.zip'
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data)
    print(target, target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest())

if __name__ == '__main__': main()
