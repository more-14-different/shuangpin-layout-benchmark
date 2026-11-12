"""Build a deterministic QZ-empty, D<=2, M_lower<=24 neighborhood audit.

Internal splits conservatively cost one extra rule per additional key within
each original Mars group and tone region. Original merge cost is retained;
splitting does not earn a fictitious merge-cost refund.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def build_job():
    original = read("research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json")
    layouts = read("research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json")
    inventory = read("research/config/ckt-v51-toned-2121-seeds.json")
    finals = {x["pinyin"]: x["fullFinal"] for x in inventory["decomposition"]}
    fixture = copy.deepcopy(original)
    fixture["rhymeAtoms"] = []
    parents = []
    for gi, group in enumerate(original["rhymeAtoms"]):
        members = {}
        for py in group["pinyin"]:
            members.setdefault(finals[original["pinyin"][py]], []).append(py)
        for final, pys in sorted(members.items()):
            fixture["rhymeAtoms"].append(dict(name=final, pinyin=pys,
                                             baselineKeys=group["baselineKeys"]))
            parents.append(gi)
    candidates, rejected, seen = [], {}, set()
    first_for_py = {p: i for i, a in enumerate(fixture["atoms"]) for p in a["pinyin"]}
    final_for_py = {p: i for i, a in enumerate(fixture["rhymeAtoms"]) for p in a["pinyin"]}
    region_for_tone = {t: i for i, r in enumerate(fixture["toneRegions"]) for t in r["tones"]}
    legal = [(first_for_py[p], final_for_py[p], region_for_tone[t + 1])
             for p, codes in enumerate(fixture["tonedCodes"])
             for t, code in enumerate(codes) if code]
    assert len(legal) == 1407

    def add(layout, kind, description, state, group_keys):
        signature = json.dumps(state, sort_keys=True)
        if signature in seen:
            return
        seen.add(signature)
        splits = sum(len({keys[i] for i, parent in enumerate(parents) if parent == g}) - 1
                     for keys in state["rhymeKeys"] for g in range(10))
        merge = sum(10 - len(set(keys)) for keys in group_keys)
        memory = layout["memoryAudit"]["memoryLower"] + merge - 9 + splits
        reason = None
        if memory > 24:
            reason = "memory"
        elif any(state["firstKeys"][a] == "Q" and state["rhymeKeys"][r][f] == "Z"
                 for a, f, r in legal):
            reason = "QZ"
        if reason:
            rejected[reason] = rejected.get(reason, 0) + 1
            return
        candidates.append(dict(id=f"N{len(candidates):04d}", anchor=layout["id"],
                               kind=kind, description=description, state=state,
                               memory=memory, splits=splits, merge=merge))

    # Full external one-step neighborhood of the strongest M24 anchor;
    # all single-final splits from the M23 anchor (one rule of spare memory).
    for index in [4, 3]:
        layout = layouts["layouts"][index]
        group_keys = [[layout["toneRegionRhymeKeys"][r["name"]][g["name"]]
                       for g in original["rhymeAtoms"]] for r in original["toneRegions"]]
        state = dict(firstKeys=[layout["firstKeys"][a["name"]] for a in fixture["atoms"]],
                     rhymeKeys=[[keys[g] for g in parents] for keys in group_keys])
        add(layout, "baseline", "unchanged", state, group_keys)
        for r, region in enumerate(fixture["toneRegions"]):
            if index == 4:
                for a in range(10):
                    for key in region["keys"]:
                        if key == group_keys[r][a]:
                            continue
                        keys = copy.deepcopy(group_keys)
                        keys[r][a] = key
                        proposal = copy.deepcopy(state)
                        proposal["rhymeKeys"] = [[k[g] for g in parents] for k in keys]
                        add(layout, "external-move", f'{region["name"]}:{original["rhymeAtoms"][a]["name"]}->{key}', proposal, keys)
                    for b in range(a + 1, 10):
                        keys = copy.deepcopy(group_keys)
                        keys[r][a], keys[r][b] = keys[r][b], keys[r][a]
                        proposal = copy.deepcopy(state)
                        proposal["rhymeKeys"] = [[k[g] for g in parents] for k in keys]
                        add(layout, "external-swap", f'{region["name"]}:{original["rhymeAtoms"][a]["name"]}<->{original["rhymeAtoms"][b]["name"]}', proposal, keys)
            else:
                for f, final in enumerate(fixture["rhymeAtoms"]):
                    if parents.count(parents[f]) == 1:
                        continue
                    for key in region["keys"]:
                        if key == state["rhymeKeys"][r][f]:
                            continue
                        proposal = copy.deepcopy(state)
                        proposal["rhymeKeys"][r][f] = key
                        add(layout, "internal-final-move", f'{region["name"]}:{final["name"]}->{key}', proposal, group_keys)
    job = dict(fixture=fixture, parents=parents, candidates=candidates, rejected=rejected,
               memoryConvention=__doc__, sourceFixture=original["layoutId"])
    return job


def main():
    job = build_job()
    candidates = job["candidates"]
    output = ROOT / "research/.cache/toned-rhyme-neighbors-job.json"
    output.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(candidates=len(candidates), rejected=job["rejected"],
                         kinds={k: sum(c["kind"] == k for c in candidates)
                                for k in sorted({c["kind"] for c in candidates})})))


if __name__ == "__main__":
    main()
