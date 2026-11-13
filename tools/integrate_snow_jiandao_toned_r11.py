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
SELECTABLE_MARKER = "/* SNOW_JIANDAO_SELECTABLE_V1 */"
SELECTABLE_END = "/* SNOW_JIANDAO_SELECTABLE_V1_END */"


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


def patch_selectable_ui(html: str) -> str:
    """Expose the cross-contract scheme without adding it to legacy entries."""
    anchor = "// All data loading uses the original payload; only the UI boot path has changed."
    if anchor not in html:
        raise ValueError("final R11 UI boot anchor not found")
    source = r'''/* SNOW_JIANDAO_SELECTABLE_V1 */
const SNOW_JIANDAO_TONED_ID='SNOW-JIANDAO-TONED';

function snowJiandaoTonedFacade(){
 const i=D.tonedContractBenchmark?.schemes?.snowJiandao;
 return i?{
  id:i.id,name:i.name,family:'Snow Jiandao toned',subfamily:'火星十韵 · 带调前两码 · AVUIO 纯形辅',
  capacity:[21,21],actual:[21,21],reservedKeys:'AVUIO',auxiliaryClass:'AVUIO',tone:'IVUAO',
  new:true,nextgen:false,nf5Provenance:{kind:'tone-in-main contract bridge'},
  searchMemoryNoTone:i.memory.lower,
  memory:{firstLinks:i.memory.lower,nontrivialFinals:0,commonNontrivial:i.memory.lower,toneLinks:0},
  memoryAuditR2:{M:i.memory.lower,ordinaryDisplacedCount:i.memory.D,ordinaryDisplaced:['p→K'],scope:'M-T1 contract facade'},
  logicUniformity:{template:'toneInMain',score:null},
  tonedContract:true
 }:null;
}

function snowJiandaoStateMatch(s,kind){
 const i=D.tonedContractBenchmark?.schemes?.snowJiandao;if(!i)return false;
 if(s.hostDomain!=='all'&&s.hostDomain!=='21x21')return false;
 if(s.auxSet!=='all'&&s.auxSet!=='AVUIO')return false;
 if(s.auxMap&&s.auxMap!=='IVUAO')return false;
 if(s.logicTemplate!=='all'&&s.logicTemplate!=='toneInMain')return false;
 if(kind==='selection'&&s.memoryMax!==''&&i.memory.lower>Number(s.memoryMax))return false;
 if(kind==='scheme'){
  if(s.family!=='all'&&s.family!=='new'&&s.family!=='Snow Jiandao toned')return false;
  const words=(s.query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay=`${i.id} ${i.name} 火星十韵 带调前两码 AVUIO 纯形辅`.toLowerCase();
  if(!words.every(word=>hay.includes(word)))return false;
 }
 const r=R2_STATE?.[kind];
 if(r?.d!==''&&i.memory.D>Number(r.d))return false;
 if(r?.fresh===true)return true;
 return true;
}

function snowJiandaoInstallFilterOptions(){
 for(const id of ['nf6SelectionLogic','nf6SchemeLogic','logicTemplate']){
  const select=$('#'+id);if(!select||[...select.options].some(option=>option.value==='toneInMain'))continue;
  const option=document.createElement('option');option.value='toneInMain';option.textContent='火星十韵＋带调主码';select.appendChild(option);
 }
 const legacy=$('#scheme');
 if(legacy&&![...legacy.options].some(option=>option.value===SNOW_JIANDAO_TONED_ID)){
  const option=document.createElement('option');option.value=SNOW_JIANDAO_TONED_ID;option.textContent='SNOW-JIANDAO-TONED / 冰雪剑道';legacy.appendChild(option);
 }
}

const SNOW_JIANDAO_SELECTION_BASE=nf6SelectionEntries;
nf6SelectionEntries=function(){
 const rows=SNOW_JIANDAO_SELECTION_BASE(),facade=snowJiandaoTonedFacade();
 if(facade&&snowJiandaoStateMatch(NF6_STATE.selection,'selection'))rows.push(facade);
 return rows;
};

const SNOW_JIANDAO_SCHEME_BASE=nf6SchemeEntries;
nf6SchemeEntries=function(){
 const rows=SNOW_JIANDAO_SCHEME_BASE(),facade=snowJiandaoTonedFacade();
 if(facade&&snowJiandaoStateMatch(NF6_STATE.scheme,'scheme'))rows.push(facade);
 return rows.sort((left,right)=>left.id.localeCompare(right.id,'en',{numeric:true}));
};

const SNOW_JIANDAO_LIST_BASE=nf6RenderSchemeList;
nf6RenderSchemeList=function(){snowJiandaoInstallFilterOptions();SNOW_JIANDAO_LIST_BASE()};

function snowJiandaoUpdateSelectionCount(){
 if(UX.view==='selection'&&$('#nf6SelectionCount'))$('#nf6SelectionCount').textContent=`${chosen().length} / ${D.entries.length+1} 个候选（含1个带调合同）`;
}

const SNOW_JIANDAO_R2_CONTROLS_BASE=r2InstallControls;
r2InstallControls=function(){SNOW_JIANDAO_R2_CONTROLS_BASE();snowJiandaoUpdateSelectionCount()};

const SNOW_JIANDAO_CURRENT_BASE=current;
current=function(){return CURRENT===SNOW_JIANDAO_TONED_ID?snowJiandaoTonedFacade():SNOW_JIANDAO_CURRENT_BASE()};

function snowJiandaoBenchmarkVisible(){
 const facade=snowJiandaoTonedFacade();if(!facade)return false;
 const family=$('#family')?.value||'all';if(family!=='all'&&family!=='new'&&family!=='Snow Jiandao toned')return false;
 const aux=$('#uxAux')?.value||'all';if(aux!=='all'&&aux!=='AVUIO')return false;
 const query=($('#uxQuery')?.value||'').trim().toLowerCase();
 if(query&&!`${facade.id} ${facade.name} ${facade.subfamily}`.toLowerCase().includes(query))return false;
 const filter=keyFilter(),pair=facade[filter.basis];
 if(filter.domain&&filter.domain!=='all'&&filter.domain!=='21x21')return false;
 if(!compareKeyCount(pair?.[0],filter.firstOp,filter.firstValue)||!compareKeyCount(pair?.[1],filter.secondOp,filter.secondValue))return false;
 if(!compareKeyCount(facade.searchMemoryNoTone,filter.assocOp,filter.assocValue))return false;
 if(filter.logicTemplate&&filter.logicTemplate!=='all'&&filter.logicTemplate!=='toneInMain')return false;
 const eligibility=$('#refEligibility')?.value||'all';if(eligibility==='yes'||eligibility==='no')return false;
 const r=R2_STATE?.benchmark;if(r?.d!==''&&facade.memoryAuditR2.ordinaryDisplacedCount>Number(r.d))return false;
 return true;
}

function snowJiandaoNA(note='旧无调合同不适用'){return `<span title="${esc(note)}">不适用</span>`}

function snowJiandaoPeakKey(i,keys){
 let maximum=0;for(const track of Object.values(i.ergonomics.tracks))for(const key of keys)maximum=Math.max(maximum,track.load[key]||0);return maximum;
}

function snowJiandaoBenchmarkCell(header,key){
 const i=D.tonedContractBenchmark.schemes.snowJiandao,e=i.ergonomics,c=e.tracks.character,m=i.macro['daily|hanzi-only'];
 const label=String(typeof header==='object'?header.label:header).replace(/[↕↑↓]/g,'').trim();
 if(label.startsWith('方案'))return `<button type="button" class="link" data-snow-jiandao-open>${esc(i.id)}</button><small>${esc(i.name)} · 带调原生合同</small>`;
 if(label.includes('实际 / 宿主键域')||label==='宿主键域')return '21×21<small>带调前两码</small>';
 if(label==='五辅键方向'||label==='固定五辅')return 'AVUIO<small>shapeKeysByMeaning；toneKeysByTone=IVUAO</small>';
 if(label.includes('声韵记忆项 M'))return `${i.memory.lower}<small>守门 ${i.memory.guard} · M-T1</small>`;
 if(label.includes('原键偏移 D'))return String(i.memory.D);
 if(label.includes('韵偏移 V'))return snowJiandaoNA('火星十韵使用 M-T1/F，不套用旧 V 定义');
 if(label==='S2右小指'||label==='右小指负担')return pct(c.rightPinky);
 if(label.includes('右小指20合同最高'))return `${pct(e.rightPinkyPeak4NativeTracks.value)}<small>4原生轨</small>`;
 if(label.includes('左小指QAZ 20合同最高'))return `${pct(e.leftPinkyQAZPeak4NativeTracks.value)}<small>4原生轨</small>`;
 if(label.includes('主行·含形辅下限'))return `${pct(e.homeFloor4NativeTracks)}<small>4原生轨</small>`;
 if(label.includes("QP;/[']YTBZX,.最大"))return `${pct(snowJiandaoPeakKey(i,"QP;/[']YTBZX,."))}<small>4原生轨单键峰值</small>`;
 if(label==='当前 CKT ms/项'||label==='S2规则补全 CKT ms')return `${num(i.ckt.v51.tracks.character.effectiveMs,4)}<small>带调字轨</small>`;
 if(label==='裸 CKT ms')return `${num(i.ckt.v51.tracks.character.motorUpperMs,4)}<small>带调字轨运动上界</small>`;
 if(label==='非首选权重')return `${pct(i.ckt.v51.tracks.character.selectionRate)}<small>带调字轨选重</small>`;
 if(label==='异键同指')return pct(e.s2DifferentKeySameFingerRate);
 if(label==='最大单指负担')return pct(c.maxFinger);
 if(label==='主行占比')return pct(e.homeS2);
 if(label==='含外推键占比')return '0.000%';
 if(label.includes('MX34 日常纯汉字'))return num(m.score,6);
 if(label==='原生／统一附辅')return '原生带调＋纯形辅';
 if(label==='裸二键唯一')return `${i.inventory.occupiedBuckets}/${i.inventory.capacity}<small>带调占桶；非399唯一码</small>`;
 if(label==='键道·单字 补全CKT ms')return num(i.ckt.v51.tracks.character.effectiveMs,4);
 if(label==='键道·二字词 补全CKT ms')return num(i.ckt.v51.tracks.word2.effectiveMs,4);
 if(label==='键道·单字 补全键数')return num(i.ckt.v51.tracks.character.meanKeys,6);
 if(label==='键道·二字词 补全键数')return num(i.ckt.v51.tracks.word2.meanKeys,6);
 if(label==='键道·单字 两B后非首选')return pct(i.ckt.v51.tracks.character.selectionRate);
 if(label==='键道·二字词 两B后非首选')return pct(i.ckt.v51.tracks.word2.selectionRate);
 return snowJiandaoNA();
}

const SNOW_JIANDAO_TABLE_BASE=uxTable;
uxTable=function(headers,rows,ids=[],key='table',raws=[]){
 let html=SNOW_JIANDAO_TABLE_BASE(headers,rows,ids,key,raws);
 if((key==='benchmark'||key==='fair')&&snowJiandaoBenchmarkVisible()){
  const cells=headers.map((header,index)=>`<td${index===0?' class="first"':''}>${snowJiandaoBenchmarkCell(header,key)}</td>`).join('');
  const row=`<tr class="snow-jiandao-contract-row" data-contract="tone-in-main">${cells}</tr>`;
  html=html.replace('</tbody>',row+'</tbody>');
 }
 return html;
};

function snowJiandaoSelectionCard(){
 if(!chosen().some(entry=>entry.id===SNOW_JIANDAO_TONED_ID))return '';
 const i=D.tonedContractBenchmark.schemes.snowJiandao;
 return `<section class="dv-cohort snow-jiandao-contract-card"><div class="dv-cohort-head"><h3>带调主码合同 · 21×21</h3><span>1 个跨合同方案 · 不参加旧 20 合同授标</span></div>
 <div class="scroll"><table><thead><tr><th>方案</th><th>M-T1</th><th>D / F</th><th>带调音节 / 占桶</th><th>CKT-T v5.1 ↓</th><th>日常移动手 ↑</th></tr></thead><tbody><tr><td class="first"><button type="button" class="link" data-snow-jiandao-open>${esc(i.name)}</button><small>${esc(i.id)} · AVUIO 纯形辅</small></td><td>${i.memory.lower} / ${i.memory.guard}<small>下限 / 守门</small></td><td>${i.memory.D} / ${i.memory.F}</td><td>${i.inventory.legalTonedSyllables} / ${i.inventory.occupiedBuckets}</td><td>${num(i.ckt.v51.score,9)}</td><td>${num(i.macro['daily|native-punctuation'].score,6)}</td></tr></tbody></table></div>
 <p class="hint">该行响应上方 21×21、AVUIO、IVUAO、M≤、D≤ 与“火星十韵＋带调主码”筛选；指标采用带调原生合同。</p></section>`;
}

function snowJiandaoRenderDetail(){
 const i=D.tonedContractBenchmark.schemes.snowJiandao,q=D.tonedContractBenchmark.schemes.qzE8f37a;
 const m=i.macro['daily|native-punctuation'],e=i.ergonomics,c=i.ckt.v51.tracks.character;
 VIEW='keyboard';UX.view='scheme';uxSyncNav();snowJiandaoInstallFilterOptions();
 $('#view').innerHTML=`<section class="panel" id="snowJiandaoTonedDetail"><div class="r2-hero"><div><small>TONE-IN-MAIN 21×21 · SHAPE-ONLY AVUIO</small><h2>${esc(i.name)} · ${esc(i.id)}</h2><p>火星十韵声韵拆分；声调已进入前两码，后续只使用键道形笔辅。作为独立合同进入筛选与详情，不冒充旧无调 codeList 条目。</p></div><strong>${num(i.ckt.v51.score,6)}<small>CKT-T v5.1 ↓</small></strong></div>
 <div class="heading"><button data-action="nav:selection">返回方案筛选</button><button data-r11-report>打开跨合同完整表</button></div>
 <div class="two"><section class="card"><h3>结构与记忆</h3><p>宿主键域 <b>21×21</b>；AVUIO 五形辅；toneKeysByTone=<b>IVUAO</b>。</p><p>M-T1 下限/守门：<b>${i.memory.lower}/${i.memory.guard}</b>；D/F：<b>${i.memory.D}/${i.memory.F}</b>。</p><p>合法带调音节 <b>${i.inventory.legalTonedSyllables}</b>；占桶 <b>${i.inventory.occupiedBuckets}/${i.inventory.capacity}</b>。</p></section>
 <section class="card"><h3>合同边界</h3><p>CKT-T v5/v5.1 使用 S005=10 的四条带调原生轨，只计形辅；不再次加入调笔辅。</p><p>旧 A7E v3/v4/v5 和旧 20 合同峰值不适用。下列人体工学峰值来自字、二字、三字、四字四条原生轨。</p></section></div>
 ${snowJiandaoKeyboardPanel()}
 ${uxTable(['指标','冰雪剑道','QZ-e8f37a','口径'],[
  ['CKT v5',num(i.ckt.v5.score,9),num(q.ckt.v5,9),'各自生产合同；S005=10'],
  ['CKT v5.1',num(i.ckt.v51.score,9),num(q.ckt.v51,9),'各自生产合同；S005=10'],
  ['字轨/S2 平均键数',num(c.meanKeys,6),num(q.completion.meanKeys,6),'带调字轨 / 旧无调S2'],
  ['字轨选重/S2频权漏选',pct(c.selectionRate),pct(q.completion.missOrSelectionRate),'不同合同的最近等价指标'],
  ['日常平均有效距离',num(m.avg_effective_distance,6),num(q.macro['daily|native-punctuation'].avg_effective_distance,6),'同冻结语料与几何，可直接比较'],
  ['日常纯双拼移动手',num(m.score,6),num(q.macro['daily|native-punctuation'].score,6),'越高越好；含标点'],
  ['主行占比',pct(e.homeS2),pct(q.ergonomics.homeS2),'带调字轨 / 旧S2'],
  ['QAZ 左小指峰值',pct(e.leftPinkyQAZPeak4NativeTracks.value),pct(q.ergonomics.leftPinkyQAZPeak20Contracts.value),'4原生轨 / 旧20合同'],
  ['P 区右小指峰值',pct(e.rightPinkyPeak4NativeTracks.value),pct(q.ergonomics.rightPinkyPeak20Contracts.value),'4原生轨 / 旧20合同'],
  ['最大单指峰值',pct(e.maxFingerPeak4NativeTracks.value),pct(q.ergonomics.maxFingerPeak20Contracts.value),'4原生轨 / 旧20合同'],
  ['TYB 双食指峰值',pct(e.indexFingerTYBPeak4NativeTracks.value),pct(q.ergonomics.indexFingerTYBPeak20Contracts.value),'4原生轨 / 旧20合同'],
  ['主键区下限',pct(e.homeFloor4NativeTracks),pct(q.ergonomics.homeFloor20Contracts),'4原生轨 / 旧20合同']
 ],[],'snow-jiandao-selectable-detail')}
 <details class="card" open><summary>四条带调原生轨</summary><pre>${esc(JSON.stringify(i.ckt.v51.tracks,null,2))}</pre></details></section>`;
 snowJiandaoWireKeyboard();$('#uxEnvironment').hidden=true;uxFinishSoon();
}

const SNOW_JIANDAO_UX_RENDER_BASE=uxRender;
uxRender=function(){
 if(UX.view==='scheme'&&CURRENT===SNOW_JIANDAO_TONED_ID){++runToken;uxHideTip();snowJiandaoRenderDetail();return}
 const result=SNOW_JIANDAO_UX_RENDER_BASE();
 snowJiandaoInstallFilterOptions();
 if(UX.view==='selection'){
  const card=snowJiandaoSelectionCard(),panel=$('#view .panel');
  if(card&&panel){panel.querySelector('.snow-jiandao-contract-card')?.remove();panel.insertAdjacentHTML('beforeend',card);const warning=[...panel.querySelectorAll('p.warning')].find(node=>node.textContent.includes('没有可比方案'));if(warning)warning.remove()}
  snowJiandaoUpdateSelectionCount();
 }
 return result;
};

document.addEventListener('click',event=>{
 const button=event.target.closest('[data-snow-jiandao-open]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();CURRENT=SNOW_JIANDAO_TONED_ID;UX.view='scheme';snowJiandaoInstallFilterOptions();if($('#scheme'))$('#scheme').value=CURRENT;uxRender();uxCommit();window.scrollTo(0,0);
},true);
/* SNOW_JIANDAO_SELECTABLE_V1_END */

'''
    scripts = "\n".join((ROOT / "tools" / name).read_text(encoding="utf-8")
                        for name in ("snow_jiandao_toned_view.js", "snow_jiandao_toned_ui.js"))
    source = source.replace("function snowJiandaoRenderDetail(){", scripts + "\nfunction snowJiandaoRenderDetail(){", 1)
    if SELECTABLE_MARKER in html:
        start = html.index(SELECTABLE_MARKER)
        end = html.index(SELECTABLE_END, start) + len(SELECTABLE_END)
        html = html[:start] + source.rstrip() + html[end:]
    else:
        html = html.replace(anchor, source + anchor, 1)
    return html


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))

    if "--ui-only" in sys.argv:
        html = HTML.read_text(encoding="utf-8")
        HTML.write_text(patch_selectable_ui(html), encoding="utf-8", newline="\n")
        print(f"Updated Snow Jiandao UI: {HTML}")
        return

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
    html = patch_selectable_ui(patch_report(HTML.read_text(encoding="utf-8")))
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
