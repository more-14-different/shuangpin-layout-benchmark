"""Prepare two fixed-robust U7E M41 layouts and replay all ordinary R11 columns."""
import argparse
import gzip
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
import publish_untoned_frontiers_r11 as reviewed

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT/'research/notes/2026-11-21-u7e-pinky-r11'
WORK = ROOT/'research/.cache/u7e-pinky-r11-20261121'
TARGET = Path('D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html')
SPECS = [('UED-3158ce08b5bc', 'U7E M41 · 低右小指综合候选 UED-3158', 'low-pinky'),
         ('UPD-f254581a6f2d', 'U7E M41 · 低右小指5倍成本端 f254', 'pinky-descent')]


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def prepare():
    WORK.mkdir(exist_ok=True, parents=True)
    reviewed.WORK = WORK
    module = reviewed.load_integrator()
    candidates, sources = [], {}
    for ident, label, family in SPECS:
        stem = ROOT/f'research/notes/2026-11-21-u7e-{family}'
        score_path = Path(str(stem)+'-score-'+ident+'.json')
        policy_path = Path(str(stem)+'-policy-'+ident+'.json')
        robust_path = Path(str(stem)+'-robustness-'+ident+'.json')
        components_path = Path(str(stem)+'-components-'+ident+'.json.gz')
        score, policy, robust = read(score_path), read(policy_path), read(robust_path)
        assert score['completed'] and policy['completed'] and robust['completed']
        assert score['initialMap'] == policy['initialMap'] and score['finalMap'] == policy['finalMap']
        assert robust['inputSha256'] == sha(components_path)
        assert robust['selectedPolicies'] == {'keytao': '12/231/23', 'sanpin': '12/213/23'}
        assert score['audit']['M'] == 41 and score['audit']['D'] == 2
        assert not score['audit']['qz'] and not score['audit']['zq']
        assert score['auxiliarySemantics']['toneKeysByTone'] == 'IVUAO'
        assert score['auxiliarySemantics']['shapeKeysByMeaning'] == 'AVUIO'
        assert score['auxiliarySemantics']['toneDigitsByShapeMeaning'] == '42310'
        im, fm = score['initialMap'], score['finalMap']
        state = bytes([21, 21]+[module.ALPHABET.index(im[h]) for h in module.HEADS]+
                      [module.ALPHABET.index(fm[f]) for f in module.FINALS]+
                      [module.ALPHABET.index(k) for k in 'IVUAO']).hex()
        candidates.append(dict(id=ident, label=label, stateKey=state, M=41, initialMap=im, finalMap=fm,
                               scoreSource=str(score_path), policySource=str(policy_path),
                               robustSource=str(robust_path), componentSource=str(components_path)))
        for p in [score_path, policy_path, robust_path, components_path]:
            sources[str(p)] = sha(p)
    for p in [Path(__file__), ROOT/'tools/publish_untoned_frontiers_r11.py',
              ROOT/'research/config/untoned-2121-reviewed-integrator.py.gz',
              ROOT/'research/notes/2026-11-21-u7e-pinky-collisions.json']:
        sources[str(p)] = sha(p)
    before = WORK/'main-before.html'
    if before.exists():
        assert sha(before) == sha(TARGET), 'target changed since preparation'
    else:
        shutil.copyfile(TARGET, before)
    shutil.copyfile(before, WORK/'columns.html')
    config = dict(version='u7e-pinky-r11-1', source=dict(
        branch=subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip(),
        commit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()),
        v51KeytaoWord3='231', v51SanpinWord4='23', candidates=candidates,
        htmlBeforeSha256=sha(before), sourceHashes=sources)
    Path(str(PREFIX)+'-candidates.json').write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n',
                                                  encoding='utf8', newline='\n')
    print('Prepared', [r['id'] for r in candidates], config['htmlBeforeSha256'])


def columns():
    reviewed.PREFIX = PREFIX
    reviewed.WORK = WORK
    reviewed.columns()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'columns'])
    args = parser.parse_args()
    globals()[args.phase]()
