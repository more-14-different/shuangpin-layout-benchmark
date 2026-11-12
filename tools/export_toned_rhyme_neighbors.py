"""Export neighborhood scores and independently auditable finalist codes."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", default="research/.cache/toned-rhyme-neighbors-job.json")
    parser.add_argument("--results", default="research/.cache/toned-rhyme-neighbors-results.json")
    parser.add_argument("--prefix", default="research/notes/2026-11-12-toned-rhyme-neighbors")
    args = parser.parse_args()
    job, scores = read(args.job), read(args.results)
    assert scores["completed"] == scores["total"] == len(job["candidates"])
    fixture = job["fixture"]
    source = read("research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json")
    seeds = read("research/config/ckt-v51-toned-2121-seeds.json")
    by_id = {c["id"]: c for c in job["candidates"]}
    ranked = sorted([dict(by_id[r["id"]], score=r["score"]) for r in scores["results"]], key=lambda c: c["score"])
    baselines = {c["anchor"]: c["score"] for c in ranked if c["kind"] == "baseline"}
    selected = []
    summaries = {}
    for kind in sorted({c["kind"] for c in ranked}):
        members = [c for c in ranked if c["kind"] == kind]
        summaries[kind] = dict(count=len(members), best=members[0]["score"],
                               improvingAnchor=sum(c["score"] < baselines[c["anchor"]] - 1e-9 for c in members),
                               beatingChampion=sum(c["score"] < source["layouts"][4]["rustScore"] - 1e-9 for c in members))
        selected.extend(members[:3])
    # Keep the strongest lower-memory / lower-D options as well as each
    # operator's leaders, so score-only sorting does not discard a useful tier.
    for max_d in [0, 1, 2]:
        for max_m in [21, 22, 23, 24]:
            eligible = [c for c in ranked if c["memory"] <= max_m and
                        sum(c["state"]["firstKeys"][i] != a["baselineKey"]
                            for i, a in enumerate(fixture["atoms"])
                            if len(a["initial"]) == 1 and a["initial"] != "_") <= max_d]
            if eligible:
                selected.append(eligible[0])
    if job.get("regrouping"):
        # Include each improving root-transfer route, even if a different
        # destination for er outranks it globally.
        for root in job.get("rootNames", []):
            eligible = [c for c in ranked if c["kind"] == "root-transfer" and
                        c["description"].startswith(root + " ->") and
                        c["score"] < baselines[c["anchor"]] - 1e-9]
            if eligible:
                selected.append(eligible[0])
    selected = list({c["id"]: c for c in selected}.values())
    exported = dict(version="toned-rhyme-neighbor-finalists-1", contract=copy.deepcopy(source["contract"]),
                    tokenKeys=source["tokenKeys"], layouts=[])
    exported["contract"].pop("rhymeInternalSplits", None)
    exported["contract"]["rhymeInternalSplitsPolicy"] = "per-layout memoryAudit.rhymeInternalSplits"
    exported["contract"]["secondCodeFactorizationSelectionStatus"] = "mars10-full-final-neighborhood-audit"
    exported["contract"]["memoryConvention"] = job["memoryConvention"]
    if job.get("regrouping"):
        exported["contract"]["secondCodeFactorizationSelectionStatus"] = "tone-independent-root-repartition"
    first_for_py = {p: i for i, a in enumerate(fixture["atoms"]) for p in a["pinyin"]}
    final_for_py = {p: i for i, a in enumerate(fixture["rhymeAtoms"]) for p in a["pinyin"]}
    region_for_tone = {t: i for i, r in enumerate(fixture["toneRegions"]) for t in r["tones"]}
    for c in selected:
        codes = {}
        for p, tones in enumerate(fixture["tonedCodes"]):
            for t, old in enumerate(tones, 1):
                if old:
                    codes[fixture["pinyin"][p] + str(t)] = (c["state"]["firstKeys"][first_for_py[p]] +
                        c["state"]["rhymeKeys"][region_for_tone[t]][final_for_py[p]])
        assert len(codes) == 1407 and "QZ" not in codes.values()
        ordinary_d = sum(c["state"]["firstKeys"][i] != a["baselineKey"]
                         for i, a in enumerate(fixture["atoms"]) if len(a["initial"]) == 1 and a["initial"] != "_")
        assert ordinary_d <= 2 and c["memory"] <= 24
        exported["layouts"].append(dict(id=c["id"], origin=c["anchor"], description=c["description"],
            factorization="tone-independent-root-repartition" if job.get("regrouping") else "mars10-final-neighborhood", rustScore=c["score"],
            memoryAudit=dict(memoryLower=c["memory"], memoryGuard=c.get("memoryGuard", c["memory"] + 2),
                             ordinaryD=ordinary_d, ordinaryF=0, rhymeInternalSplits=c["splits"], toneRegionMergeLower=c["merge"]),
            firstKeys=dict(zip([a["name"] for a in fixture["atoms"]], c["state"]["firstKeys"])),
            toneRegionFinalKeys={r["name"]: dict(zip([a["name"] for a in fixture["rhymeAtoms"]], c["state"]["rhymeKeys"][ri]))
                                 for ri, r in enumerate(fixture["toneRegions"])},
            bucketAudit=dict(qzSyllables1407=[t for t, code in codes.items() if code == "QZ"],
                             occupied1407=len(set(codes.values())),
                             occupiedCommon1237=len({codes[t] for t in seeds["auditTokenKeys"]})),
            tonedCodes=[codes[t] for t in source["tokenKeys"]]))
        if job.get("regrouping"):
            exported["layouts"][-1]["rhymeGroups"] = c["rhymeGroups"]
            exported["layouts"][-1]["memoryAudit"].update(
                sourceRhymeColumnMergeRules=c["sourceRhymeColumnMergeRules"],
                sourceRhymeColumnMergeLinks=c["sourceRhymeColumnMergeLinks"],
                headDeletionRules=1)
    report = dict(completed=scores["completed"], elapsedSeconds=scores["elapsedSeconds"],
                  rejected=job["rejected"], summary=summaries, memoryConvention=job["memoryConvention"],
                  sourceHashes={p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                                for p in [args.job, args.results, "tools/prepare_toned_rhyme_neighbors.py",
                                          "research/ckt-v4-core/src/bin/audit-toned-rhyme-neighbors.rs"]},
                  results=[{k: v for k, v in c.items() if k not in ("state", "rhymeGroups")} for c in ranked])
    if job.get("regrouping"):
        report["rootNames"] = job["rootNames"]
        report["sourceHashes"]["tools/search_toned_rhyme_regroup.py"] = hashlib.sha256(
            (ROOT / "tools/search_toned_rhyme_regroup.py").read_bytes()).hexdigest()
    for suffix, value in [("-results.json", report), ("-finalists.json", exported)]:
        (ROOT / (args.prefix + suffix)).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summaries, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
