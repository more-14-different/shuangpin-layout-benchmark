"""Export a finite-neighborhood certificate only after full score coverage."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'research/.cache/R11_integrated_replay'))
from memory_r2 import audit
from audit import split

def main():
    source = ROOT / 'research/.cache/untoned-2121-local-closure/checkpoint.json'
    c = json.loads(source.read_text())
    assert c['completed'] and c['runState'] == 'finalized', 'Closure has not finished'
    assert not c['centers'][-1]['nextId'], 'Improving successor remains'
    for file, digest in c['sourceHashes'].items():
        assert hashlib.sha256(Path(file).read_bytes()).hexdigest() == digest, file
    html = (ROOT / 'a7_CKT_R11.html').read_text(encoding='utf-8')
    data = json.loads(gzip.decompress(base64.b64decode(re.search(r'<script id="payload"[^>]*>([^<]+)', html)[1])))
    template = next(e for e in data['entries'] if e['id'] == 'QZ-e8f37a0998f9')
    for row in c['records'].values():
        codes = []
        for py, old in zip(data['pinyin'], template['codeList']):
            if old is None:
                codes.append(None)
                continue
            h, f = split(py, True)
            codes.append(row['initialMap'][h] + row['finalMap']['ve' if f == 'ue' else f])
        a = audit(data, dict(template, codeList=codes))
        assert a['M'] == row['audit']['M'] <= 42
        assert a['ordinaryDisplacedCount'] == row['audit']['D'] <= 2
        assert a['coverage'] == 399 and a['branchCount'] == 0
        assert a['unique'] == row['audit']['unique']
        common = [codes[p] for p, _ in data['base']]
        assert 'QZ' not in common and 'ZQ' not in common
        assert all(len({code[i] for code in common}) == 21 for i in (0, 1))
        assert row['tone'] == 'IVUAO'
    # Independently reconstruct every center's legal neighborhood with the
    # frozen enumerator and compare exact state sets, not just counts.
    check = r'''
const fs=require('node:fs');
const {enumerateNeighborhood,materialize,layoutKey}=require('./tools/close_untoned_2121_local');
const search=require('./tools/search_untoned_production_v51');
const data=require('./tools/score_completion_ckt_v4').loadPayload('a7_CKT_R11.html');
const c=JSON.parse(fs.readFileSync('research/.cache/untoned-2121-local-closure/checkpoint.json'));
const t=data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
const proposals=[];
for(const center of c.centers){
 const row=Object.values(c.records).find(e=>e.id===center.id);
 const all=enumerateNeighborhood(materialize(row,t,data));
 proposals.push({id:center.id,rows:all.map(e=>({key:layoutKey(e),initialMap:e.initialMap,finalMap:e.finalMap,tone:e.tone}))});
 const keys=all.map(e=>search.rebuild(e,data)).filter(e=>{
  const a=search.audit(e,data);return a.valid&&a.M<=42&&a.D<=2&&a.V<=5&&a.branches===0&&!a.qz&&!a.zq&&[0,1].every(i=>new Set(data.base.map(([p])=>e.codeList[p][i])).size===21);
 }).map(layoutKey).sort();
 if(JSON.stringify(keys)!==JSON.stringify([...center.keys].sort()))throw Error('coverage mismatch');
}
fs.writeFileSync('research/.cache/untoned-2121-local-closure/proposals-audit.json',JSON.stringify(proposals));
console.log('all center neighborhood sets reproduced');
'''
    subprocess.run(['node', '-e', check], cwd=ROOT, check=True)
    proposals = json.loads((source.parent / 'proposals-audit.json').read_text())
    for group,center in zip(proposals,c['centers']):
        assert group['id'] == center['id']
        independent_keys = set()
        for row in group['rows']:
            codes = [None] * len(data['pinyin'])
            for p,_ in data['base']:
                h,f = split(data['pinyin'][p],True)
                codes[p] = row['initialMap'][h] + row['finalMap']['ve' if f == 'ue' else f]
            common = [codes[p] for p,_ in data['base']]
            if any(set(code) & set(row['tone']) for code in common):
                continue
            if any(len({code[i] for code in common}) != 21 for i in (0,1)):
                continue
            if 'QZ' in common or 'ZQ' in common:
                continue
            a = audit(data,dict(template,codeList=codes))
            v = sum(row['finalMap'][f] != f.upper() for f in 'aeiou')
            if a['M'] <=42 and a['ordinaryDisplacedCount'] <=2 and a['branchCount']==0 and v<=5:
                independent_keys.add(row['key'])
        assert independent_keys == set(center['keys']), 'Original M-R2 disagrees with legal/rejected partition'
    print('original M-R2 legal/rejected partitions reproduced')
    for center in c['centers']:
        assert center['completed'] and len(center['keys']) == len(set(center['keys'])) == center['legal']
        assert all(k in c['records'] for k in center['keys'])
        improving = sorted((c['records'][k] for k in center['keys'] if c['records'][k]['score'] < center['score'] - 1e-10), key=lambda r:r['score'])
        assert center['nextId'] == (improving[0]['id'] if improving else None)
    best = next(r for r in c['records'].values() if r['id'] == c['bestId'])
    fresh_path = ROOT / 'research/notes/2026-11-14-untoned-2121-local-closure-verification.json'
    fresh = json.loads(fresh_path.read_text())
    assert fresh['checkpointSha256'] == hashlib.sha256(source.read_bytes()).hexdigest(), 'Fresh scores are stale'
    verified = {r['id']:r for r in fresh['results']}
    assert all(center['id'] in verified for center in c['centers'])
    for row in c['records'].values():
        row['erg'].pop('motor', None)  # Runner placeholder, not a measured zero.
        if row['id'] in verified:
            row['independent'] = verified[row['id']]['independent']
    for row in [c['seed'],c['baseline']]:
        row['erg'].pop('motor',None)
    c['certificate'] = {'checkpointSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                        'originalMR2Verified':len(c['records']), 'allNeighborhoodSetsReproduced':True,
                        'originalMR2RejectedPartitionVerified':True,
                        'freshVerificationSha256':hashlib.sha256(fresh_path.read_bytes()).hexdigest(),
                        'epsilon':1e-10, 'scope':'fixed production auxiliary policies; stated one-hop operators; double-empty only'}
    target = ROOT / 'research/notes/2026-11-14-untoned-2121-local-closure.json'
    target.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding='utf-8')
    mapping = {k:best[k] for k in ['id','capacity','initialMap','finalMap','audit','score']}
    mapping.update(toneKeysByTone='IVUAO',shapeKeysByMeaning='AVUIO',toneDigitsByShapeMeaning='42310',status='research')
    (ROOT / 'research/config/untoned-2121-local-closure-finalist.json').write_text(json.dumps(mapping,indent=2))
    last = c['centers'][-1]
    neighbors = sorted((c['records'][k] for k in last['keys']),key=lambda r:r['score'])
    margin = neighbors[0]['score'] - best['score']
    lines = ['# 无调21×21：有限一步邻域闭合证书', '',
             f"最终中心 `{best['id']}` 的 CKT v5.1 为 **{best['score']:.15f}**。",
             f"最后一层 **{last['legal']}/{last['legal']}** 合法邻居全部评分，没有更低点；最近邻分差为 {margin:.15f}。",
             '这是明确约束下、明确有限算子集的一步局部最优（数值比较容差1e-10），不是整个连通盆地或全局最优证明。', '',
             '## 合同', '',
             '- M-R2≤42，传统单字母声母位移D≤2，基础韵母位移V≤5，无额外路由。',
             '- Common399覆盖399、实际21×21键域、QZ/ZQ双空桶，辅助键域固定。唯一码数量不作门槛。',
             '- toneKeysByTone=IVUAO；shapeKeysByMeaning=AVUIO；形义序声调数字42310。',
             '- 原生传统21×21 CKT v5.1，健道辅序12/213/24，弎拼12/213/23，固定S005锚点。',
             '- 移手、主行、当量、小指负担均为诊断量，不作为速度下降的淘汰门槛。', '',
             '算子包含声母和韵母的任意单token迁移至A–Z、两token交换、同键整组互换、同键整组迁移，',
             '以及原枚举器中的A/E/O、Y/YU、W及复声母家族迁移。只保留满足上述合同的结果。', '',
             '## 穷举下降链', '', '| 中心 | CKT v5.1 | 去重提案 | 合法且完整评分 | 后继 |', '|---|---:|---:|---:|---|']
    for center in c['centers']:
        lines.append(f"| {center['id']} | {center['score']:.12f} | {center['proposals']} | {center['legal']}/{center['legal']} | {center.get('nextId') or '无下降方向'} |")
    lines += ['', f"共保存{len(c['records'])}个不同状态，全部经过原始memory_r2.py独立核验；重新枚举每层合法状态并比较完整状态集合，未发现漏项。原始M-R2亦逐项复核全部提案的合法/拒绝分区，与搜索筛选完全一致。",
              '生产基线和全部中心另经全新JS上下文复算，八轨评分和20合同工效审计见verification.json。', '',
              '下降路径：先整组 a/iang(P) ↔ ei/ia/ong(L)，再 o:G→D。最终声母与起点相同。', '',
              '## 最终取舍', '', '| 指标 | 本轮起点 | 局部最优点 |', '|---|---:|---:|',
              f"| CKT v5.1↓ | {c['seed']['score']:.12f} | {best['score']:.12f} |"]
    for label,key in [('日常移手分↑','mx'),('S2主行↑','homeS2'),('20合同主行下限↑','homeFloor'),('右小指峰值↓','rpMax')]:
        lines.append(f"| {label} | {c['seed']['erg'][key]:.9f} | {best['erg'][key]:.9f} |")
    for label,key in [('系列当量v4↓','a7eV4'),('运动耗时综合v5↓','a7eV5')]:
        lines.append(f"| {label} | {verified[c['seed']['id']]['independent'][key]:.12f} | {verified[best['id']]['independent'][key]:.12f} |")
    lines += ['', '最终M=42、D=2、V=5，346个唯一码，双空桶成立。CKT改善伴随移手分、主行、小指负担和当量的代价，',
              '因此这是固定CKT目标的局部最优点，不全面支配此前高工效方案。它们应继续保留在多指标前沿。', '',
              '## 声母方向', '',
              '首层零声母O:R→C为9.53652452；在整组韵母交换后为9.52762985，确有CKT收益。',
              '但在最终o→D中心上，同一步变为9.52749048，略逊于中心。声韵组合存在相互作用，声母不是未探索变量。', '',
              '最终中心最接近的三个邻居：', '', '| 操作 | CKT v5.1 | 与中心之差 |', '|---|---:|---:|']
    for row in neighbors[:3]:
        lines.append(f"| {row['mutation']} | {row['score']:.12f} | {row['score']-best['score']:.12f} |")
    lines += ['', '## 证明边界与复现', '',
              '没有排除先退后进的多步组合、非单步的声韵联动、允许占桶空间、辅助键重排或重新选择布局专属辅序的改善。',
              '本证书不能推导整个盆地所有路径都已探索完毕。当前部署未修改。', '',
              '```powershell', 'node tools/close_untoned_2121_local.js --workers 2 --max-centers 8',
              'node tools/verify_untoned_2121_local.js', 'python -X utf8 tools/report_untoned_2121_local.py',
              'node --test tests/untoned-2121-local-closure.test.mjs tests/untoned-production-v51.test.mjs tests/auxiliary-semantics.test.mjs', '```', '',
              '评分逐项检查点位于ignored research/.cache/untoned-2121-local-closure/checkpoint.json。',
              '本目录同名JSON保存完整证书、各状态八轨耗时和邻接状态键；verification.json绑定检查点SHA-256。',
              '最终映射：research/config/untoned-2121-local-closure-finalist.json。',
              '复现依赖本机R11 HTML、冻结replay和Rime语料；评分源文件与全部输入的哈希已绑定，变化时必须使用新缓存。', '']
    (ROOT / 'research/notes/2026-11-14-untoned-2121-local-closure.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps({'centers':len(c['centers']),'states':len(c['records']),'best':best['id'],'score':best['score']}))

if __name__ == '__main__':
    main()
