"""Independently validate stable-policy search representatives and render the result."""
import hashlib
import json
from pathlib import Path

from explore_cr_stable_neighbors import PREFIX,OUTPUT,LAYOUTS,STABILITY
from integrate_snow_jiandao_toned_r11 import ROOT,macro_replay
from run_cr_anneal import atomic_json,SearchSpace


def read(path):return json.loads(Path(path).read_text(encoding='utf8'))
def key(policy):return '/'.join(policy[k] for k in ['word2','word3','word4'])


def main():
    bundle=read(str(PREFIX)+'-finalists.json');aux=read(str(PREFIX)+'-auxiliary.json')
    robust=read(str(PREFIX)+'-robustness.json');old_robust=read(STABILITY)
    old_columns_path=ROOT/'research/notes/2026-11-16-cr-stable-r11-columns.json'
    old_columns=read(old_columns_path)['schemes']
    native_checks={r['id']:r for r in read(str(PREFIX)+'-native.json')['results']}
    html_hash=hashlib.sha256((ROOT/'a7_CKT_R11.html').read_bytes()).hexdigest()
    published_hash=read(ROOT/'a7_CKT_R11_integrated_materials/cr_robust_frontier/manifest.json')['htmlSha256']
    if html_hash!=published_hash or aux['sourceHashes']['a7_CKT_R11.html']!=html_hash:
        raise ValueError('published HTML changed or auxiliary verification used a different HTML')
    data=read(OUTPUT/'macro-input.json');old_layouts=read(LAYOUTS)
    lookup={r['id']:r for r in aux['results']};ranked={r['id']:r for r in robust['results']}
    if len(lookup)!=3 or set(lookup)!=set(ranked):raise ValueError('incomplete final auxiliary verification')
    verification=[]
    for layout in bundle['layouts']:
        a=lookup[layout['id']];r=ranked[layout['id']];s=SearchSpace(OUTPUT/layout['parent']/'inputs')
        if s.key(layout['state'])!=layout['key']:raise ValueError('state key mismatch')
        tokens=dict(zip(bundle['tokenKeys'],layout['tonedCodes'],strict=True))
        encoded_layout=dict(tonedCodes=[[tokens.get(py+str(t)) for t in [1,2,3,4,5]] for py in data['pinyin']])
        memory=layout['metrics'];profile=layout['constraints'];actual=s.memory(layout['state'])
        for field,value in actual.items():
            if memory[field]!=value:raise ValueError('memory mismatch')
        fixed=native_checks[layout['id']]['fixed'];selected=native_checks[layout['id']]['selected']
        if abs(fixed['score']-a['baselineVerified']['score'])>1e-9:raise ValueError('separate JS replay mismatch')
        if abs(fixed['score']-memory['ckt'])>1e-9:raise ValueError('Rust/JS baseline mismatch')
        e=fixed['ergonomics']
        if abs(e['leftPinkyQAZPeak4NativeTracks']['value']-memory['pinky'])>1e-9:raise ValueError('Rust/JS pinky mismatch')
        if memory['daily']+1e-9<profile['dailyFloor'] or memory['pinky']>profile['pinkyCeiling']+1e-12:
            raise ValueError('fixed-policy comfort constraints violated')
        if actual['d']>2 or actual['m']>profile['maxM'] or actual['guard']>24:raise ValueError('budget violated')
        macro=macro_replay(data,encoded_layout)
        daily=macro['daily|native-punctuation']['score']
        if abs(daily-memory['daily'])>1e-9:raise ValueError('daily replay mismatch')
        chosen=next(p for p in a['policies'] if p['policy']==r['selectedPolicy'])
        if abs(chosen['score']-r['selectedScore'])>1e-9:raise ValueError('robust component mismatch')
        if selected['policy']!=r['selectedPolicy'] or abs(selected['score']-r['selectedScore'])>1e-9:
            raise ValueError('selected full replay mismatch')
        parent=next(row for row in old_layouts['layouts'] if row['key'].startswith(layout['parent']))
        changes=[]
        for i,name in enumerate(bundle['firstAtomNames']):
            if parent['state']['firstKeys'][i]!=layout['state']['firstKeys'][i]:
                changes.append(dict(kind='first',name=name,before=parent['state']['firstKeys'][i],after=layout['state']['firstKeys'][i]))
        for region in range(3):
            for group in range(10):
                before=parent['state']['groupKeys'][region][group];after=layout['state']['groupKeys'][region][group]
                if before!=after:changes.append(dict(kind='rhyme',region=['upper','home','lower'][region],group=group,
                    originalRoots=parent['rhymeGroups'][group]['roots'],before=before,after=after))
        for i,(before,after) in enumerate(zip(parent['state']['partition'],layout['state']['partition'])):
            if before!=after:changes.append(dict(kind='root',index=i,before=before,after=after))
        verification.append(dict(id=layout['id'],parent=layout['parent'],changes=changes,macro=macro,
            fixed=fixed,selected=selected,selectedPolicy=r['selectedPolicy'],selectedScore=r['selectedScore'],
            beforePublished=dict(ergonomics=old_columns['CR-GPU-'+layout['parent']]['ergonomics'],
                aggregate=old_columns['CR-GPU-'+layout['parent']]['ckt']['aggregateV51']),
            selectedPinky=chosen['pinky'],selectedPassesPinky=chosen['pinky']<=profile['pinkyCeiling']+1e-12))
    sources=[Path(str(PREFIX)+suffix) for suffix in ['-finalists.json','-auxiliary.json','-robustness.json','-native.json']]+[
        Path(__file__),OUTPUT/'macro-input.json',ROOT/'tools/integrate_snow_jiandao_toned_r11.py',old_columns_path]
    atomic_json(Path(str(PREFIX)+'-verification.json'),dict(version='cr-stable-neighbor-verification-v1',tolerance=1e-9,
        publishedHtmlUnchanged=True,htmlSha256=html_hash,
        sourceHashes={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},results=verification))
    lines=['# 新稳健辅序下的三方案声韵精修','',
        '在已发布的新辅序下重新搜索，避免把旧12/213/24下的局部最优误当成新目标的局部最优。'
        '保留18韵根、10非空组、调区、D≤2、M_guard≤24；两套日常方案M≤21，冠军M≤22。'
        '不改AVUIO形辅、IVUAO语义与42310配对，不增加按声调拆分韵组的例外。','',
        '## 固定已发布辅序时的结果','',
        '| 起点 | 本轮布局 | 固定辅序 | 原CKT | 新CKT↓ | 减少 | 原日常分 | 新日常分↑ | M | 左小指峰值 |',
        '|---|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for layout in bundle['layouts']:
        old=layout['before'];m=layout['metrics']
        lines.append(f"| {layout['parent']} | {layout['key'][:10]} | {key(layout['wordAuxiliaryPolicy'])} | {old['ckt']:.9f} | "
            f"{m['ckt']:.9f} | {old['ckt']-m['ckt']:.9f} | {old['daily']:.6f} | {m['daily']:.6f} | {m['m']}/{m['guard']} | {m['pinky']*100:.4f}% |")
    lines+=['','日常分为同一冻结文章的带标点主码回放，不含形辅；左小指是实际纯形辅终码四轨峰值。'
        '日常路线要求日常分及小指不差于当前已发布起点，最低CKT路线不加日常/小指门槛。'
        '其他人体工学指标不是硬门槛，完整数据保存在verification与auxiliary JSON。','',
        '## 固定辅序的其他指标','',
        '| 起点 | 右小指峰值%↓ | 最大单指峰值%↓ | 基准排下限%↑ | 单字异键同指%↓ | 加权平均码长↓ | 加权选重率%↓ |',
        '|---|---:|---:|---:|---:|---:|---:|']
    for v in verification:
        e=v['fixed']['ergonomics'];a=v['fixed']['aggregate']
        lines.append(f"| {v['parent']} | {e['rightPinkyPeak4NativeTracks']['value']*100:.4f} | "
            f"{e['maxFingerPeak4NativeTracks']['value']*100:.4f} | {e['homeFloor4NativeTracks']*100:.4f} | "
            f"{e['s2DifferentKeySameFingerRate']*100:.4f} | {a['meanKeys']:.9f} | {a['selectionRate']*100:.5f} |")
    lines+=['',
        '## 对新布局重新枚举144辅序及六成本大网格','',
        '| 起点 | 新稳健辅序 | 新稳健CKT | 原稳健CKT | 稳健分数减少 | 四网格首选一致 | 平均排名 | Top1比例 | 第二名 | 默认gap | 平均排名差 | 小指仍满足起点门槛 |',
        '|---|---|---:|---:|---:|---|---:|---:|---|---:|---:|---|']
    for layout,v in zip(bundle['layouts'],verification,strict=True):
        r=ranked[layout['id']];old=next(o for o in old_robust['results'] if o['id'].endswith(layout['parent']))
        lines.append(f"| {layout['parent']} | {key(r['selectedPolicy'])} | {r['selectedScore']:.9f} | {old['selectedScore']:.9f} | "
            f"{old['selectedScore']-r['selectedScore']:.9f} | {r['sameWinnerAllGrids']} | {r['selectedRank']['meanRank']:.6f} | "
            f"{r['selectedRank']['top1Rate']*100:.3f}% | {key(r['runnerPolicy'])} | {r['defaultScoreGap']:.9f} | {r['meanRankGap']:.6f} | {v['selectedPassesPinky']} |")
    lines+=['','全部144辅序参与稳健排序，不再额外按小指筛掉候选；若新稳健辅序突破硬小指门槛，'
        '只能作为取舍候选，不能当作保持原约束的改进。每布局四个六维独立成本网格：'
        '0–500%/50–500%/0–1000%/100–1000%，按各网格平均竞争排名等权选型。'
        'S005参考固定12/213/24，只同步变化认知成本。默认gap是稳健第二名默认CKT减首选默认CKT，'
        '可为负：这里按四网格平均排名选型，并非按默认单点分数排名。'
        'M-T1只计算声韵规则，未计入辅序本身的学习成本。','']
    for layout in bundle['layouts']:
        r=ranked[layout['id']]
        if not r['sameWinnerAllGrids'] or r['meanRankGap']<.5:
            lines.append(f"- {layout['key'][:10]}：辅序优势有限，四网格首选一致={r['sameWinnerAllGrids']}，"
                f"平均排名差{r['meanRankGap']:.6f}；应保留接近的备选，不将其描述为大gap稳定冠军。")
    lines+=['',
        '### 默认参数最低分的取舍','',
        '| 起点 | 默认最低分辅序 | 默认最低CKT | 稳健首选多付CKT | 最低分左小指峰值% |',
        '|---|---|---:|---:|---:|']
    for layout in bundle['layouts']:
        a=lookup[layout['id']];r=ranked[layout['id']]
        best=min(a['policies'],key=lambda p:(p['score'],key(p['policy'])))
        lines.append(f"| {layout['parent']} | {key(best['policy'])} | {best['score']:.9f} | "
            f"{max(0,r['selectedScore']-best['score']):.9f} | {best['pinky']*100:.4f} |")
    lines+=['','此处最低分同样从全部144辅序中选取；默认参数最低不等于四网格稳健首选。','',
        '### 新稳健辅序的完整终码复算','',
        '| 起点 | 左小指峰值%↓ | 右小指峰值%↓ | 最大单指峰值%↓ | 基准排下限%↑ | 单字异键同指%↓ | 加权平均码长↓ | 加权选重率%↓ |',
        '|---|---:|---:|---:|---:|---:|---:|---:|']
    for v in verification:
        e=v['selected']['ergonomics'];a=v['selected']['aggregate']
        lines.append(f"| {v['parent']} | {e['leftPinkyQAZPeak4NativeTracks']['value']*100:.4f} | "
            f"{e['rightPinkyPeak4NativeTracks']['value']*100:.4f} | {e['maxFingerPeak4NativeTracks']['value']*100:.4f} | "
            f"{e['homeFloor4NativeTracks']*100:.4f} | {e['s2DifferentKeySameFingerRate']*100:.4f} | "
            f"{a['meanKeys']:.9f} | {a['selectionRate']*100:.5f} |")
    lines+=['','### 与已发布起点的取舍','',
        '| 起点 | 平均码长旧→新 | 选重率%旧→新 | 单字异键同指%旧→新 | 最大单指峰值%旧→新 |',
        '|---|---|---|---|---|']
    for v in verification:
        before=v['beforePublished'];after=v['selected'];a,b=before['aggregate'],after['aggregate']
        e,f=before['ergonomics'],after['ergonomics']
        lines.append(f"| {v['parent']} | {a['meanKeys']:.9f} → {b['meanKeys']:.9f} | "
            f"{a['selectionRate']*100:.5f} → {b['selectionRate']*100:.5f} | "
            f"{e['s2DifferentKeySameFingerRate']*100:.4f} → {f['s2DifferentKeySameFingerRate']*100:.4f} | "
            f"{e['maxFingerPeak4NativeTracks']['value']*100:.4f} → {f['maxFingerPeak4NativeTracks']['value']*100:.4f} |")
    lines+=['','两套M21的同指率、最大单指峰值下降，但平均码长和选重率略升；不能将它们描述为所有属性的支配改进。']
    lines+=['',
        '## 具体变化','']
    for v in verification:
        lines+=['### '+v['parent'],'']
        if not v['changes']:lines+=['声韵布局不变。',''];continue
        for change in v['changes']:
            if change['kind']=='first':subject='首键 '+change['name']
            elif change['kind']=='rhyme':subject=change['region']+' 韵组 '+','.join(change['originalRoots'])
            else:subject='韵根索引 '+str(change['index'])
            lines.append(f"- {subject}：{change['before']} → {change['after']}")
        lines.append('')
    lines+=['## 覆盖','', '| 起点 | 阶段 / 随机种子 | 合规生成数 | 实际考虑数 | 新评分数 | 阶段前后CKT |','|---|---|---:|---:|---:|---|']
    for layout in bundle['layouts']:
        for phase in layout['rounds']:
            item=phase['profiles'][layout['parent']]
            lines.append(f"| {layout['parent']} | {phase['phase']} / {phase['seed']} | {item['available']} | {item['considered']} | {item['fresh']} | "
                f"{item['before']:.9f} → {item['after']:.9f} |")
    total=sum(l['uniqueScoredLayouts'] for l in bundle['layouts'])
    unique=len({r['key'] for rows in json.loads(gzip_read(Path(str(PREFIX)+'-scores.json.gz'))).values() for r in rows.values()})
    lines+=['',f'按辅序隔离缓存共{total}个状态/辅序评分条目，规范化声韵映射及记忆账跨路线去重为{unique}个；两种数不能混用。'
        '有限一步邻域及抽样组合不是全局最优证明。','',
        '## 核验与复现','',
        '- 词辅序通过政策专属语料视图进入原Rust评分器，只置换词条的形笔位置字节；读音、调、权重、顺序、单字和物理形辅键义不变。',
        '- 三套起点的Rust完整评分对齐已发布JS锚点；增量分片每次验证起点，优胜者再完整复算。',
        '- 代表布局用独立JS流程全量重建搜索辅序与新稳健辅序的所有竞争及终码，核对CKT、逐轨组件、小指；日常回放独立核对至1e-9。',
        '- 原生记忆账与auxiliary tests核对五辅42310语义；测试确认语料适配不改非形笔字段并可续算。',
        '- 新机器先`just cr-stable-neighbors-build`；`just cr-stable-neighbors local`、`just cr-stable-neighbors polish`、`just cr-stable-neighbors coupled`可追加阶段。',
        '- `just cr-stable-neighbors transfer`将其他路线前20布局按当前路线辅序重新编码、评分；不跨辅序复制分数，来源哈希和候选ID随阶段记录。',
        '- `just cr-stable-neighbors export`导出，`just cr-stable-neighbors-auxiliary`全量核验辅序和大网格，'
        '`just cr-stable-neighbors-report`独立重建终码并生成报告。',
        '- 增量分片默认最多8个低优先级CPU进程，`--workers`可调1至16；并行度不参与目标或候选抽样。',
        '- 页面未更新，本轮保存为研究候选。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
    print('Wrote',str(PREFIX)+'.md')


def gzip_read(path):
    import gzip
    return gzip.decompress(path.read_bytes()).decode('utf8')


if __name__=='__main__':main()
