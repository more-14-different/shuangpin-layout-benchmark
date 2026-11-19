"""Compact index of the complete version-specific R11 metric publication."""
import csv
import hashlib
from pathlib import Path
from integrate_recent_cr_r11 import ROOT,PREFIX,read,write


def main():
    audit=read(str(PREFIX)+'-columns.json');verification=read(str(PREFIX)+'-verification.json')
    rows=[]
    for r in audit['rows']:
        n=audit['schemes'][r['id']];c=n['columns']
        rows.append(dict(r,cktV5=n['ckt']['v5']['score'],**{'A7E_'+k:v for k,v in c['ensemble'].items()},
            nativeHomeFloor=n['ergonomics']['homeFloor4NativeTracks'],
            word2FirstAux=n['ckt']['v52']['tracks']['word2']['firstAuxRate'],word2SecondAux=n['ckt']['v52']['tracks']['word2']['secondAuxRate'],
            word2EffectiveMs=n['ckt']['v52']['tracks']['word2']['effectiveMs'],
            legacyDailyScore=n['macro']['daily|native-punctuation']['score'],occupiedBuckets=n['inventory']['occupiedBuckets']))
    with Path(str(PREFIX)+'-comparison.csv').open('w',newline='',encoding='utf-8-sig') as f:
        fields=list(rows[0]);writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        writer.writerows({**r,'policy':'/'.join(r['policy'][k] for k in ['word2','word3','word4'])} for r in rows)
    lines=['# 最近四轮探索的 R11 代表方案','',
        '已写入本机 `a7_CKT_R11.html`，统一以 `CR-REF-` 前缀识别。每个布局固定使用其 CKT v5.2 六成本宽网格最小最大相对遗憾辅序；CKT v5.1 依同一辅序重算，不将 v5.2 值误填进 v5.1 列。','',
        '保留默认性能、加倍认知成本性能、M21、低选重／同指异键、低右小指等实用取舍。8 个代表在所列 Pareto 轴上互不全面支配，但这不是所有探索状态的全指标 Pareto 全集。轴包括默认／加倍 CKT v5.2、M 下界／保守值、右小指峰值、单指峰值、单字同指异键、单字及二字词最终选重率。','',
        '9f 被 7e 在两种 CKT、相同 M 及主要手指负荷指标上改良，未重复增加。44c 等本轮较逊的新状态也未增加。既有 f19 及其他 R11 方案保留原样。','',
        '| ID | 路线 | CKT 5.1↓ | CKT 5.2↓ | 六成本加倍 5.2↓ | M 下界/保守 | 右小指峰值 | 单指峰值 | 单字同指异键 |','|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for r in rows:
        lines.append(f'| {r["originalId"]} | {r["route"]} | {r["cktV51"]:.9f} | {r["cktV52"]:.9f} | {r["doubledV52"]:.9f} | {r["M"]}/{r["guard"]} | {100*r["rightPinky"]:.4f}% | {100*r["maxFinger"]:.4f}% | {100*r["sameFingerOther"]:.4f}% |')
    lines+=['','所有方案 D=2，形笔顺序 `shapeKeysByMeaning=AVUIO`，声调顺序 `toneKeysByTone=IVUAO`，形义对应调号仍为 `42310`。','',
        '## 已补算的列','',
        '沿用 R11 原有各版本合同，包含全部 20 轨及相关旧版系综、CKT v5/v5.1/v5.2、逐词长原生四轨、形辅／选重／翻页、独立及固定辅码对照、声韵记忆与逻辑规则、20 合同及原生四轨人体工学、词典重码、历史冻结语料移手和音节占桶。不同版本的参考、候选池和路由分别保留；未以一种现代指标填充所有历史列。完整机器可读数值见 `-columns.json`；便览见 `-comparison.csv`。','',
        '详情页新增辅序说明：按最小最大相对损失选序，展示 CKT 5.1、默认／加倍 CKT 5.2 及各网格损失。旧方案保留原说明。旧移手仅补齐现有列，不参与新方案筛选。','',
        '## 验证与复现','',
        f'新增 {len(rows)} 个可筛选布局；既有 {verification["oldResearchUnchanged"]} 个研究方案和 {verification["oldV52SchemesUnchanged"]} 个 CKT 5.2 记录，以及其余数据字段均逐字段校验未改变。逐个检查独立 CKT 5.2 参考、词长轨、记忆推导与辅助编码往返。浏览器检查主表、相邻 CKT 5.1/5.2 列、CSV、等合同表、辅序面板、详情和各键位图模式。','',
        'HTML 与其集成材料是仓库忽略的本机生成物；可复算源、完整数值和验证报告纳入版本控制。生产输入法配置未修改。','',
        '`just recent-cr-r11` 重算并写入；`just recent-cr-r11-test` 验证本机生成物。']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    write(Path(str(PREFIX)+'-report.json'),dict(rows=rows,sourceHashes={Path(p).relative_to(ROOT).as_posix():hashlib.sha256(Path(p).read_bytes()).hexdigest()
        for p in [str(PREFIX)+'-source.json',str(PREFIX)+'-columns.json',str(PREFIX)+'-verification.json',__file__]}))


if __name__=='__main__':main()
