#!/usr/bin/env python3
"""Add Snow Jiandao's tone-in-main benchmark bridge to the R11 atlas.

The ordinary R11 catalogue assumes one untoned two-key code per pinyin and an
independent tone/shape auxiliary.  Snow Jiandao deliberately violates that
assumption, so this integration adds a contract-aware comparison block instead
of manufacturing a misleading ordinary catalogue entry.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "a7_CKT_R11.html"
FIXTURE = ROOT / "research" / ".cache" / "ckt-v51-toned-mars10-D1-final.json"
NATIVE = ROOT / "a7_CKT_R11_integrated_materials" / "snow_jiandao_toned_native.json"
AUDIT = ROOT / "a7_CKT_R11_integrated_materials" / "snow_jiandao_toned_benchmark.json"
SNOW = Path(r"D:\C2D\Documents\rime-snow-pinyin")
REPLAY = ROOT / "research" / ".cache" / "R11_integrated_replay"
QZ_ID = "QZ-e8f37a0998f9"
MARKER = "/* SNOW_JIANDAO_TONED_R11_V1 */"


def run(*command: str) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def macro_replay(data: dict, fixture: dict) -> dict:
    sys.path.insert(0, str(REPLAY))
    engine = importlib.import_module("macroxue.engine")
    pinyin_index = {pinyin: index for index, pinyin in enumerate(data["pinyin"])}
    reading = {}
    for char, pinyin, tone, weight, _is_common in data["characters"]:
        key = (char, pinyin)
        if key not in reading or weight > reading[key][1]:
            reading[key] = (tone, weight)

    values = {}
    for corpus_name, corpus in data["macroxue"]["corpora"].items():
        for variant in ("native-punctuation", "hanzi-only"):
            tokens = [
                token for token in corpus["tokens"]
                if variant == "native-punctuation" or "pinyin" in token
            ]
            strokes = []
            for token in tokens:
                if "key" in token:
                    strokes.append(token["key"])
                    continue
                pinyin = pinyin_index[token["pinyin"]]
                tone_weight = reading.get((token["char"], pinyin))
                if tone_weight is None:
                    raise ValueError(f"missing corpus tone: {token!r}")
                tone = tone_weight[0]
                code = fixture["tonedCodes"][pinyin][tone - 1]
                if not code:
                    raise ValueError(f"missing toned code: {token!r}, tone={tone}")
                strokes.append(code.lower())
            joined = "".join(strokes)
            result = engine.evaluate(joined, len(tokens))
            result.update({
                "strokeSha256": hashlib.sha256(joined.encode()).hexdigest(),
                "coverage": 1.0,
                "pureDoublePinyin": True,
                "shapeIncluded": False,
                "selectionIncluded": False,
                "toneSource": (
                    "highest-weight matching R11 character reading for each frozen "
                    "corpus char+pinyin token"
                ),
            })
            values[f"{corpus_name}|{variant}"] = result
    return values


def qz_baseline(data: dict) -> dict:
    entry = next(item for item in data["entries"] if item["id"] == QZ_ID)
    metric = entry["readmeBenchmarkMetrics"]
    aggregate = entry["productionCandidateMetrics"]["cktV51Aggregate"]
    return {
        "id": QZ_ID,
        "name": "QZ-e8f37a（生产无调 21×21）",
        "contract": "untoned-main + shape/tone auxiliary 1:1 ensemble",
        "memory": {
            "definition": "M-R2",
            "lower": metric["M-R2"],
            "guard": None,
            "D": entry["memoryAuditR2"]["ordinaryDisplacedCount"],
            "V": entry["productionCandidateMetrics"]["displacedVowels"],
        },
        "inventory": {
            "legalSyllables": 399,
            "occupiedBuckets": metric["common399UniqueCodes"],
            "capacity": 441,
        },
        "ckt": {
            "v3": metric["cktV3"],
            "v4": metric["cktV4"],
            "v5": metric["cktV5"],
            "v51": metric["cktV51"],
            "ensembleV3": metric["ensembleV3"],
            "ensembleV4": metric["ensembleV4"],
            "ensembleV5": metric["ensembleV5"],
            "aggregateV51": aggregate,
        },
        "completion": {
            "contract": "legacy S2 untoned completion",
            "meanKeys": metric["s2CompletionMeanKeys"],
            "missOrSelectionRate": metric["s2FrequencyWeightedMiss"],
            "centerOrEffectiveMs": metric["s2CompletionCenterMs"],
        },
        "ergonomics": {
            "contract": "legacy 20 untoned contracts",
            "homeS2": metric["homeShareS2"],
            "homeFloor20Contracts": metric["homeFloor20Contracts"],
            "leftPinkyQAZPeak20Contracts": metric["leftPinkyQAZPeak20Contracts"],
            "rightPinkyPeak20Contracts": metric["rightPinkyPeak20Contracts"],
            "maxFingerPeak20Contracts": {"value": metric["maxFingerPeak20Contracts"]},
            "indexFingerTYBPeak20Contracts": metric["indexFingerTYBPeak20Contracts"],
            "s2DifferentKeySameFingerRate": metric["s2DifferentKeySameFingerRate"],
        },
        "macro": data["macroxue"]["values"][QZ_ID],
    }


def bridge(data: dict, native: dict, fixture: dict) -> dict:
    macro = macro_replay(data, fixture)
    ice = {
        **native,
        "macro": macro,
        "comparability": {
            "direct": [
                "daily moving-hand replay on the same frozen corpora and geometry",
                "memory and displacement within their explicitly named definitions",
                "native key-load shares within the explicitly named track set",
            ],
            "normalizedButDifferentTaskContract": ["CKT v5", "CKT v5.1"],
            "notApplicable": [
                "legacy A7E v3/v4/v5 20-contract ensemble",
                "legacy 20-contract peak labels",
                "independent sanpin tone-auxiliary half",
            ],
        },
    }
    return {
        "version": "snow-jiandao-toned-r11-contract-bridge-v1",
        "title": "冰雪剑道：带调前两码＋纯形辅跨合同对照",
        "policy": {
            "reason": (
                "The legacy entry schema stores one untoned codeList value per pinyin and "
                "scores independent shape and tone auxiliaries. Snow Jiandao stores tone "
                "inside the first two keys, so it is kept outside entries and compared by "
                "an explicit contract bridge."
            ),
            "cktReference": "S005=10; native four tone-aware cohorts; shape-only completion",
            "legacy20ContractPolicy": (
                "not synthesized: old A7E and 20-contract peaks remain N/A for Snow Jiandao"
            ),
            "macroPolicy": (
                "exact frozen daily/default corpus replay; tone is recovered from the "
                "highest-weight matching R11 char+pinyin reading"
            ),
        },
        "schemes": {"snowJiandao": ice, "qzE8f37a": qz_baseline(data)},
    }


def patch_report(html: str) -> str:
    anchor = "function r11Report(){"
    if anchor not in html:
        raise ValueError("R11 report function not found")
    function = r'''/* SNOW_JIANDAO_TONED_R11_V1 */
function r11TonedContractTable(){
 const b=D.tonedContractBenchmark;if(!b)return '';
 const i=b.schemes.snowJiandao,q=b.schemes.qzE8f37a;
 const na='<span title="旧 20 合同假设独立调辅；本方案调已进入前两码">不适用</span>';
 const macro=(x,key)=>x.macro[key];
 const peak=(x,name)=>x.ergonomics[name]&&x.ergonomics[name].value;
 const performance=[
  ['冰雪剑道','带调 21×21＋纯形辅',i.memory.lower+' / '+i.memory.guard+'（M-T1 下限/守门）',i.memory.D+' / '+i.memory.F,i.inventory.legalTonedSyllables+' / '+i.inventory.occupiedBuckets+' / '+i.inventory.capacity,num(i.ckt.v5.score,9),num(i.ckt.v51.score,9),na,na,na],
  [esc(q.name),'无调 21×21＋形/调辅系综',q.memory.lower+'（M-R2）',q.memory.D+' / V'+q.memory.V,q.inventory.legalSyllables+' / '+q.inventory.occupiedBuckets+' / '+q.inventory.capacity,num(q.ckt.v5,9),num(q.ckt.v51,9),num(q.ckt.ensembleV3,9),num(q.ckt.ensembleV4,9),num(q.ckt.ensembleV5,9)]
 ];
 const ergonomics=[
  ['冰雪剑道','4 条带调原生轨',num(macro(i,'daily|native-punctuation').avg_effective_distance,6),pct(macro(i,'daily|native-punctuation').left_load/macro(i,'daily|native-punctuation').hits),pct(macro(i,'daily|native-punctuation').same_hand_rate),num(macro(i,'daily|native-punctuation').score,6),pct(i.ergonomics.homeS2),pct(i.ergonomics.leftPinkyQAZPeak4NativeTracks.value),pct(i.ergonomics.rightPinkyPeak4NativeTracks.value),pct(i.ergonomics.maxFingerPeak4NativeTracks.value),pct(i.ergonomics.indexFingerTYBPeak4NativeTracks.value),pct(i.ergonomics.homeFloor4NativeTracks),pct(i.ergonomics.s2DifferentKeySameFingerRate)],
  [esc(q.name),'旧 20 合同',num(macro(q,'daily|native-punctuation').avg_effective_distance,6),pct(macro(q,'daily|native-punctuation').left_load/macro(q,'daily|native-punctuation').hits),pct(macro(q,'daily|native-punctuation').same_hand_rate),num(macro(q,'daily|native-punctuation').score,6),pct(q.ergonomics.homeS2),pct(peak(q,'leftPinkyQAZPeak20Contracts')),pct(peak(q,'rightPinkyPeak20Contracts')),pct(peak(q,'maxFingerPeak20Contracts')),pct(peak(q,'indexFingerTYBPeak20Contracts')),pct(q.ergonomics.homeFloor20Contracts),pct(q.ergonomics.s2DifferentKeySameFingerRate)]
 ];
 const completion=[
  ['冰雪剑道','带调字轨 / 4 条原生轨',num(i.ckt.v51.tracks.character.meanKeys,6),pct(i.ckt.v51.tracks.character.selectionRate),num(i.ckt.v51.tracks.character.effectiveMs,4),na,na,num(i.ckt.v5.score,9),num(i.ckt.v51.score,9),pct(i.ckt.aggregateV51.firstAuxRate),pct(i.ckt.aggregateV51.secondAuxRate),pct(i.ckt.aggregateV51.thirdAuxRate),num(i.ckt.aggregateV51.effectiveMs,4)],
  [esc(q.name),'旧 S2 / 形辅调辅系综',num(q.completion.meanKeys,6),pct(q.completion.missOrSelectionRate),num(q.completion.centerOrEffectiveMs,4),num(q.ckt.v3,9),num(q.ckt.v4,9),num(q.ckt.v5,9),num(q.ckt.v51,9),pct(q.ckt.aggregateV51.firstAuxRate),pct(q.ckt.aggregateV51.secondAuxRate),pct(q.ckt.aggregateV51.thirdAuxRate),num(q.ckt.aggregateV51.effectiveMs,4)]
 ];
 return `<h3>${esc(b.title)}</h3><p>冰雪剑道不是普通 R11 无调条目：调已进入前两码，后续只使用形辅。下表在同一页面并列展示，但保留合同列；CKT 均以 S005=10 归一，任务合同仍不同。日常移动手使用同一冻结语料与几何，可直接比较。</p>
 ${uxTable(['方案','合同','M','D / F(V)','有效音节 / 占桶 / 容量','CKT-T v5','CKT-T v5.1','A7E-v3','A7E-v4','A7E-v5'],performance,[],'snow-jiandao-toned-performance')}
 ${uxTable(['方案','负载合同','日常平均有效距离 ↓','日常左手占比','日常同手率 ↓','日常纯双拼移动手 ↑','S2/字轨主行','QAZ 左小指峰值 ↓','P 区右小指峰值 ↓','最大单指峰值 ↓','TYB 双食指峰值 ↓','主键区下限','S2 异键同指 ↓'],ergonomics,[],'snow-jiandao-toned-ergonomics')}
 ${uxTable(['方案','补全合同','字轨/S2 平均键数 ↓','字轨选重/S2 频权漏选 ↓','字轨有效/S2 中心 ms ↓','CKT v3','CKT v4','CKT v5','CKT v5.1','首辅率 ↓','二辅率 ↓','三辅率 ↓','四轨加权有效时间 ms ↓'],completion,[],'snow-jiandao-toned-completion')}
 <details class="card"><summary>可比性与定义修改</summary><p>严格可比：同语料日常移动手、各自定义下的 M/D，以及明确轨集合内的按键负载。CKT-T v5/v5.1 使用同一个 S005 参考，但冰雪剑道是“带调主码＋纯形辅”，QZ 是“无调主码＋形/调辅系综”，所以它们是生产任务分数，不应解释成同一编码合同的消融实验。</p><p>不生成冰雪剑道的旧 A7E-v3/v4/v5 和旧 20 合同峰值：那会再次加入已经编码在前两码中的调辅贡献。替代项为 4 条原生带调轨（字、二字、三字、四字）的峰值和 CKT-T。完整机器可读审计见 a7_CKT_R11_integrated_materials/snow_jiandao_toned_benchmark.json。</p></details>`;
}

'''
    if MARKER in html:
        start = html.index(MARKER)
        end = html.index(anchor, start)
        html = html[:start] + function + html[end:]
    else:
        html = html.replace(anchor, function + anchor, 1)
    insertion = r" <h3>\u6307\u5b9a\u6839\u65b9\u6848\u5bf9\u7167</h3>"
    if "${r11TonedContractTable()}" in html:
        return html
    if insertion not in html:
        raise ValueError("R11 seed-table insertion point not found")
    return html.replace(insertion, " ${r11TonedContractTable()}\n\n" + insertion, 1)


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))

    sys.path.insert(0, str(ROOT / "tools"))
    sys.path.insert(0, str(SNOW / "scripts" / "research"))
    production = importlib.import_module("integrate_shenyun_21x26_production")
    old = importlib.import_module("integrate_shenyun_21x21_low_miss")
    fixed = production.load_module(
        "fixed_snow_jiandao_toned",
        SNOW / "scripts" / "research" / "integrate_shenyun_21x21_completion_fixed_frontier.py",
    )
    helper = old.load_helper(HTML)

    run(
        "node", "--max-old-space-size=1800",
        str(ROOT / "tools" / "score_snow_jiandao_toned_benchmark.js"),
        "--html", str(HTML), "--fixture", str(FIXTURE), "--output", str(NATIVE),
        "--snow", str(SNOW),
    )
    native = json.loads(NATIVE.read_text(encoding="utf-8"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    html = patch_report(HTML.read_text(encoding="utf-8"))
    data, body, end = helper.extract_payload(html)
    result = bridge(data, native, fixture)
    data["tonedContractBenchmark"] = result
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fixed.write_payload(HTML, html, body, end, data)
    print(json.dumps({
        "html": str(HTML),
        "audit": str(AUDIT),
        "htmlSha256": hashlib.sha256(HTML.read_bytes()).hexdigest(),
        "cktV5": native["ckt"]["v5"]["score"],
        "cktV51": native["ckt"]["v51"]["score"],
        "macroDaily": result["schemes"]["snowJiandao"]["macro"]
            ["daily|native-punctuation"]["score"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
