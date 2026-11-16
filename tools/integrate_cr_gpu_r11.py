"""Publish the three selected 60-hour CR CUDA annealing layouts to R11."""
import argparse
import copy

from integrate_cr_frontier_r11 import ROOT, publish, read
from run_cr_anneal import SearchSpace, unpack, fits_budget

SOURCE = ROOT / 'research/config/cr-frontier-finalists.json'
BUNDLE = ROOT / 'research/config/cr-anneal-inputs.zip'
DESTINATION = ROOT / 'a7_CKT_R11_integrated_materials/cr_gpu_frontier'
LABELS = {
    'CR-GPU-c42359003b': '带调键道 · GPU 综合均衡',
    'CR-GPU-29ce221cfe': '带调键道 · GPU 最低当量',
    'CR-GPU-579ec1d473': '带调键道 · GPU 日常移动手',
}


def annealed_source(archive, space, decomposition):
    """Expand canonical states using the frozen scorer's axes, not display roots."""
    fixture = space.f
    final_names = {row['pinyin']: row['fullFinal'] for row in decomposition}
    first_for_py = {py: i for i, atom in enumerate(fixture['atoms']) for py in atom['pinyin']}
    final_for_py = {py: i for i, atom in enumerate(fixture['rhymeAtoms']) for py in atom['pinyin']}
    region_for_tone = {tone: i for i, region in enumerate(fixture['toneRegions']) for tone in region['tones']}
    tokens = [(py, tone) for py, codes in enumerate(fixture['tonedCodes'])
              for tone, code in enumerate(codes, 1) if code]
    items = [row['item'] for row in archive['finalists']] + archive['top10Ckt']
    layouts, references = [], {}
    for ident in LABELS:
        prefix = ident.removeprefix('CR-GPU-')
        matches = {}
        for item in items:
            if item['key'].startswith(prefix):
                if item['key'] in matches and matches[item['key']] != item:
                    raise ValueError(f'{ident}: conflicting duplicate anneal entry')
                matches[item['key']] = item
        if len(matches) != 1:
            raise ValueError(f'{ident}: missing or ambiguous anneal key')
        item = copy.deepcopy(next(iter(matches.values())))
        state, metrics = item['state'], item['metrics']
        memory = space.memory(state)
        if not memory or not fits_budget(memory, {'maxM': 22}) or not metrics.get('verified'):
            raise ValueError(f'{ident}: unverified or out-of-budget state')
        if space.key(state) != item['key']:
            raise ValueError(f'{ident}: canonical anneal key mismatch')
        expanded = space.expand(state)
        if expanded != item['expandedState']:
            raise ValueError(f'{ident}: expanded state mismatch')
        for field, actual in dict(memory, **space.daily(state)).items():
            if abs(actual - metrics[field]) > 1e-9:
                raise ValueError(f'{ident}: {field} anchor mismatch')
        # This publisher's M-T1 5+D adapter requires unchanged A/E/O/W/Y carriers.
        if any(state['firstKeys'][i] != atom['baselineKey'] for i, atom in enumerate(fixture['atoms'])
               if atom['initial'] == '_'):
            raise ValueError(f'{ident}: carrier moves require an explicit M adapter')
        groups = []
        for group in range(10):
            roots = [root for i, root in enumerate(space.spec['roots']) if state['partition'][i] == group]
            members = [py for final, atom in enumerate(fixture['rhymeAtoms'])
                       if state['partition'][space.spec['finalRoots'][final]] == group for py in atom['pinyin']]
            keys = {region['name']: state['groupKeys'][i][group]
                    for i, region in enumerate(fixture['toneRegions'])}
            if item['rhymeGroups'][group] != {'roots': roots, 'keys': keys}:
                raise ValueError(f'{ident}: rhyme group metadata mismatch')
            groups.append({'roots': roots, 'keys': keys,
                           'finals': sorted({final_names[fixture['pinyin'][py]] for py in members})})
        merge = sum(10 - len(set(keys)) for keys in state['groupKeys'])
        layouts.append(dict(id=ident, annealKey=item['key'], origin=item['origin'],
            description=f"60h CUDA anneal: {LABELS[ident]}; D≤2, M≤22/24; fixed IVUAO and 12/213/24",
            rustScore=metrics['ckt'],
            firstKeys={atom['name']: state['firstKeys'][i] for i, atom in enumerate(fixture['atoms'])},
            tonedCodes=[expanded['firstKeys'][first_for_py[py]] +
                        expanded['rhymeKeys'][region_for_tone[tone]][final_for_py[py]] for py, tone in tokens],
            rhymeGroups=groups, memoryAudit=dict(ordinaryD=memory['d'], ordinaryF=0,
                memoryLower=memory['m'], memoryGuard=memory['guard'],
                sourceRhymeColumnMergeRules=sum(len(group['roots']) > 1 for group in groups),
                sourceRhymeColumnMergeLinks=8, toneRegionMergeLower=merge)))
        references[ident] = dict(ckt={'v51': {'score': metrics['ckt']}},
            macro={'daily|native-punctuation': {'score': metrics['daily']}},
            ergonomics={'leftPinkyQAZPeak4NativeTracks': {'value': metrics['pinky']}})
    return dict(tokenKeys=[fixture['pinyin'][py] + str(tone) for py, tone in tokens], layouts=layouts), references


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reuse-scores', action='store_true')
    args = parser.parse_args()
    unpack(BUNDLE, DESTINATION / 'inputs')
    space = SearchSpace(DESTINATION / 'inputs')
    decomposition = read(ROOT / 'research/config/ckt-v51-toned-2121-seeds.json')['decomposition']
    source, references = annealed_source(read(SOURCE), space, decomposition)
    publish(source, space.f, decomposition, references, labels=LABELS, source_path=SOURCE,
            destination=DESTINATION, reuse_scores=args.reuse_scores,
            audit_path=ROOT / 'research/notes/2026-11-16-cr-gpu-r11-columns.json')


if __name__ == '__main__':
    main()
