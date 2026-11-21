"""Pin CPU-only grouped-final campaign to the canonical UED-3158 replay."""
import gzip
import hashlib
import json
from pathlib import Path
from summarize_u7e_low_pinky import normalized

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT/'research/config/u7e-grouped-cpu.json'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    seed_path = ROOT/'research/notes/2026-11-21-u7e-low-pinky-score-UED-3158ce08b5bc.json'
    seed = json.loads(seed_path.read_text(encoding='utf8'))
    old = json.loads((ROOT/'research/config/u7e-fixed-gpu.json').read_text(encoding='utf8'))
    contract = json.loads(gzip.decompress((ROOT/'research/notes/2026-11-21-u7e-pinky-descent-contract.json.gz').read_bytes()))
    original = ROOT/'research/.cache/u7e-pinky-descent-20261121/templates.json'
    original_bytes = original.read_bytes()
    assert sha(original) == contract['sourceHashes'][str(original)]
    fixture = json.loads(original_bytes)
    assert fixture['toneKeysByTone'] == 'IVUAO'
    archive = ROOT/'research/config/u7e-grouped-cpu-templates.json.gz'
    archive.write_bytes(gzip.compress(original_bytes, mtime=0))
    initial = seed['initialMap']
    heads = list(initial)
    assert len(heads) == 27
    # Explicit fixture order, rather than relying on arbitrary dictionary order.
    heads = ['b','p','m','f','d','t','n','l','g','k','h','j','q','x','zh','ch','sh','r','z','c','s','A','E','O','W','Y','YU']
    finals = old['finalNames']
    pairs = [['o','uo'], ['uan','van'], ['un','vn'], ['iang','uang'],
             ['iong','ong'], ['ing','uai'], ['ei','er']]
    expected = [normalized(seed['modes'], contract['reference'], m) for m in [1,2,3,5]]
    for a, b in zip(expected, seed['ckt']):
        assert abs(a-b) < 1e-10
    config = dict(version='u7e-grouped-cpu-1', seedId=seed['id'], initialMap=initial,
                  heads=heads, initialKeys=[ord(initial[h])-65 for h in heads], finalNames=finals,
                  seedFinalKeys=[ord(seed['finalMap'][f])-65 for f in finals],
                  allowedKeys=old['allowedKeys'], commonPairs=old['commonPairs'], initialMemory=6,
                  maxMemory=41, maxD=2, maxV=5, preferredPairs=pairs,
                  preferredPairTarget=dict(finals=['ei','er'], key='E'),
                  policies=seed['policies'], auxiliarySemantics=seed['auxiliarySemantics'],
                  seedModes=seed['modes'], referenceModes=contract['reference'],
                  expectedSeedScores=expected, costMultipliers=[1,2,3,5],
                  tokenMass=contract['tokenMass'],
                  rightPinkyCaps=dict(mixed=seed['ergonomics']['rightPinky'],
                                      peak8=seed['ergonomics']['peaks']['rightPinky']['value']),
                  templatesArchive=str(archive.relative_to(ROOT)).replace('\\','/'),
                  templatesSha256=hashlib.sha256(original_bytes).hexdigest(),
                  snapshot='tools/ckt_v4_upstream_role_tables.json',
                  profile='research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json',
                  binary='research/ckt-v4-core/target/release/score-untoned-v52-stream.exe',
                  execution=dict(backend='cpu-native-single-thread', workers=1, duty=.65,
                                 priority='below-normal', affinityLogicalCpus=1,
                                 defaultHours=24, reviewIntervalSeconds=3600,
                                 strictFractionOfExactSeconds=.5),
                  review=dict(engine='deterministic local rules, no model/API calls',
                              initialProtectedHours=2, stagnantReviewsBeforeSplit=2,
                              minimumExactSamplesBeforeSplit=400, meaningfulImprovement=.0001,
                              maxNewBrokenPairsPerReview=1,
                              crossLaneSeedsPerAxis=2,
                              pairRelease='probe all seven pair splits; prioritize the strongest observed CKT gain'),
                  constraints='Fixed original U7E initials; exactly21 final keys and21 initial keys; '
                              'M<=41 D<=2 V<=5; auxiliaries AVUIO reserved; no aliases/branches. '
                              'One lane QZ/ZQ both empty; one unconstrained. Native exact wall seconds balanced, '
                              'cached transfers free and not counted as exact time. Fixed seed robust policy '
                              'during search; new leaders are provisional until own-policy re-enumeration.',
                  sourceHashes={str(p):sha(p) for p in [Path(__file__), seed_path, archive,
                     ROOT/'research/notes/2026-11-21-u7e-pinky-descent-contract.json.gz',
                     ROOT/'research/config/u7e-fixed-gpu.json',
                     ROOT/'research/ckt-v4-core/src/bin/score-untoned-v52-stream.rs',
                     ROOT/'research/ckt-v4-core/target/release/score-untoned-v52-stream.exe',
                     ROOT/'tools/ckt_v4_upstream_role_tables.json',
                     ROOT/'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json']})
    CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
    print('Prepared CPU campaign', CONFIG, 'template archive MB', round(archive.stat().st_size/1e6,3))


if __name__ == '__main__':
    main()
