"""Audit and export the completed double-empty local-neighborhood search."""
import argparse
import base64
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPLAY = ROOT / 'research/.cache/R11_integrated_replay'
sys.path.insert(0, str(REPLAY))
from memory_r2 import audit
from audit import split


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_finalized(saved):
    assert saved.get('runState') == 'finalized', 'Search snapshot is not finalized'
    assert saved.get('bestId') and saved.get('centers'), 'Search has no finalized best/centers'
    assert all(c['completed'] for c in saved['centers']), 'Unfinished center cannot support a closure report'
    records = {r['id']: r for r in saved['records'].values()}
    current = saved['seed']['id']
    seen = set()
    for center in saved['centers']:
        assert current == center['id'], 'Center chain is incomplete or out of order'
        assert current not in seen, 'Center chain contains a cycle'
        seen.add(current)
        assert all(k in saved['records'] for k in center['keys']), 'Missing neighborhood scores'
        current = center.get('nextId') or current
    assert current == saved['bestId'] and current in records, 'Stale best ID'
    assert records[current]['score'] == saved['bestScore'], 'Stale best score'
    if saved['completed']:
        assert saved['centers'][-1].get('nextId') is None, 'Improving successor remains unscanned'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, default=ROOT / 'research/.cache/untoned-2126-double-empty-closure/checkpoint.json')
    args = parser.parse_args()
    saved = json.loads(args.checkpoint.read_text(encoding='utf-8'))
    assert_finalized(saved)
    for file, expected in saved['sourceHashes'].items():
        assert digest(Path(file)) == expected, f'Input changed: {file}'
    html = (ROOT / 'a7_CKT_R11.html').read_text(encoding='utf-8')
    data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)', html)[1])))
    template = next(e for e in data['entries'] if e['id'] == 'SNOW-SHENYUN-21X26-D3V1-BALANCED')
    independent_pass = []
    for key, row in saved['records'].items():
        codes = []
        for py, old in zip(data['pinyin'], template['codeList']):
            if old is None:
                codes.append(None)
                continue
            h, f = split(py, True)
            codes.append(row['initialMap'][h] + row['finalMap']['ve' if f == 'ue' else f])
        a = audit(data, {**template, 'codeList': codes})
        assert a['M'] == row['audit']['M'] <= 40, row['id']
        assert a['ordinaryDisplacedCount'] == row['audit']['D'] <= 3
        assert a['branchCount'] == row['audit']['branches'] == 0
        assert a['coverage'] == a['unique'] == 399
        common = [codes[p] for p, _ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common
        assert row['tone'] == 'IEUAO'
        assert sum(row['finalMap'][f] != f.upper() for f in 'aeiou') == row['audit']['V'] <= 1
        if row.get('independentPass'):
            ia = row['independent']
            assert ia['tracks']['S2']['e34'] <= saved['baselineIndependent']['tracks']['S2']['e34'] + 1e-12
            assert ia['a7eV4'] <= saved['baselineIndependent']['a7eV4'] + 1e-12
            independent_pass.append(row)
    for center in saved['centers']:
        scored = sum(k in saved['records'] and isinstance(saved['records'][k].get('score'), (int, float)) for k in center['keys'])
        assert len(center['keys']) == len(set(center['keys'])) == center['legal']
        center['scoresVerified'] = scored
        if center['completed']:
            assert scored == center['legal'], f"incomplete center {center['id']}"
    assert saved.get('bestId'), 'Search has not produced its final status'
    best = next(r for r in saved['records'].values() if r['id'] == saved['bestId'])
    seed = saved['seed']
    verification_file = ROOT / 'research/notes/2026-11-14-untoned-2126-double-empty-closure-verification.json'
    verification = json.loads(verification_file.read_text(encoding='utf-8'))
    assert verification['checkpointSha256'] == digest(args.checkpoint), 'Fresh verification is stale'
    verified = {r['id']: r for r in verification['results']}
    assert best['id'] in verified and seed['id'] in verified
    for row in saved['records'].values():
        if row['id'] in verified:
            row['independent'] = verified[row['id']]['independent']
        # The runner never uses a two-key motor proxy to screen candidates.
        # Its placeholder is not a measured zero and must not enter reports.
        row['erg'].pop('motor', None)
    saved['seed']['erg'].pop('motor', None)
    saved['baseline']['erg'].pop('motor', None)
    seed_independent = verified[seed['id']]['independent']
    production = verified[template['id']]
    record = {**saved, 'version': 'untoned-2126-double-empty-closure-audited-1',
              'originalMR2Verified': len(saved['records']),
              'scope': 'complete finite one-hop operators at each closed center; no global-optimality claim'}
    target = ROOT / 'research/notes/2026-11-14-untoned-2126-double-empty-closure.json'
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    mapping = {'version': 'untoned-2126-double-empty-closure-finalist-1',
               'status': 'research; deployed layout unchanged', 'id': best['id'],
               'capacity': best['capacity'], 'initialMap': best['initialMap'], 'finalMap': best['finalMap'],
               'shapeKeysByMeaning': 'AEUIO', 'toneKeysByTone': best['tone'],
               'toneDigitsByShapeMeaning': '42310', 'cktV51': best['score'],
               'audit': best['audit'], 'ergonomics': best['erg'],
               'independent': best.get('independent'), 'sourceHashes': saved['sourceHashes']}
    (ROOT / 'research/config/untoned-2126-double-empty-closure-finalist.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    lines = ['# 21×26 双空候选：完整邻域接力', '',
             f"从 `{seed['id']}` 的 **{seed['score']:.12f}** 出发，本轮最佳 `{best['id']}` 为 **{best['score']:.12f}**；下降 **{seed['score']-best['score']:.12f}**（{100*(1-best['score']/seed['score']):.5f}%）。", '',
             '固定 M≤40、D≤3、V≤1、无新增路由、Common399 399/399唯一、QZ/ZQ双空；形辅AEUIO、声调IEUAO、语义42310，生产辅序12/12/24与12/21/13、soft-page-fill-v2及S005归一化不变。', '',
             '移手、S2主行和20合同最小主行必须达到原生产基线；接力代表的S2当量、A7E-v4也必须不高于原生产。W/Y、单指及其他轨道的逐项变化另列，不称为所有工效均不下降。', '',
             '## 覆盖与停止原因', '',
             f"状态：**{'当前算子局部闭合' if saved['completed'] else '仍有改善，有限中心数停止'}**。{saved['stopReason']}。", '',
             '| 中心 | CKT v5.1 | 不同提案 | 硬约束合法 | 移手/主行通过 | 全量评分覆盖 | 后继 |',
             '|---|---:|---:|---:|---:|---:|---|']
    for c in saved['centers']:
        lines.append(f"| `{c['id']}` | {c['score']:.12f} | {c['proposals']} | {c['legal']} | {c['comfort']} | {c['scoresVerified']}/{c['legal']} | {c.get('nextId') or '无可接力改善'} |")
    lines += ['', f"共保留 **{len(saved['records'])}** 个完整评分状态（包括起点），全部通过原版memory_r2.py独立审计。所有合法邻居均评分，未使用双键代理截断；缓存仅在完整输入合同指纹相同时复用。", '',
              '算子：全部声母/韵母token两两交换、同键组两两互换、任意单token迁移、同键整组迁移，以及A/E/O与Y/YU等家族迁移。每个中心完整去重；不存在未评分的合法一跳邻居才标记该中心完成。', '',
              '“局部闭合”仅针对上述算子、已扫描中心和当前门禁。它不排除先退后进的两步/多步联动、更远盆地、不同韵母分组与候选专属辅序的收益，也不是数学全局最优证明。', '',
              '## 最佳候选与取舍', '',
              '| 指标 | 原生产基线 | 本轮起点 | 本轮最佳 |', '|---|---:|---:|---:|',
              f"| CKT v5.1↓ | {production['native']['score']:.12f} | {seed['score']:.12f} | {best['score']:.12f} |"]
    for name, key in [('移手↑','mx'),('S2主行↑','homeS2'),('20合同主行下界↑','homeFloor'),('右小指峰值↓','rpMax'),('W峰值↓','wMax'),('Y峰值↓','yMax')]:
        lines.append(f"| {name} | {production['erg'][key]:.9f} | {seed['erg'][key]:.9f} | {best['erg'][key]:.9f} |")
    if best.get('independent'):
        for name, original, initial, value in [('S2当量',production['independent']['tracks']['S2']['e34'],seed_independent['tracks']['S2']['e34'],best['independent']['tracks']['S2']['e34']),('A7E-v4',production['independent']['a7eV4'],seed_independent['a7eV4'],best['independent']['a7eV4']),('A7E-v5',production['independent']['a7eV5'],seed_independent['a7eV5'],best['independent']['a7eV5'])]:
            lines.append(f"| {name}↓ | {original:.12f} | {initial:.12f} | {value:.12f} |")
    lines += ['', '与本轮起点相比，最低CKT代表的S2当量与A7E-v4有小幅回退；二者仍优于原生产基线。它属于满足原门禁的速度/工效取舍点，不支配上一研究候选的全部指标。', '']
    lines += ['', '相对本轮起点的映射变化：', '']
    for field, label in [('initialMap','声母'),('finalMap','韵母')]:
        changes = [f"`{k}: {seed[field][k]}→{v}`" for k,v in best[field].items() if seed[field][k] != v]
        lines.append(f"- {label}："+('、'.join(changes) if changes else '不变'))
    speed = sorted(saved['records'].values(), key=lambda r:r['score'])[:8]
    lines += ['', '## 本轮速度前列（包含工效未通过的对照）', '',
              '| ID | CKT v5.1 | 最后一步 | 移手 | S2主行 | 主行下界 | 独立当量门禁 |',
              '|---|---:|---|---:|---:|---:|---|']
    for r in speed:
        lines.append(f"| `{r['id']}` | {r['score']:.12f} | {r['mutation']} | {r['erg']['mx']:.6f} | {r['erg']['homeS2']:.6f} | {r['erg']['homeFloor']:.6f} | {r.get('independentPass','未进入代表复核')} |")
    lines += ['', '完整映射、八轨有效耗时、独立20合同、父节点与输入哈希见同名JSON。生产/起点/最终代表另行使用全新JS上下文复算，见同名verification.json；其绑定最终检查点SHA256。部署仓库只读。', '',
              '```powershell', 'node tools/close_untoned_2126_double_empty.js --workers 2 --max-centers 6',
              'node tools/verify_untoned_2126_closure.js',
              'python -X utf8 tools/report_untoned_2126_closure.py', '```', '']
    (ROOT / 'research/notes/2026-11-14-untoned-2126-double-empty-closure.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'verified':len(saved['records']),'centers':len(saved['centers']),'completed':saved['completed'],'best':best['id'],'score':best['score']}))


if __name__ == '__main__':
    main()
