"""Add reviewed Snow Shenyun 21x26/21x28 schemes to the frozen R11 atlas.

The R11 replay bundle remains the scoring authority.  This extension changes no
existing scheme or frozen score: it evaluates new entries with the original
20-track engine, appends them to the current payload, and attaches reproducible
    four-code collision measurements to every reviewed 21x26/21x28 layout.
"""

from __future__ import annotations

import base64
import argparse
import copy
import gzip
import hashlib
import importlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    from .shenyun_collision_benchmark import (
        CUTS,
        ONSET_SCOPES,
        benchmark_catalogue,
        normalize_pinyin,
        read_word_corpus,
        select_collision_entries,
        zero_onset_scope,
    )
except ImportError:
    from shenyun_collision_benchmark import (
        CUTS,
        ONSET_SCOPES,
        benchmark_catalogue,
        normalize_pinyin,
        read_word_corpus,
        select_collision_entries,
        zero_onset_scope,
    )


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "a7_CKT_R11.html"
MATERIALS = ROOT / "a7_CKT_R11_integrated_materials"
REPLAY_ZIP = MATERIALS / "R11_integrated_replay.zip"
AUDIT_PATH = MATERIALS / "shenyun_21x28_benchmark.json"
COLLISION_AUDIT_PATH = MATERIALS / "shenyun_21x26_28_collisions.json"
DEFAULT_FRONTIER = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x28-hybrid-frontier.json"
)
DEFAULT_R10_FRONTIER = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-r10-21x28-frontier.json"
)
DEFAULT_COLLISION_EXTREMES = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x28-collision-extremes.json"
)
DEFAULT_CONSTRAINED_SEARCH = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x26-constrained-search.json"
)
DEFAULT_CONSTRAINED_CONTINUATION = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x26-constrained-continuation.json"
)
DEFAULT_CONSTRAINED_CONTINUATION_2 = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x26-constrained-continuation-2.json"
)
DEFAULT_CONSTRAINED_CONTINUATION_3 = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x26-constrained-continuation-3.json"
)
DEFAULT_CONSTRAINED_CONTINUATION_4 = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x26-constrained-continuation-4.json"
)
DEFAULT_CONSTRAINED_CONTINUATION_5 = Path(
    r"D:\C2D\Documents\rime-snow-pinyin\research-notes\data\shenyun-21x26-constrained-continuation-5.json"
)
SNOW_REPO = Path(r"D:\C2D\Documents\rime-snow-pinyin")
SCHEME_NAMES = {
    "SHENYUN-R10X28-D3-M38": "神韵盆地·D3-M38",
    "SHENYUN-HYBRID-D4-M38": "神韵盆地·D4-M38",
    "SHENYUN-HYBRID-D4-M39": "神韵盆地·D4-M39",
    "SHENYUN-HYBRID-D5-M41-FAST": "神韵盆地·D5-M41-快",
    "SHENYUN-HYBRID-D5-M41-COLL": "神韵盆地·D5-M41-碰",
    "SHENYUN-R10X28-D1-M39": "神韵性能端·D1-M39",
    "SHENYUN-R10X28-D2-M38": "神韵性能端·D2-M38",
    "SHENYUN-R10X28-D4-M38": "神韵性能端·D4-M38",
    "SHENYUN-R10X28-D5-M39-BAL": "神韵性能端·D5-M39-衡",
    "SHENYUN-R10X28-D5-M39-PERF": "神韵性能端·D5-M39-快",
    "R21X28-an-ang": "神韵碰撞端·an/ang",
    "R21X28-ang-an": "神韵碰撞端·ang/an",
    "R21X28-an-in-ui": "神韵碰撞端·an/(in+ui)",
    "R21X28-ang-in-ui": "神韵碰撞端·ang/(in+ui)",
    "R21X28-in-ui-ang": "神韵碰撞端·(in+ui)/ang",
    "S21X26-PURE-Y-PERFORMANCE-01": "21×26性能端·纯Y-01",
    "S21X26-SPLIT-Y-YU-PERFORMANCE-01": "21×26性能端·分Y/YU-01",
    "S21X26-PURE-Y-COLLISION-01": "21×26碰撞极端·纯Y-01",
    "S21X26-PURE-Y-COLLISION-02": "21×26碰撞极端·纯Y-02",
    "S21X26-SPLIT-Y-YU-COLLISION-01": "21×26碰撞极端·分Y/YU-01",
    "S21X26-PURE-Y-PERFORMANCE-05": "21×26双赢端·纯Y-05",
    "S21X26-SPLIT-Y-YU-PERFORMANCE-09": "21×26双赢端·分Y/YU-09",
    "S21X26-PURE-Y-CANYON-12": "21×26峡谷·纯Y-M43",
    "S21X26-PURE-Y-CANYON-01": "21×26峡谷深端·纯Y-01",
    "S21X26-SPLIT-Y-YU-CANYON-01": "21×26峡谷深端·分Y/YU-01",
    "S21X26-M40-PURE-Y-PERFORMANCE-04": "21×26约束性能端·M40",
    "S21X26-M38-PURE-Y-PERFORMANCE-01": "21×26约束性能端·M38",
    "S21X26-M39-PURE-Y-PERFORMANCE-10": "21×26约束双赢端·M39",
    "S21X26-M37-PURE-Y-CANYON-09": "21×26约束峡谷·M37",
    "S21X26-M39-PURE-Y-CANYON-01": "21×26约束峡谷深端·M39",
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-01": "21×26续搜性能深端·M40",
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-04": "21×26续搜双赢端·M40",
    "S21X26-CONT-F02-M38-PURE-Y-PERFORMANCE-01": "21×26续搜性能端·M38",
    "S21X26-CONT-F02-M38-PURE-Y-CANYON-07": "21×26续搜峡谷·M38",
    "S21X26-CONT-F04-M37-PURE-Y-CANYON-01": "21×26续搜峡谷·M37",
    "S21X26-CONT-F03-M39-PURE-Y-CANYON-02": "21×26续搜峡谷深端·M39",
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-01": "21×26二续性能深端·M40",
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-03": "21×26二续性能稳健端·M40",
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-01": "21×26二续性能深端·M38",
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-05": "21×26二续双赢端·M38",
    "S21X26-CONT2-F05-M37-PURE-Y-CANYON-01": "21×26二续峡谷·M37",
    "S21X26-CONT2-F04-M38-PURE-Y-CANYON-01": "21×26二续峡谷深端·M38",
    "S21X26-CONT2-F06-M39-PURE-Y-CANYON-01": "21×26二续峡谷深端·M39",
    "S21X26-CONT2-F02-M40-PURE-Y-CANYON-01": "21×26二续峡谷最深端·M40",
    "S21X26-CONT3-F02-M40-PURE-Y-PERFORMANCE-01": "21×26三续性能深端·M40",
    "S21X26-CONT3-F03-M38-PURE-Y-PERFORMANCE-01": "21×26三续性能深端·M38",
    "S21X26-CONT3-F07-M39-PURE-Y-PERFORMANCE-01": "21×26三续性能端·M39",
    "S21X26-CONT3-F06-M38-PURE-Y-CANYON-01": "21×26三续峡谷深端·M38",
    "S21X26-CONT3-F07-M39-PURE-Y-CANYON-01": "21×26三续峡谷深端·M39",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-01": "21×26三续峡谷最低碰撞·M40",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-02": "21×26三续峡谷低退化·M40",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-03": "21×26三续峡谷中心·M40",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-01": "21×26四续性能深端·M40",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-10": "21×26四续性能稳健端·M40-A",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-11": "21×26四续性能稳健端·M40-B",
    "S21X26-CONT4-F06-M40-PURE-Y-PERFORMANCE-12": "21×26四续双赢端·M40",
    "S21X26-CONT4-F05-M39-PURE-Y-CANYON-01": "21×26四续峡谷深端·M39",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-01": "21×26四续峡谷最低碰撞·M40",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-02": "21×26四续峡谷低退化·M40",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-08": "21×26四续峡谷中心·M40",
    "S21X26-CONT5-F03-M40-PURE-Y-PERFORMANCE-01": "21×26五续性能深端·M40",
    "S21X26-CONT5-F08-M40-PURE-Y-PERFORMANCE-11": "21×26五续双赢端·M39-V0",
    "S21X26-CONT5-F04-M40-PURE-Y-CANYON-05": "21×26五续窄口·M40",
    "S21X26-CONT5-F07-M40-PURE-Y-CANYON-01": "21×26五续低碰撞峡谷·M40",
    "S21X26-CONT5-F06-M40-PURE-Y-CANYON-01": "21×26五续峡谷最深端·M40",
}
HYBRID_IDS = (
    "SHENYUN-R10X28-D3-M38",
    "SHENYUN-HYBRID-D4-M38",
    "SHENYUN-HYBRID-D4-M39",
    "SHENYUN-HYBRID-D5-M41-FAST",
    "SHENYUN-HYBRID-D5-M41-COLL",
)
R10_EXTREME_IDS = (
    "SHENYUN-R10X28-D1-M39",
    "SHENYUN-R10X28-D2-M38",
    "SHENYUN-R10X28-D4-M38",
    "SHENYUN-R10X28-D5-M39-BAL",
    "SHENYUN-R10X28-D5-M39-PERF",
)
COLLISION_EXTREME_IDS = (
    "R21X28-an-ang",
    "R21X28-ang-an",
    "R21X28-an-in-ui",
    "R21X28-ang-in-ui",
    "R21X28-in-ui-ang",
)
SIX_CASE_IDS = (
    "S21X26-PURE-Y-PERFORMANCE-01",
    "S21X26-SPLIT-Y-YU-PERFORMANCE-01",
    "S21X26-PURE-Y-COLLISION-01",
    "S21X26-PURE-Y-COLLISION-02",
    "S21X26-SPLIT-Y-YU-COLLISION-01",
    "S21X26-PURE-Y-PERFORMANCE-05",
    "S21X26-SPLIT-Y-YU-PERFORMANCE-09",
    "S21X26-PURE-Y-CANYON-12",
    "S21X26-PURE-Y-CANYON-01",
    "S21X26-SPLIT-Y-YU-CANYON-01",
)
CONSTRAINED_IDS = (
    "S21X26-M40-PURE-Y-PERFORMANCE-04",
    "S21X26-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-M39-PURE-Y-PERFORMANCE-10",
    "S21X26-M37-PURE-Y-CANYON-09",
    "S21X26-M39-PURE-Y-CANYON-01",
)
CONSTRAINED_INFO = {
    "S21X26-M40-PURE-Y-PERFORMANCE-04": ("21x26 constrained performance frontier", 5, 0),
    "S21X26-M38-PURE-Y-PERFORMANCE-01": ("21x26 constrained performance frontier", 5, 0),
    "S21X26-M39-PURE-Y-PERFORMANCE-10": ("21x26 constrained win-win frontier", 5, 1),
    "S21X26-M37-PURE-Y-CANYON-09": ("21x26 constrained canyon frontier", 4, 0),
    "S21X26-M39-PURE-Y-CANYON-01": ("21x26 constrained canyon frontier", 5, 0),
}
CONTINUATION_IDS = (
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-04",
    "S21X26-CONT-F02-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT-F02-M38-PURE-Y-CANYON-07",
    "S21X26-CONT-F04-M37-PURE-Y-CANYON-01",
    "S21X26-CONT-F03-M39-PURE-Y-CANYON-02",
)
CONTINUATION_INFO = {
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-01": ("21x26 continued performance frontier", 5, 1),
    "S21X26-CONT-F01-M40-PURE-Y-PERFORMANCE-04": ("21x26 continued win-win frontier", 5, 1),
    "S21X26-CONT-F02-M38-PURE-Y-PERFORMANCE-01": ("21x26 continued performance frontier", 5, 0),
    "S21X26-CONT-F02-M38-PURE-Y-CANYON-07": ("21x26 continued canyon frontier", 5, 0),
    "S21X26-CONT-F04-M37-PURE-Y-CANYON-01": ("21x26 continued canyon frontier", 4, 0),
    "S21X26-CONT-F03-M39-PURE-Y-CANYON-02": ("21x26 continued deep-canyon frontier", 5, 1),
}
CONTINUATION_2_IDS = (
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-03",
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-05",
    "S21X26-CONT2-F05-M37-PURE-Y-CANYON-01",
    "S21X26-CONT2-F04-M38-PURE-Y-CANYON-01",
    "S21X26-CONT2-F06-M39-PURE-Y-CANYON-01",
    "S21X26-CONT2-F02-M40-PURE-Y-CANYON-01",
)
CONTINUATION_2_INFO = {
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-01": ("21x26 second-continuation performance frontier", 5, 1),
    "S21X26-CONT2-F01-M40-PURE-Y-PERFORMANCE-03": ("21x26 second-continuation stable-performance frontier", 5, 1),
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-01": ("21x26 second-continuation performance frontier", 5, 0),
    "S21X26-CONT2-F04-M38-PURE-Y-PERFORMANCE-05": ("21x26 second-continuation win-win frontier", 5, 0),
    "S21X26-CONT2-F05-M37-PURE-Y-CANYON-01": ("21x26 second-continuation canyon frontier", 4, 0),
    "S21X26-CONT2-F04-M38-PURE-Y-CANYON-01": ("21x26 second-continuation deep-canyon frontier", 5, 0),
    "S21X26-CONT2-F06-M39-PURE-Y-CANYON-01": ("21x26 second-continuation deep-canyon frontier", 5, 1),
    "S21X26-CONT2-F02-M40-PURE-Y-CANYON-01": ("21x26 second-continuation deepest-canyon frontier", 5, 1),
}
CONTINUATION_3_IDS = (
    "S21X26-CONT3-F02-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT3-F03-M38-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT3-F07-M39-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT3-F06-M38-PURE-Y-CANYON-01",
    "S21X26-CONT3-F07-M39-PURE-Y-CANYON-01",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-01",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-02",
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-03",
)
CONTINUATION_3_INFO = {
    "S21X26-CONT3-F02-M40-PURE-Y-PERFORMANCE-01": ("21x26 third-continuation performance frontier", 5, 1),
    "S21X26-CONT3-F03-M38-PURE-Y-PERFORMANCE-01": ("21x26 third-continuation performance frontier", 5, 0),
    "S21X26-CONT3-F07-M39-PURE-Y-PERFORMANCE-01": ("21x26 third-continuation performance frontier", 5, 1),
    "S21X26-CONT3-F06-M38-PURE-Y-CANYON-01": ("21x26 third-continuation deep-canyon frontier", 5, 0),
    "S21X26-CONT3-F07-M39-PURE-Y-CANYON-01": ("21x26 third-continuation deep-canyon frontier", 5, 1),
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-01": ("21x26 third-continuation minimum-collision canyon", 5, 1),
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-02": ("21x26 third-continuation low-regret canyon", 5, 1),
    "S21X26-CONT3-F08-M40-PURE-Y-CANYON-03": ("21x26 third-continuation canyon center", 5, 1),
}
CONTINUATION_4_IDS = (
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-10",
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-11",
    "S21X26-CONT4-F06-M40-PURE-Y-PERFORMANCE-12",
    "S21X26-CONT4-F05-M39-PURE-Y-CANYON-01",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-01",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-02",
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-08",
)
CONTINUATION_4_INFO = {
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-01": ("21x26 fourth-continuation performance frontier", 5, 1),
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-10": ("21x26 fourth-continuation stable-performance frontier", 5, 1),
    "S21X26-CONT4-F01-M40-PURE-Y-PERFORMANCE-11": ("21x26 fourth-continuation stable-performance frontier", 5, 1),
    "S21X26-CONT4-F06-M40-PURE-Y-PERFORMANCE-12": ("21x26 fourth-continuation win-win frontier", 5, 1),
    "S21X26-CONT4-F05-M39-PURE-Y-CANYON-01": ("21x26 fourth-continuation deep-canyon frontier", 5, 1),
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-01": ("21x26 fourth-continuation minimum-collision canyon", 5, 1),
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-02": ("21x26 fourth-continuation low-regret canyon", 5, 1),
    "S21X26-CONT4-F06-M40-PURE-Y-CANYON-08": ("21x26 fourth-continuation canyon center", 5, 1),
}
CONTINUATION_5_IDS = (
    "S21X26-CONT5-F03-M40-PURE-Y-PERFORMANCE-01",
    "S21X26-CONT5-F08-M40-PURE-Y-PERFORMANCE-11",
    "S21X26-CONT5-F04-M40-PURE-Y-CANYON-05",
    "S21X26-CONT5-F07-M40-PURE-Y-CANYON-01",
    "S21X26-CONT5-F06-M40-PURE-Y-CANYON-01",
)
CONTINUATION_5_INFO = {
    "S21X26-CONT5-F03-M40-PURE-Y-PERFORMANCE-01": ("21x26 fifth-continuation performance frontier", 5, 1),
    "S21X26-CONT5-F08-M40-PURE-Y-PERFORMANCE-11": ("21x26 fifth-continuation M39/V0 win-win frontier", 5, 0),
    "S21X26-CONT5-F04-M40-PURE-Y-CANYON-05": ("21x26 fifth-continuation narrow-neck frontier", 5, 1),
    "S21X26-CONT5-F07-M40-PURE-Y-CANYON-01": ("21x26 fifth-continuation low-collision canyon", 5, 1),
    "S21X26-CONT5-F06-M40-PURE-Y-CANYON-01": ("21x26 fifth-continuation minimum-collision canyon", 5, 1),
}
INTEGRATED_IDS = (
    *HYBRID_IDS,
    *R10_EXTREME_IDS,
    *COLLISION_EXTREME_IDS,
    *CONSTRAINED_IDS,
    *CONTINUATION_IDS,
    *CONTINUATION_2_IDS,
    *CONTINUATION_3_IDS,
    *CONTINUATION_4_IDS,
    *CONTINUATION_5_IDS,
)
LEGACY_SHENYUN_IDS = (
    "SNOW-SHENYUN-21X28-SHAPE",
    "SNOW-SHENYUN-21X28-TONE",
)
BASE_CATALOGUE_COUNT = 484
NEW_HISTORICAL_IDS = (*R10_EXTREME_IDS, *COLLISION_EXTREME_IDS)

NOT_COMMON399 = {
    "biang", "cei", "chua", "dei", "den", "dia", "din", "ei", "fiao",
    "hng", "kei", "lia", "lo", "m", "n", "ng", "nou", "nun", "rua",
    "tei", "zhei", "ê",
}
def extract_payload(html: str) -> tuple[dict, int, int]:
    start = html.index('<script id="payload"')
    body = html.index(">", start) + 1
    end = html.index("</script>", body)
    payload = json.loads(gzip.decompress(base64.b64decode(html[body:end])))
    return payload, body, end


def integrate_collision_ui(html: str) -> str:
    """Add the comparable 21x26/21x28 four-code summaries and drill-down once."""
    marker = "SHENYUN_COLLISION_UI_V2"
    if marker in html:
        return html
    legacy_marker = "SHENYUN_COLLISION_UI_V1"
    if legacy_marker in html:
        html = html.replace(legacy_marker, marker, 1)
        anchor = "function renderFourCodeCollision(){"
        assert html.count(anchor) == 1
        scope_helper = """function zeroOnsetScopeLabel(e){
 const scope=e?.zeroOnsetScope||(e?.initialMap?.Y===e?.initialMap?.YU?'pure-y':'split-y-yu');
 return scope==='pure-y'?'纯 ØY':scope==='split-y-yu'?'ØY / ØYU':'未声明';
}
"""
        html = html.replace(anchor, scope_helper + anchor, 1)
        old_loop = """ for(const e of es)for(const cut of cuts){const m=e.fourCodeCollision.cuts[cut],domain=e.capacity.join('×');
  rows.push([uxId(e.id),domain,Number(cut).toLocaleString(),pct(m.crossAffectedRate),pct(m.crossFirstChoiceLossRate),m.crossBuckets,m.collisionBuckets,m.maxBucket]);
  ids.push(e.id);raws.push([e.id,domain,Number(cut),m.crossAffectedRate,m.crossFirstChoiceLossRate,m.crossBuckets,m.collisionBuckets,m.maxBucket]);
 }"""
        new_loop = """ for(const e of es)for(const cut of cuts){const m=e.fourCodeCollision.cuts[cut],domain=e.capacity.join('×'),scope=zeroOnsetScopeLabel(e);
  rows.push([uxId(e.id),domain,scope,Number(cut).toLocaleString(),pct(m.crossAffectedRate),pct(m.crossFirstChoiceLossRate),m.crossBuckets,m.collisionBuckets,m.maxBucket]);
  ids.push(e.id);raws.push([e.id,domain,scope,Number(cut),m.crossAffectedRate,m.crossFirstChoiceLossRate,m.crossBuckets,m.collisionBuckets,m.maxBucket]);
 }"""
        assert html.count(old_loop) == 1
        html = html.replace(old_loop, new_loop, 1)
        old_headers = "['方案','宿主键域','词频截点','跨族受影响','高频首选损失','跨族碰撞桶','全部碰撞桶','最大桶']"
        new_headers = "['方案','宿主键域','零声母 scope','词频截点','跨族受影响','高频首选损失','跨族碰撞桶','全部碰撞桶','最大桶']"
        assert html.count(old_headers) == 1
        return html.replace(old_headers, new_headers, 1)

    helper = r'''
/* SHENYUN_COLLISION_UI_V2: Common399 AUAU/AAAU/AAAA real-corpus comparison. */
function fourCodeCollisionSummary(e){
 const c=e?.fourCodeCollision,t=c?.cuts?.['10000'];return {
  avgAffected:c?.fiveCutAverageCrossAffectedRate??null,
  avgLoss:c?.fiveCutAverageCrossFirstChoiceLossRate??null,
  topAffected:t?.crossAffectedRate??null,
  topLoss:t?.crossFirstChoiceLossRate??null,
  maxBucket:t?.maxBucket??null
 };
}
function zeroOnsetScopeLabel(e){
 const scope=e?.zeroOnsetScope||(e?.initialMap?.Y===e?.initialMap?.YU?'pure-y':'split-y-yu');
 return scope==='pure-y'?'纯 ØY':scope==='split-y-yu'?'ØY / ØYU':'未声明';
}
function renderFourCodeCollision(){
 VIEW='benchmark';UX.view='benchmark';UX.bench='collision';uxSyncNav();
 const cuts=['500','1000','2000','5000','10000'],es=chosen().filter(e=>e.fourCodeCollision),rows=[],ids=[],raws=[];
 for(const e of es)for(const cut of cuts){const m=e.fourCodeCollision.cuts[cut],domain=e.capacity.join('×'),scope=zeroOnsetScopeLabel(e);
  rows.push([uxId(e.id),domain,scope,Number(cut).toLocaleString(),pct(m.crossAffectedRate),pct(m.crossFirstChoiceLossRate),m.crossBuckets,m.collisionBuckets,m.maxBucket]);
  ids.push(e.id);raws.push([e.id,domain,scope,Number(cut),m.crossAffectedRate,m.crossFirstChoiceLossRate,m.crossBuckets,m.collisionBuckets,m.maxBucket]);
 }
 $('#view').innerHTML=`<div class="panel compact"><div class="heading"><h2>四码跨编码族碰撞明细</h2><span>${es.length} 个方案（全部 21×28 + 三个 21×26 极端）· ${rows.length} 行</span></div>
 <p>同一真实词表中平权比较二字词 AUAU、三字词 AAAU、四字词 AAAA；每个截点按词频确定同码桶首选。缺失读音不记作零碰撞。</p>
 <p class="hint">语料截点：Top 500 / 1k / 2k / 5k / 10k。跨族受影响和首选损失按词频加权；最大桶按候选词数计。</p>
 <div class="ux-table-tools">${uxButton('返回综合表','collision-back','benchmark')} ${uxButton('导出本表 CSV','export-visible','export')}</div></div>
 ${uxTable(['方案','宿主键域','零声母 scope','词频截点','跨族受影响','高频首选损失','跨族碰撞桶','全部碰撞桶','最大桶'],rows,ids,'four-code-collision',raws)}`;
 uxFinishSoon();
}
'''
    anchor = "function uxHeadersBenchmark(){"
    assert html.count(anchor) == 1
    html = html.replace(anchor, helper + "\n" + anchor, 1)

    old_headers = "['A7E-v3','v3',null,null],['A7E-v2','v2',null,null],['A7E-v1','v1',null,null]"
    new_headers = old_headers + ",\n ['五档跨族受影响均值','collisionAffectedAvg',null,null],['五档首选损失均值','collisionLossAvg',null,null],\n ['Top10k 受影响','collisionTopAffected',null,null],['Top10k 首选损失','collisionTopLoss',null,null],['Top10k 最大桶','collisionMaxBucket',null,null]"
    assert html.count(old_headers) == 1
    html = html.replace(old_headers, new_headers, 1)

    old_meta = "let meta=x.byId[e.id],v5=ensembleV5Info(e),coverage=D.fairCKT?.values?.[e.id],dom=keyDomainInfo(e);"
    assert html.count(old_meta) == 1
    html = html.replace(old_meta, old_meta + "\n  let fc=fourCodeCollisionSummary(e);", 1)

    old_nums = "z.sfb,z.repeat,z.alt,z.rightPinky,z.maxFinger,z.home,ensembleV3Value(e),ensembleV2Value(e),ensembleValue(e)];"
    new_nums = "z.sfb,z.repeat,z.alt,z.rightPinky,z.maxFinger,z.home,ensembleV3Value(e),ensembleV2Value(e),ensembleValue(e),\n   fc.avgAffected,fc.avgLoss,fc.topAffected,fc.topLoss,fc.maxBucket];"
    assert html.count(old_nums) == 1
    html = html.replace(old_nums, new_nums, 1)

    old_cells = "num(ensembleV3Value(e)),num(ensembleV2Value(e)),num(ensembleValue(e))];"
    new_cells = "num(ensembleV3Value(e)),num(ensembleV2Value(e)),num(ensembleValue(e)),\n   pct(fc.avgAffected),pct(fc.avgLoss),pct(fc.topAffected),pct(fc.topLoss),fc.maxBucket??'—'];"
    assert html.count(old_cells) == 1
    html = html.replace(old_cells, new_cells, 1)

    old_tools = "${uxButton('导出本表 CSV','export-visible','export')} ${uxButton('消歧与音形公平对比','fair','completion')}"
    assert html.count(old_tools) == 1
    html = html.replace(old_tools, old_tools + " ${uxButton('四码碰撞明细','collision','collision')}", 1)

    old_action = "if(a==='fair'){UX.view='benchmark';UX.bench='fair';uxSyncNav();uxRenderFair();uxCommit();return}"
    new_action = old_action + "\n if(a==='collision'){renderFourCodeCollision();uxCommit();return}\n if(a==='collision-back'){UX.bench='table';renderBenchmark();uxCommit();return}"
    assert html.count(old_action) == 1
    return html.replace(old_action, new_action, 1)


def integrate_collision_navigation(html: str) -> str:
    """Keep the dedicated view stable across history and the final R11 nav."""
    marker = "SHENYUN_COLLISION_NAV_V1"
    if marker in html:
        return html

    old_render = "uxRender=function(){if(UX.view==='benchmark'&&UX.bench==='macro'){++runToken;uxHideTip();uxSyncNav();r9MacroRender();return}R9_MX_RENDER()};"
    new_render = "/* SHENYUN_COLLISION_NAV_V1 */\nuxRender=function(){if(UX.view==='benchmark'&&UX.bench==='collision'){++runToken;uxHideTip();uxSyncNav();renderFourCodeCollision();return}if(UX.view==='benchmark'&&UX.bench==='macro'){++runToken;uxHideTip();uxSyncNav();r9MacroRender();return}R9_MX_RENDER()};"
    assert html.count(old_render) == 1
    html = html.replace(old_render, new_render, 1)

    old_nav = "uxNavigate=function(view,sub){if(view==='benchmark'&&sub==='macro'){UX.view='benchmark';UX.bench='macro';uxRender();uxCommit();window.scrollTo(0,0);return}return R9_MX_NAV(view,sub)};"
    new_nav = "uxNavigate=function(view,sub){if(view==='benchmark'&&sub==='collision'){UX.view='benchmark';UX.bench='collision';uxRender();uxCommit();window.scrollTo(0,0);return}if(view==='benchmark'&&sub==='macro'){UX.view='benchmark';UX.bench='macro';uxRender();uxCommit();window.scrollTo(0,0);return}return R9_MX_NAV(view,sub)};"
    assert html.count(old_nav) == 1
    html = html.replace(old_nav, new_nav, 1)

    old_sync = "n.innerHTML=`<button data-r9-bench=\"table\" class=\"${UX.bench!=='macro'?'active':''}\">冻结20合同全量比较</button><button data-r9-bench=\"macro\" class=\"${UX.bench==='macro'?'active':''}\">macroxue 纯双拼文稿</button>`;"
    new_sync = "n.innerHTML=`<button data-r9-bench=\"table\" class=\"${UX.bench==='table'?'active':''}\">冻结20合同全量比较</button><button data-r9-bench=\"collision\" class=\"${UX.bench==='collision'?'active':''}\">四码碰撞明细</button><button data-r9-bench=\"macro\" class=\"${UX.bench==='macro'?'active':''}\">macroxue 纯双拼文稿</button>`;"
    assert html.count(old_sync) == 1
    html = html.replace(old_sync, new_sync, 1)

    old_click = "if(b.dataset.r9Bench){uxNavigate('benchmark',b.dataset.r9Bench==='macro'?'macro':null);return}"
    new_click = "if(b.dataset.r9Bench){uxNavigate('benchmark',b.dataset.r9Bench==='macro'?'macro':b.dataset.r9Bench==='collision'?'collision':null);return}"
    assert html.count(old_click) == 1
    return html.replace(old_click, new_click, 1)


def integrate_zero_onset_ui(html: str) -> str:
    """Teach the NF4 keyboard renderer the canonical ØA/ØYU role labels."""
    marker = "SHENYUN_ZERO_ONSET_LABELS_V1"
    if marker in html:
        return html
    anchor = "function nf4Fonts(v,onset,alias){"
    assert html.count(anchor) == 1
    helper = (
        "/* SHENYUN_ZERO_ONSET_LABELS_V1 */\n"
        "function nfZeroOnsetToken(s){const t=String(s||'');"
        "return t.startsWith('Ø')?t.slice(1):label(t).replace(/^Ø\\s*/, '')}\n"
    )
    html = html.replace(anchor, helper + anchor, 1)
    old = "zeroText=zero.length?'Ø '+zero.map(s=>label(s).replace(/^Ø\\s*/, '')).join('/'):'';"
    new = "zeroText=zero.length?'Ø '+zero.map(nfZeroOnsetToken).join('/'):'';"
    assert html.count(old) == 1
    return html.replace(old, new, 1)


def inverse(mapping: dict[str, str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for label, key in mapping.items():
        result.setdefault(key, []).append(label)
    return {key: labels for key, labels in sorted(result.items())}


ZERO_ONSET_LABELS = {
    "A": "ØA",
    "E": "ØE",
    "O": "ØO",
    "W": "ØW",
    "Y": "ØY",
    "YU": "ØYU",
}


def onset_roles(initial_map: dict[str, str]) -> dict[str, list[str]]:
    """Build display roles while keeping parser symbols out of the keyboard UI."""
    return inverse({
        ZERO_ONSET_LABELS.get(label, label): key
        for label, key in initial_map.items()
    })


def normalize_21x28_onset_metadata(data: dict) -> list[str]:
    changed = []
    for entry in data["entries"]:
        if entry.get("capacity") != [21, 28]:
            continue
        roles = onset_roles(entry["initialMap"])
        scope = zero_onset_scope(entry)
        if entry.get("roles") != roles or entry.get("zeroOnsetScope") != scope:
            changed.append(entry["id"])
        entry["roles"] = roles
        entry["zeroOnsetScope"] = scope
    return changed


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontier", type=Path, default=DEFAULT_FRONTIER)
    parser.add_argument("--r10-frontier", type=Path, default=DEFAULT_R10_FRONTIER)
    parser.add_argument("--collision-extremes", type=Path, default=DEFAULT_COLLISION_EXTREMES)
    parser.add_argument("--constrained-search", type=Path, default=DEFAULT_CONSTRAINED_SEARCH)
    parser.add_argument("--constrained-continuation", type=Path, default=DEFAULT_CONSTRAINED_CONTINUATION)
    parser.add_argument("--constrained-continuation-2", type=Path, default=DEFAULT_CONSTRAINED_CONTINUATION_2)
    parser.add_argument("--constrained-continuation-3", type=Path, default=DEFAULT_CONSTRAINED_CONTINUATION_3)
    parser.add_argument("--constrained-continuation-4", type=Path, default=DEFAULT_CONSTRAINED_CONTINUATION_4)
    parser.add_argument("--constrained-continuation-5", type=Path, default=DEFAULT_CONSTRAINED_CONTINUATION_5)
    return parser.parse_args()


def make_entry(source: dict, split, scheme: dict) -> dict:
    scheme_id = scheme["id"]
    initial_map = scheme["initialMap"]
    final_map = scheme["finalMap"]
    auxiliary = scheme["toneKeys"]
    split_y_yu = initial_map["Y"] != initial_map["YU"]
    code_list = []
    for spelling in source["pinyin"]:
        if spelling in NOT_COMMON399:
            code_list.append(None)
            continue
        head, final = split(spelling, split_y_yu)
        code_list.append(initial_map[head] + final_map[final])
    digest = hashlib.sha256(
        json.dumps(code_list, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    common_codes = [code_list[index] for index, _ in source["base"]]
    assert len(common_codes) == 399 and len(set(common_codes)) == 399
    punctuation = {
        key: sorted(final for final, value in final_map.items() if value == key)
        for key in ",."
    }
    capacity = scheme["capacity"]
    domain = "x".join(map(str, capacity))
    mapping_scope = f"Common399; {domain}"
    if capacity == [21, 28]:
        mapping_scope += f"; comma={'+'.join(punctuation[','])}; period={'+'.join(punctuation['.'])}"
    notes = [
        f"Common399 399/399 unique; M{scheme['M']}, D{scheme['D']}, V{scheme['V']}; no split-final route.",
        f"Research label: {scheme['label']}; fixed auxiliary order {auxiliary}.",
    ]
    if capacity == [21, 28]:
        notes.insert(1, "Comma and period are final keys only; invalid positions retain punctuation top-out semantics.")
    return {
        "id": scheme_id,
        "name": SCHEME_NAMES[scheme_id],
        "family": f"Snow Shenyun {domain}",
        "subfamily": scheme["atlasSubfamily"],
        "source": scheme["atlasSource"],
        "new": True,
        "codeList": code_list,
        "tone": auxiliary,
        "capacity": capacity,
        "actual": scheme["actual"],
        "initialMap": initial_map,
        "finalMap": final_map,
        "roles": onset_roles(initial_map),
        "zeroOnsetScope": zero_onset_scope({"initialMap": initial_map}),
        "rhymes": inverse(final_map),
        "reservedKeys": "AEIOU",
        "auxiliaryClass": auxiliary,
        "defaultAuxOrder": auxiliary in {"AEUIO", "IEUAO"},
        "auxiliaryMappingMatchesReservation": True,
        "topgongReserve": "AEIOU",
        "topgongValid": True,
        "strictTopgong": True,
        "exceptionCount": 0,
        "searchMemoryNoTone": scheme["M"],
        "mappingAudit": {
            "scope": mapping_scope,
            "codeListSha256": digest,
            "ordinaryInitialDisplacements": scheme["D"],
            "baseFinalDisplacements": scheme["V"],
            "aaVacancies": scheme.get("vacancyProxy", {}).get("aaVacancies"),
        },
        "legacyFourCodeCollision": scheme.get("fourCodeCollision"),
        "hybridVacancyProxy": scheme.get("vacancyProxy"),
        "hybridSearchPerformanceProxy": scheme.get("performanceProxy"),
        "r11Provenance": {
            "parent": None,
            "kind": "post-R11 equal-footing research extension",
            "soundLayout": scheme_id,
        },
        "notes": notes,
    }


def load_summary(data: dict, scheme_id: str) -> dict:
    keys = data["reference"]["keys"] + "_"
    layout = data["reference"]["layout"]
    tracks = data["ckt"]["tracks"][scheme_id]
    far_keys = "QP;/[']YTBZX,."
    right_keys = "P[]\\;'/"
    left_keys = "QAZ"
    rows = {
        track: [
            sum(value for key, value in zip(keys, tracks[track]["load"])
                if key in layout and layout[key]["row"] == row)
            for row in range(3)
        ]
        for track in ["C4-Snow", "WX-Snow-12"]
    }
    def group(group_keys: str) -> dict[str, float]:
        return {
            track: sum(metric["load"][keys.index(key)] for key in set(group_keys))
            for track, metric in tracks.items()
        }

    right = group(right_keys)
    left = group(left_keys)
    far = {
        key: max(metric["load"][keys.index(key)] for metric in tracks.values())
        for key in dict.fromkeys(far_keys)
    }
    return {
        "homeS2": tracks["S2"]["home"],
        "homeC4": tracks["C4-Snow"]["home"],
        "homeWX": tracks["WX-Snow-12"]["home"],
        "homeFloor": min(tracks[track]["home"] for track in rows),
        "rowsC4": rows["C4-Snow"],
        "rowsWX": rows["WX-Snow-12"],
        "rowGap": max(row[0] - row[2] for row in rows.values()),
        "lowerUpperRatio": min(row[2] / row[0] if row[0] else 1 for row in rows.values()),
        "farLoads": far,
        "farMax": max(far.values()),
        "Wmax": max(metric["load"][keys.index("W")] for metric in tracks.values()),
        "Ymax": far["Y"],
        "rightPinkyMax20": max(right.values()),
        "rightPinkyTrack": max(right, key=right.get),
        "rightPinkyByTrack": right,
        "leftPinkyMax20": max(left.values()),
        "leftPinkyTrack": max(left, key=left.get),
        "leftPinkyByTrack": left,
        "maxFinger20": max(metric["maxFinger"] for metric in tracks.values()),
        "homeByTrack": {track: metric["home"] for track, metric in tracks.items()},
    }


def integrate_macroxue(data: dict, entries: list[dict], replay: Path) -> None:
    engine = importlib.import_module("macroxue.engine")
    corpora = json.loads((replay / "R9_corpora.json").read_text(encoding="utf-8"))
    pinyin_index = {pinyin: index for index, pinyin in enumerate(data["pinyin"])}
    macro = data["macroxue"]
    for entry in entries:
        output = {}
        for corpus_name, corpus in corpora.items():
            for variant in ("native-punctuation", "hanzi-only"):
                tokens = [
                    token for token in corpus["tokens"]
                    if variant == "native-punctuation" or "pinyin" in token
                ]
                strokes = "".join(
                    token.get("key")
                    or entry["codeList"][pinyin_index[token["pinyin"]]].lower()
                    for token in tokens
                )
                result = engine.evaluate(strokes, len(tokens))
                result["strokeSha256"] = hashlib.sha256(strokes.encode()).hexdigest()
                result["coverage"] = 1.0
                result["extendedKeyHits"] = sum(result["heat_map"][key] for key in "[]\\'")
                result["pureDoublePinyin"] = True
                control = macro["fullPinyinControl"][f"{corpus_name}|{variant}"]
                result["fullPinyinScoreRatio"] = result["score"] / control["score"]
                output[f"{corpus_name}|{variant}"] = result
        macro["values"][entry["id"]] = output
    macro["verification"]["schemes"] = len(macro["values"])
    macro["verification"]["fullCatalogueReplays"] = (
        len(macro["values"]) * len(corpora) * 2
    )
    macro["verification"]["allCoverageComplete"] = True


def integrate(data: dict, source: dict, entries: list[dict], exact: dict[str, dict], replay: Path) -> dict:
    sys.path.insert(0, str(replay))
    memory_r2 = importlib.import_module("memory_r2")
    logic = importlib.import_module("logic")
    metrics_r8 = importlib.import_module("metrics_r8")
    pair_eval_r8 = importlib.import_module("pair_eval_r8")

    ids = {entry["id"] for entry in data["entries"]}
    previous_v6_values = copy.deepcopy(data.get("ensembleV6", {}).get("values", {}))
    assert not ids.intersection(entry["id"] for entry in entries)
    versions = ["ensemble", "ensembleV2", "ensembleV3", "ensembleV4", "ensembleV5"]
    for entry in entries:
        scheme_id = entry["id"]
        scored = exact[scheme_id]
        audit = memory_r2.audit(source, entry)
        expected = entry["mappingAudit"]
        assert audit["M"] == entry["searchMemoryNoTone"], (scheme_id, audit["M"])
        assert audit["ordinaryDisplacedCount"] == expected["ordinaryInitialDisplacements"]
        assert audit["unique"] == 399
        entry["memoryAuditR2"] = audit
        entry["memoryAuditNF4"] = copy.deepcopy(audit)
        entry["memory"] = {
            "firstLinks": audit["firstLinks"],
            "finalLinks": audit["finalLinks"],
            "nontrivialFinals": audit["finalLinks"],
            "toneLinks": 5,
            "conditionalBranches": audit["branchCount"],
            "commonNontrivial": audit["M"] + 5,
            "definition": "M-R2-explicit",
            "scope": audit["scope"],
        }
        entry["logicUniformity"] = logic.lu(entry)
        entry["logicAudit"] = logic.fa(entry)
        entry["sound"] = copy.deepcopy(scored["quick"][scheme_id + "|S2"])
        entry["sound"]["memory"] = audit["M"] + 5
        entry["metricVerification"] = scored["verification"]
        data["entries"].append(entry)
        for version in versions:
            data[version]["values"][scheme_id] = copy.deepcopy(scored["scores"][version])
            if "scoreCoverage" in data[version]:
                data[version]["scoreCoverage"] = len(data["entries"])
        for key, value in scored["quick"].items():
            value["memory"] = audit["M"] + 5
            data["quick"][key] = value
        data["ckt"]["tracks"][scheme_id] = scored["tracks"]
        data["ckt"]["eligibility"][scheme_id] = {
            "eligible": scored["fair"]["domainValid"] and audit["unique"] == 399,
            "unique399": audit["unique"],
            "actualI": entry["actual"][0],
            "actualR": entry["actual"][1],
            "reasons": [],
        }
        data["fairCKT"]["values"][scheme_id] = scored["fair"]
        data["finalSelection"]["factorAuditValues"][scheme_id] = entry["logicAudit"]

    data["r11LoadSummaries"] = {
        entry["id"]: load_summary(data, entry["id"]) for entry in data["entries"]
    }
    data["r9LoadSummaries"] = data["r11LoadSummaries"]
    recomputed_v6 = metrics_r8.compute(data)
    for scheme_id in ids:
        if scheme_id in previous_v6_values:
            recomputed_v6["values"][scheme_id] = previous_v6_values[scheme_id]
    data["ensembleV6"] = recomputed_v6
    previous_directory = Path.cwd()
    try:
        os.chdir(replay)
        data["r11PairMetrics"] = pair_eval_r8.compute(data)
    finally:
        os.chdir(previous_directory)
    data["r11PairMetrics"]["verification"].pop("seconds", None)
    data["r9PairMetrics"] = data["r11PairMetrics"]

    for entry in entries:
        scheme_id = entry["id"]
        codes = [entry["codeList"][index] for index, _ in source["base"]]
        first = {code[0] for code in codes}
        second = {code[1] for code in codes}
        eligibility = {
            "comparable": True,
            "commonCovered": 399,
            "twoKey": True,
            "supported34": True,
            "capacityOK": len(first) <= entry["capacity"][0] and len(second) <= entry["capacity"][1],
            "requiredReservationOK": True,
            "historicalDomainValid": True,
            "actualFirstCommon": len(first),
            "actualSecondCommon": len(second),
            "declaredCapacity": entry["capacity"],
            "unique399": len(set(codes)),
            "reasonCodes": [],
            "historicalReferenceEligible": None,
        }
        data["r11Eligibility"][scheme_id] = eligibility
        data["r10Eligibility"][scheme_id] = copy.deepcopy(eligibility)

    data["finalSelection"]["currentCatalogueCount"] = len(data["entries"])
    research = data.setdefault("r11Research", {})
    research.setdefault("counts", {})["current"] = len(data["entries"])
    research["counts"]["postR11ResearchExtensions"] = sum(
        entry["id"].startswith(("SNOW-SHENYUN-", "SHENYUN-"))
        for entry in data["entries"]
    )
    scope_rows = research.setdefault("scopeRows", [])
    scope = [
        "Snow Shenyun 21x26/21x28 reviewed frontiers",
        "Fixed-IEUAO performance, collision, and canyon representatives under declared Y scope",
    ]
    if scope not in scope_rows:
        scope_rows.append(scope)
    results = research.setdefault("results", [])
    known_results = {row.get("id") for row in results}
    results.extend([
        {
            "id": entry["id"],
            "domain": "x".join(map(str, entry["capacity"])),
            "name": entry["name"],
            "M": entry["memoryAuditR2"]["M"],
            "D": entry["memoryAuditR2"]["ordinaryDisplacedCount"],
            "V": entry["mappingAudit"]["baseFinalDisplacements"],
            "tone": entry["tone"],
            "unique": entry["memoryAuditR2"]["unique"],
            "S2": data["ckt"]["tracks"][entry["id"]]["S2"]["upperMs"],
            "v6": data["ensembleV6"]["values"][entry["id"]],
            **load_summary(data, entry["id"]),
        }
        for entry in entries
        if entry["id"] not in known_results
    ])
    return data


def load_research_schemes(args: argparse.Namespace) -> tuple[dict[str, dict], dict[str, str]]:
    sources = {
        "hybrid": args.frontier.resolve(),
        "r10": args.r10_frontier.resolve(),
        "collision": args.collision_extremes.resolve(),
        "constrained": args.constrained_search.resolve(),
        "continuation": args.constrained_continuation.resolve(),
        "continuation2": args.constrained_continuation_2.resolve(),
        "continuation3": args.constrained_continuation_3.resolve(),
        "continuation4": args.constrained_continuation_4.resolve(),
        "continuation5": args.constrained_continuation_5.resolve(),
    }
    payloads = {
        name: json.loads(path.read_text(encoding="utf-8"))
        for name, path in sources.items()
    }
    selected: dict[str, dict] = {}
    metadata = {
        "hybrid": (HYBRID_IDS, "schemes", "AUBB Feihua hybrid frontier", "Snow Shenyun hybrid-basin research frontier; original R11 20-track replay"),
        "r10": (R10_EXTREME_IDS, "schemes", "R10-derived performance extreme", "Snow Shenyun R10-to-21x28 performance frontier; original R11 20-track replay"),
        "collision": (COLLISION_EXTREME_IDS, "schemes", "D1/V0 collision extreme", "Snow Shenyun six directed punctuation-final collision layouts; original R11 20-track replay"),
        "constrained": (CONSTRAINED_IDS, "candidates", None, "Snow Shenyun M40/D5 constrained 21x26 search; original R11 20-track replay"),
        "continuation": (CONTINUATION_IDS, "candidates", None, "Snow Shenyun five-seed constrained 21x26 continuation; original R11 20-track replay"),
        "continuation2": (CONTINUATION_2_IDS, "candidates", None, "Snow Shenyun six-seed constrained 21x26 second continuation; original R11 20-track replay"),
        "continuation3": (CONTINUATION_3_IDS, "candidates", None, "Snow Shenyun eight-seed constrained 21x26 third continuation; original R11 20-track replay"),
        "continuation4": (CONTINUATION_4_IDS, "candidates", None, "Snow Shenyun eight-seed constrained 21x26 fourth continuation; original R11 20-track replay"),
        "continuation5": (CONTINUATION_5_IDS, "candidates", None, "Snow Shenyun five-representative constrained 21x26 fifth continuation; original R11 20-track replay"),
    }
    info_by_source = {
        "constrained": CONSTRAINED_INFO,
        "continuation": CONTINUATION_INFO,
        "continuation2": CONTINUATION_2_INFO,
        "continuation3": CONTINUATION_3_INFO,
        "continuation4": CONTINUATION_4_INFO,
        "continuation5": CONTINUATION_5_INFO,
    }
    for source_name, (ids, collection, subfamily, description) in metadata.items():
        by_id = {row["id"]: row for row in payloads[source_name][collection]}
        assert set(ids) <= by_id.keys(), (source_name, set(ids) - by_id.keys())
        for scheme_id in ids:
            scheme = copy.deepcopy(by_id[scheme_id])
            if source_name in info_by_source:
                info = info_by_source[source_name]
                direction, displaced, vowel_displaced = info[scheme_id]
                scheme.update({
                    "capacity": [21, 26],
                    "actual": [21, 26],
                    "D": displaced,
                    "V": vowel_displaced,
                    "label": SCHEME_NAMES[scheme_id],
                    "atlasSubfamily": direction,
                })
            else:
                scheme["atlasSubfamily"] = subfamily
            scheme["atlasSource"] = description
            selected[scheme_id] = scheme
    assert set(selected) == set(INTEGRATED_IDS)
    return selected, {
        name: hashlib.sha256(path.read_bytes()).hexdigest()
        for name, path in sources.items()
    }


def preservation_snapshot(data: dict, scheme_ids: set[str]) -> dict[str, str]:
    by_id = {entry["id"]: entry for entry in data["entries"]}
    versions = ("ensemble", "ensembleV2", "ensembleV3", "ensembleV4", "ensembleV5", "ensembleV6")
    answer = {}
    for scheme_id in sorted(scheme_ids):
        entry = copy.deepcopy(by_id[scheme_id])
        entry.pop("fourCodeCollision", None)
        entry.pop("roles", None)
        entry.pop("zeroOnsetScope", None)
        record = {
            "entry": entry,
            "scores": {
                version: data.get(version, {}).get("values", {}).get(scheme_id)
                for version in versions
            },
            "tracks": data.get("ckt", {}).get("tracks", {}).get(scheme_id),
            "fair": data.get("fairCKT", {}).get("values", {}).get(scheme_id),
            "load": data.get("r11LoadSummaries", {}).get(scheme_id),
            "macroxue": data.get("macroxue", {}).get("values", {}).get(scheme_id),
        }
        answer[scheme_id] = hashlib.sha256(
            json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
    return answer


def prune_scheme_ids(data: dict, scheme_ids: set[str]) -> list[str]:
    """Remove a research cohort and every exact/prefixed keyed derivative."""
    present = sorted(
        entry["id"] for entry in data["entries"]
        if entry.get("id") in scheme_ids
    )

    def prune(value):
        if isinstance(value, dict):
            for key in list(value):
                if key in scheme_ids or any(key.startswith(scheme_id + "|") for scheme_id in scheme_ids):
                    del value[key]
                else:
                    prune(value[key])
        elif isinstance(value, list):
            value[:] = [
                item for item in value
                if not (
                    (isinstance(item, dict) and item.get("id") in scheme_ids)
                    or (isinstance(item, str) and item in scheme_ids)
                )
            ]
            for item in value:
                prune(item)

    prune(data)
    count = len(data["entries"])
    data["finalSelection"]["currentCatalogueCount"] = count
    data["r11Research"]["counts"]["current"] = count
    for version in ("ensemble", "ensembleV2", "ensembleV3", "ensembleV4", "ensembleV5"):
        if "scoreCoverage" in data[version]:
            data[version]["scoreCoverage"] = count
    return present


def attach_four_code_collisions(data: dict, source: dict) -> dict[str, dict]:
    dictionary_paths = [
        SNOW_REPO / f"snow_pinyin.{name}.dict.yaml"
        for name in ("base", "ext", "tencent")
    ]
    common399 = {
        normalize_pinyin(source["pinyin"][index])
        for index, _ in source["base"]
    }
    corpus = read_word_corpus(
        dictionary_paths,
        max_cut=max(CUTS),
        allowed_pinyin=common399,
    )
    results = benchmark_catalogue(data["entries"], source["pinyin"], corpus)
    selected = select_collision_entries(data["entries"])
    scopes = sorted({zero_onset_scope(entry) for entry in selected})
    assert len(results) == len(selected)
    selected_ids = {entry["id"] for entry in selected}
    for entry in data["entries"]:
        if entry["id"] not in selected_ids:
            entry.pop("fourCodeCollision", None)
    for entry in selected:
        entry["fourCodeCollision"] = results[entry["id"]]
    data["fourCodeCollisionBenchmark"] = {
        "version": "Common399-standard-four-code-v1",
        "families": ["AUAU", "AAAU", "AAAA"],
        "cuts": list(CUTS),
        "schemeCount": len(results),
        "activeOnsetScope": scopes[0] if len(scopes) == 1 else "mixed-reviewed-cohort",
        "availableOnsetScopes": list(ONSET_SCOPES),
        "cohort": "all declared pure-Y 21x28 layouts plus the retained R11 21x26 controls",
        "ranking": "global Snow dictionary frequency order; unsupported readings retain rank but do not enter buckets",
        "winner": "highest frozen word weight; stable word/family tie break; polyphonic word wins if any code wins",
        "inputs": {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in dictionary_paths
        },
    }
    return results


def main() -> None:
    if not sys.flags.utf8_mode:
        environment = os.environ.copy()
        environment["PYTHONUTF8"] = "1"
        raise SystemExit(subprocess.call([sys.executable, *sys.argv], env=environment))
    args = arguments()
    schemes_by_id, source_hashes = load_research_schemes(args)
    html = HTML.read_text(encoding="utf-8")
    current, payload_start, payload_end = extract_payload(html)
    pruned_ids = prune_scheme_ids(current, set(SIX_CASE_IDS))
    # The public atlas intentionally prunes non-frontier schemes from the full
    # 492-entry replay catalogue.  Preserve that curated base and the two
    # previously integrated Snow Shenyun shape/tone entries.
    existing_ids = {entry["id"] for entry in current["entries"]}
    assert {
        "SNOW-SHENYUN-21X28-SHAPE",
        "SNOW-SHENYUN-21X28-TONE",
    } <= existing_ids
    assert {"R10-21X26-M38-07", "R10-21X26-M37-04"} <= existing_ids
    pending_ids = [scheme_id for scheme_id in INTEGRATED_IDS if scheme_id not in existing_ids]
    assert len(current["entries"]) + len(pending_ids) == 524, (
        len(current["entries"]), pending_ids
    )
    normalized_onset_ids = set(normalize_21x28_onset_metadata(current))
    before_snapshot = preservation_snapshot(current, existing_ids)
    with tempfile.TemporaryDirectory(prefix="shenyun-r11-", ignore_cleanup_errors=True) as temp_name:
        temp = Path(temp_name)
        with zipfile.ZipFile(REPLAY_ZIP) as archive:
            archive.extractall(temp)
        replay = temp / "R11_integrated_replay"
        if not (replay / "source.json").exists():
            source_html = (replay / "inputs" / "source484.html").read_text(encoding="utf-8")
            source_payload, _, _ = extract_payload(source_html)
            assert len(source_payload["entries"]) == 484
            (replay / "source.json").write_text(
                json.dumps(source_payload, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
        source = json.loads((replay / "source.json").read_text(encoding="utf-8"))
        sys.path.insert(0, str(replay))
        split = importlib.import_module("audit").split
        entries = [make_entry(source, split, schemes_by_id[scheme_id]) for scheme_id in pending_ids]
        if entries:
            (replay / "entries_to_score.json").write_text(
                json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            for entry in entries:
                target = replay / "exact" / (entry["id"] + ".json")
                if target.exists():
                    target.unlink()
            subprocess.run(
                ["node", "--max-old-space-size=1400", "eval_full.js", "0", str(len(entries))],
                cwd=replay,
                check=True,
            )
            exact = {
                entry["id"]: json.loads(
                    (replay / "exact" / (entry["id"] + ".json")).read_text(encoding="utf-8")
                )
                for entry in entries
            }
            updated = integrate(current, source, entries, exact, replay)
        else:
            updated = current
        normalized_onset_ids.update(normalize_21x28_onset_metadata(updated))
        updated_by_id = {entry["id"]: entry for entry in updated["entries"]}
        benchmark_ids = [*LEGACY_SHENYUN_IDS, *INTEGRATED_IDS]
        benchmark_entries = [updated_by_id[scheme_id] for scheme_id in benchmark_ids]
        integrate_macroxue(updated, benchmark_entries, replay)
        for result in updated["r11Research"].get("results", []):
            if result.get("id") not in benchmark_ids:
                continue
            values = updated["macroxue"]["values"][result["id"]]
            result["macroDaily"] = values["daily|native-punctuation"]["score"]
            result["macroPure"] = values["daily|hanzi-only"]["score"]
            result["macroDefault"] = values["default|native-punctuation"]["score"]

    after_snapshot = preservation_snapshot(updated, existing_ids)
    mutated_existing = sorted(
        scheme_id for scheme_id in existing_ids
        if before_snapshot[scheme_id] != after_snapshot[scheme_id]
    )
    assert not mutated_existing, mutated_existing
    collision_results = attach_four_code_collisions(updated, source)

    raw = json.dumps(updated, ensure_ascii=False, separators=(",", ":")).replace(
        "</script", "<\\/script"
    ).encode()
    encoded = base64.b64encode(gzip.compress(raw, compresslevel=6, mtime=0)).decode()
    output_html = html[:payload_start] + encoded + html[payload_end:]
    output_html = integrate_zero_onset_ui(
        integrate_collision_navigation(integrate_collision_ui(output_html))
    )
    HTML.write_text(output_html, encoding="utf-8")

    audit_rows = []
    audit_ids = [
        "SNOW-SHENYUN-21X28-SHAPE",
        "SNOW-SHENYUN-21X28-TONE",
        *INTEGRATED_IDS,
    ]
    updated_by_id = {entry["id"]: entry for entry in updated["entries"]}
    for scheme_id in audit_ids:
        entry = updated_by_id[scheme_id]
        scheme_id = entry["id"]
        tracks = updated["ckt"]["tracks"][scheme_id]
        final_map = entry["finalMap"]
        audit_rows.append({
            "id": scheme_id,
            "name": entry["name"],
            "tone": entry["tone"],
            "capacity": entry["capacity"],
            "codeListSha256": entry["mappingAudit"]["codeListSha256"],
            "M": entry["memoryAuditR2"]["M"],
            "D": entry["memoryAuditR2"]["ordinaryDisplacedCount"],
            "V": sum(final_map[final] != final.upper() for final in "aeiou"),
            "unique399": entry["memoryAuditR2"]["unique"],
            "collisionPairs": entry["memoryAuditR2"]["collisionPairs"],
            "S2": tracks["S2"],
            "C4Snow": tracks["C4-Snow"],
            "WXSnow12": tracks["WX-Snow-12"],
            "completion": updated["fairCKT"]["values"][scheme_id]["S2Completion"],
            "v6": updated["ensembleV6"]["values"][scheme_id],
            "load": updated["r11LoadSummaries"][scheme_id],
            "macroxue": updated["macroxue"]["values"][scheme_id],
            "fourCodeCollision": entry.get("fourCodeCollision"),
            "hybridVacancyProxy": entry.get("hybridVacancyProxy"),
        })
    MATERIALS.mkdir(parents=True, exist_ok=True)
    AUDIT_PATH.write_text(json.dumps({
        "version": "R11-post-research-extension-9",
        "baseCatalogueCount": BASE_CATALOGUE_COUNT,
        "currentCatalogueCount": len(updated["entries"]),
        "existingEntriesChanged": bool(mutated_existing),
        "removedThisRun": pruned_ids,
        "addedThisRun": pending_ids,
        "integratedFrontier": list(INTEGRATED_IDS),
        "sourceSha256": source_hashes,
        "zeroOnsetRoleSchemeIds": sorted(
            entry["id"] for entry in updated["entries"]
            if entry.get("capacity") == [21, 28]
        ),
        "zeroOnsetRolesChangedThisRun": sorted(normalized_onset_ids),
        "schemes": audit_rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    COLLISION_AUDIT_PATH.write_text(json.dumps({
        "version": updated["fourCodeCollisionBenchmark"]["version"],
        "catalogueCount": len(updated["entries"]),
        "collisionSchemeCount": len(collision_results),
        # This audit describes the migration from the 474-entry atlas even on
        # idempotent reruns, where every newly integrated row already exists.
        "preservedExistingEntries": BASE_CATALOGUE_COUNT,
        "mutatedExistingFields": mutated_existing,
        "addedSchemeIds": [
            *CONSTRAINED_IDS,
            *CONTINUATION_IDS,
            *CONTINUATION_2_IDS,
            *CONTINUATION_3_IDS,
            *CONTINUATION_4_IDS,
            *CONTINUATION_5_IDS,
        ],
        "method": updated["fourCodeCollisionBenchmark"],
        "schemes": [
            {
                "id": entry["id"],
                "capacity": entry["capacity"],
                "actual": entry["actual"],
                "fourCodeCollision": collision_results[entry["id"]],
            }
            for entry in select_collision_entries(updated["entries"])
        ],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Pruned", len(pruned_ids), "added", len(pending_ids), "and audited", len(audit_rows), "schemes; catalogue", len(updated["entries"]))
    print("HTML", HTML)
    print("AUDIT", AUDIT_PATH)
    print("COLLISION_AUDIT", COLLISION_AUDIT_PATH)


if __name__ == "__main__":
    main()
