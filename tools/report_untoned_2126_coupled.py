"""Verify and report selected two-step and distant-basin native CKT searches."""
import argparse
import base64
import gzip
import hashlib
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'research/.cache/R11_integrated_replay'))
from memory_r2 import audit
from audit import split


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    refined = ROOT / 'research/.cache/untoned-2126-coupled-basin/refined.json'
    parser.add_argument('--checkpoint', type=Path, default=refined if refined.exists() else ROOT / 'research/.cache/untoned-2126-coupled-basin/checkpoint.json')
    args = parser.parse_args()
    saved = json.loads(args.checkpoint.read_text(encoding='utf-8'))
    assert saved['completed'] and all(s['completed'] for s in saved['stages']), 'Search is incomplete'
    verification_file = ROOT / 'research/notes/2026-11-14-untoned-2126-coupled-basin-verification.json'
    verification = json.loads(verification_file.read_text(encoding='utf-8'))
    assert verification['checkpointSha256'] == sha(args.checkpoint), 'Fresh verification is stale'
    verified = {r['id']:r for r in verification['results']}
    for file, expected in saved['sourceHashes'].items():
        assert sha(file) == expected, f'Source changed: {file}'
    html = (ROOT / 'a7_CKT_R11.html').read_text(encoding='utf-8')
    data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)', html)[1])))
    production = next(e for e in data['entries'] if e['id'] == 'SNOW-SHENYUN-21X26-D3V1-BALANCED')
    rows = list(saved['records'].values())
    for row in rows:
        if row['id'] in verified:
            row['independent'] = verified[row['id']]['independent']
            row['independentPass'] = row['independent']['tracks']['S2']['e34'] <= saved['baselineIndependent']['tracks']['S2']['e34'] + 1e-12 and row['independent']['a7eV4'] <= saved['baselineIndependent']['a7eV4'] + 1e-12
        code_list = []
        for py, code in zip(data['pinyin'], production['codeList']):
            if code is None:
                code_list.append(None)
                continue
            h, f = split(py, True)
            code_list.append(row['initialMap'][h] + row['finalMap']['ve' if f == 'ue' else f])
        a = audit(data, {**production, 'codeList': code_list})
        assert a['M'] == row['audit']['M'] <= 40
        assert a['ordinaryDisplacedCount'] == row['audit']['D'] <= 3
        assert a['branchCount'] == row['audit']['branches'] == 0
        assert a['unique'] == a['coverage'] == 399
        assert sum(row['finalMap'][v] != v.upper() for v in 'aeiou') == row['audit']['V'] <= 1
        common = [code_list[p] for p, _ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common
        assert row['tone'] == 'IEUAO' and math.isfinite(row['score'])
        assert all(row['erg'][k] >= saved['baseline']['erg'][k] - 1e-12 for k in ['mx', 'homeS2', 'homeFloor'])
        if row.get('independentPass'):
            ind = row['independent']
            assert ind['tracks']['S2']['e34'] <= saved['baselineIndependent']['tracks']['S2']['e34'] + 1e-12
            assert ind['a7eV4'] <= saved['baselineIndependent']['a7eV4'] + 1e-12
    for stage in saved['stages']:
        assert len({j['key'] for j in stage['jobs']}) == len(stage['jobs'])
        assert all(job['key'] in saved['records'] for job in stage['jobs'])
    best = next(r for r in rows if r['id'] == saved['bestId'])
    assert best['score'] == saved['bestScore']
    seed = saved['seed']
    notes = ROOT / 'research/notes'
    exported = {**saved, 'originalMR2Verified': len(rows), 'checkpointSha256': sha(args.checkpoint), 'freshVerificationSha256': sha(verification_file),
                'scope': 'selected native-scored two-operation endpoints and selected distant legal-walk endpoints; not exhaustive CKT search'}
    (notes / '2026-11-14-untoned-2126-coupled-basin.json').write_text(json.dumps(exported, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    config = {'version': 'untoned-2126-coupled-basin-finalist-1', 'status': 'research; production unchanged',
              'id': best['id'], 'capacity': [21, 26], 'initialMap': best['initialMap'], 'finalMap': best['finalMap'],
              'shapeKeysByMeaning': 'AEUIO', 'toneKeysByTone': 'IEUAO', 'toneDigitsByShapeMeaning': '42310',
              'shapeAuxiliaryOrder': '12/12/24', 'toneAuxiliaryOrder': '12/21/13', 'balanceContract': 'soft-page-fill-v2',
              'cktV51': best['score'], 'audit': best['audit'], 'ergonomics': best['erg'],
              'independent': best.get('independent'), 'sourceHashes': saved['sourceHashes']}
    (ROOT / 'research/config/untoned-2126-coupled-basin-finalist.json').write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    lines = ['# 21×26双空：两步联动与较远布局探索', '',
             f"起点 `{seed['id']}`：CKT v5.1 **{seed['score']:.12f}**；本轮通过全部门禁的最佳 `{best['id']}`：**{best['score']:.12f}**，净下降 **{seed['score']-best['score']:.12f}**（{100*(1-best['score']/seed['score']):.5f}%）。", '',
             'M-R2≤40、D≤3、V≤1、无额外路由、Common399全唯一及QZ/ZQ双空固定。形辅AEUIO、声调IEUAO、42310、生产辅序12/12/24与12/21/13、soft-page-fill-v2、完整mass=.99词语料及S005参考均不变。', '',
             '最终态必须满足原生产移手、S2主行、20合同最小主行下界；代表的S2当量与A7E-v4不得高于原生产。中间态允许暂时更慢、工效下降或违反硬约束。原生产布局未改。', '',
             '## 搜索覆盖', '',
             '| 阶段 | 起点CKT | 新终态池 | 工效通过 | 新增原生全量评分 | 阶段内下降 |',
             '|---|---:|---:|---:|---:|---:|']
    for s in saved['stages']:
        pool_label = str(s['stats']['uniqueNewEndpoints'])
        if s['kind'] == 'far-refine':
            pool_label += f"（另复用{s['stats']['knownComfortNeighbors']}）"
        lines.append(f"| {s['index']} · {s['kind']} | {s['anchorScore']:.12f} | {pool_label} | {s['stats']['comfortPassing']} | {len(s['jobs'])} | {s['gain']:.12f} |")
    lines += ['', '远点下降行的新终态池已通过工效筛选，“工效通过”列还包括复用的已评分邻居；阶段内下降是该桥接路径自身的下降，不等于刷新全局最佳。', '']
    lines += ['', '局部两步：枚举声韵token交换、物理键组交换、token迁移、键组迁移与零声母家族迁移的有序两操作终态，去掉已评状态。终态按单步CKT的加性估计、双键运动耗时、移手、布局差异及固定随机探索混合预选，再做完整原生八轨评分。未入选终态没有CKT结论；不是两步CKT穷举。', '']
    far = [s for s in saved['stages'] if s['kind'] == 'far']
    if far:
        s = far[0]
        signatures = {tuple(sorted(r['initialMap'].items())) for r in s['jobs']}
        distances = [r['distance'] for r in s['jobs']]
        historical = sum(str(r.get('walkSeed', '')).startswith('repaired historical') for r in s['jobs'])
        lines += [f"局部累计收益低于预设0.001 CKT，随后尝试{s['stats']['walks']}条固定随机种子、目标长度4/8/12步的合法路径；起点包括当前布局、旧评分状态与经修复的历史前沿。较远终态至少有6个token映射不同，最终评分{len(s['jobs'])}个工效合格候选。", '',
                  f"实际入选较远候选覆盖{len(signatures)}种声母映射，距离范围{min(distances, default=0)}—{max(distances, default=0)}个token；其中{historical}个记录了经修复历史前沿的路径来源。", '',
                  'Hamming距离与初始布局来源只说明探索了较远布局，不保证跨入统计独立的盆地；没有做不同盆地全收敛的证明。', '']
    else:
        lines += ['局部累计收益达到预设0.001 CKT，本轮继续局部联动，未触发较远布局阶段。', '']
    if saved.get('farRefine'):
        refinement = saved['farRefine']
        bridge = next(r for r in rows if r['id'] == refinement['endId'])
        hamming = sum(seed[field][k] != v for field in ['initialMap','finalMap'] for k,v in bridge[field].items())
        lines += [f"较远布局最优点额外做最多两轮局部下降（每轮最多64个新邻居原生评分）：从{refinement['startScore']:.12f}到{refinement['endScore']:.12f}，最终距本轮原始锚点{hamming}个token映射。此处允许下降桥接点仍比全局锚点慢，只有更快且通过全部门禁的最终态才替换全局最佳。", '']
    lines += ['## 代表与取舍', '', '| 指标 | 本轮起点 | 本轮最佳 |', '|---|---:|---:|',
              f"| CKT v5.1↓ | {seed['score']:.12f} | {best['score']:.12f} |"]
    for name, key in [('移手↑','mx'),('S2主行↑','homeS2'),('20合同主行下界↑','homeFloor'),('右小指峰值↓','rpMax'),('W峰值↓','wMax'),('Y峰值↓','yMax')]:
        lines.append(f"| {name} | {seed['erg'][key]:.9f} | {best['erg'][key]:.9f} |")
    if best.get('independent'):
        for name, value in [('S2当量',best['independent']['tracks']['S2']['e34']),('A7E-v4',best['independent']['a7eV4'])]:
            lines.append(f"| {name}↓ | 见前轮审计 | {value:.12f} |")
    lines += ['', '相对本轮起点的完整变化：', '']
    for field, label in [('initialMap','声母'), ('finalMap','韵母')]:
        changes = [f"`{k}: {seed[field][k]}→{v}`" for k, v in best[field].items() if seed[field][k] != v]
        lines.append(f"- {label}：" + ('、'.join(changes) if changes else '不变'))
    lines += ['', '## 原生评分前列', '', '| ID | CKT v5.1 | 距阶段起点 | 当量门禁复核 | 最后操作链 |', '|---|---:|---:|---|---|']
    for r in sorted(rows, key=lambda r:r['score'])[:10]:
        distance_label = r.get('distance', 0 if r['id'] == seed['id'] else '复用')
        lines.append(f"| `{r['id']}` | {r['score']:.12f} | {distance_label} | {r.get('independentPass','未进入代表复核')} | {r['mutation']} |")
    new_scores = sum(len(s['jobs']) for s in saved['stages'])
    lines += ['', f"本轮新增{new_scores}条完整原生评分；共保存{len(rows)}条记录（包括复用的起点和桥接邻居），全部重新通过原版memory_r2.py审计。缓存仅在完整评分依赖SHA256一致时导入。完整八轨、门禁、操作链和历史来源见同名JSON。", '',
              '```powershell', 'node --max-old-space-size=8192 tools/search_untoned_2126_coupled.js --workers 3 --local 112 --far 80',
              'node tools/refine_untoned_2126_far.js',
              'node tools/verify_untoned_2126_coupled.js', 'python -X utf8 tools/report_untoned_2126_coupled.py', '```', '']
    (notes / '2026-11-14-untoned-2126-coupled-basin.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'recordsVerified':len(rows), 'stages':len(saved['stages']), 'best':best['id'], 'score':best['score']}))


if __name__ == '__main__':
    main()
