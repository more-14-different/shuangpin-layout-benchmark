"""Refine the best split with whole-group moves and natural final bundles."""
import copy
import json
from itertools import combinations
from prepare_toned_rhyme_neighbors import ROOT, read


def main():
    job = read("research/.cache/toned-rhyme-neighbors-job.json")
    results = read("research/.cache/toned-rhyme-neighbors-results.json")
    assert results["completed"] == results["total"]
    by_id = {c["id"]: c for c in job["candidates"]}
    best = by_id[min(results["results"], key=lambda c: c["score"])["id"]]
    fixture, parents = job["fixture"], job["parents"]
    original = read("research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json")
    source = read("research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json")
    anchor = next(c for c in source["layouts"] if c["id"] == best["anchor"])
    base = next(c for c in job["candidates"] if c["anchor"] == best["anchor"] and c["kind"] == "baseline")
    core_keys = [[anchor["toneRegionRhymeKeys"][r["name"]][g["name"]]
                  for g in original["rhymeAtoms"]] for r in fixture["toneRegions"]]
    candidates, rejected, seen = [], {}, set()
    first_for_py = {p: i for i, a in enumerate(fixture["atoms"]) for p in a["pinyin"]}
    final_for_py = {p: i for i, a in enumerate(fixture["rhymeAtoms"]) for p in a["pinyin"]}
    region_for_tone = {t: i for i, r in enumerate(fixture["toneRegions"]) for t in r["tones"]}
    legal = [(first_for_py[p], final_for_py[p], region_for_tone[t + 1])
             for p, codes in enumerate(fixture["tonedCodes"])
             for t, code in enumerate(codes) if code]

    def add(kind, description, state, keys, origin=None):
        signature = json.dumps(state, sort_keys=True)
        if signature in seen:
            return
        seen.add(signature)
        splits = sum(len({row[i] for i, parent in enumerate(parents) if parent == g}) - 1
                     for row in state["rhymeKeys"] for g in range(10))
        merge = sum(10 - len(set(row)) for row in keys)
        first_delta = sum(a["moveMemoryDelta"] for i, a in enumerate(fixture["atoms"])
                          if state["firstKeys"][i] != a["baselineKey"])
        memory = original["baselineMemoryLower"] + first_delta + merge - 9 + splits
        reason = "memory" if memory > 24 else (
            "QZ" if any(state["firstKeys"][a] == "Q" and state["rhymeKeys"][r][f] == "Z"
                        for a, f, r in legal) else None)
        if reason:
            rejected[reason] = rejected.get(reason, 0) + 1
            return
        candidates.append(dict(id=f"R{len(candidates):04d}", anchor=origin or anchor["id"], kind=kind,
                               description=description, state=state, memory=memory,
                               splits=splits, merge=merge))

    add("baseline", "original M23 anchor", base["state"], core_keys)
    add("split-winner", best["description"], best["state"], core_keys)
    # Move the non-exception members of each original group; keep the split
    # final in place. This explores co-adaptation without spending a second M.
    for r, region in enumerate(fixture["toneRegions"]):
        for a in range(10):
            alternatives = []
            for key in region["keys"]:
                keys = copy.deepcopy(core_keys)
                keys[r][a] = key
                alternatives.append((f'{original["rhymeAtoms"][a]["name"]}->{key}', keys))
            for b in range(a + 1, 10):
                keys = copy.deepcopy(core_keys)
                keys[r][a], keys[r][b] = keys[r][b], keys[r][a]
                alternatives.append((f'{original["rhymeAtoms"][a]["name"]}<->{original["rhymeAtoms"][b]["name"]}', keys))
            for label, keys in alternatives:
                state = copy.deepcopy(best["state"])
                for f, g in enumerate(parents):
                    if state["rhymeKeys"][r][f] == core_keys[r][g]:
                        state["rhymeKeys"][r][f] = keys[r][g]
                add("split-plus-external", best["description"] + "; " + region["name"] + ":" + label, state, keys)
    # Linguistically coherent subsets missed by single-full-final moves.
    bundles = ["a ia ua", "ou iou", "en uen", "in vn", "e ie ve", "ei uei",
               "eng ing ueng", "ai uai", "an uan", "ian van", "ang uang",
               "o io uo", "ong iong"]
    final_index = {a["name"]: i for i, a in enumerate(fixture["rhymeAtoms"])}
    for bundle in bundles:
        members = [final_index[f] for f in bundle.split() if f in final_index]
        assert len({parents[f] for f in members}) == 1
        for r, region in enumerate(fixture["toneRegions"]):
            for key in region["keys"]:
                state = copy.deepcopy(base["state"])
                for f in members:
                    state["rhymeKeys"][r][f] = key
                add("internal-bundle", f'{region["name"]}:{bundle}->{key}', state, core_keys)
    # Transfer the best exception onto the M24 champion, funding it by
    # returning zero-A to R (so D remains 2 and the first-side cost drops by 1).
    champion = source["layouts"][4]
    keys = [[champion["toneRegionRhymeKeys"][r["name"]][g["name"]]
             for g in original["rhymeAtoms"]] for r in fixture["toneRegions"]]
    state = dict(firstKeys=[champion["firstKeys"][a["name"]] for a in fixture["atoms"]],
                 rhymeKeys=[[row[g] for g in parents] for row in keys])
    state["firstKeys"][next(i for i, a in enumerate(fixture["atoms"]) if a["name"] == "zero-A")] = "R"
    for r, row in enumerate(best["state"]["rhymeKeys"]):
        for f, key in enumerate(row):
            if key != base["state"]["rhymeKeys"][r][f]:
                state["rhymeKeys"][r][f] = key
    add("budget-transfer", "M24 champion: zero-A->R; " + best["description"], state, keys)
    # Spend two available rules on the D1/M22 anchor instead of a second
    # ordinary-initial displacement. Use the ten strongest single splits
    # from round one; include unary controls and all non-conflicting pairs.
    low = source["layouts"][2]
    low_keys = [[low["toneRegionRhymeKeys"][r["name"]][g["name"]]
                 for g in original["rhymeAtoms"]] for r in fixture["toneRegions"]]
    low_state = dict(firstKeys=[low["firstKeys"][a["name"]] for a in fixture["atoms"]],
                     rhymeKeys=[[row[g] for g in parents] for row in low_keys])
    add("baseline", "D1 M22 anchor", low_state, low_keys, low["id"])
    promising = [by_id[c["id"]] for c in sorted(results["results"], key=lambda c: c["score"])
                 if by_id[c["id"]]["kind"] == "internal-final-move"][:10]
    for moves in [(c,) for c in promising] + list(combinations(promising, 2)):
        state = copy.deepcopy(low_state)
        changes = {}
        conflict = False
        for move in moves:
            for r, row in enumerate(move["state"]["rhymeKeys"]):
                for f, key in enumerate(row):
                    if key != base["state"]["rhymeKeys"][r][f]:
                        if (r, f) in changes and changes[r, f] != key:
                            conflict = True
                        changes[r, f] = key
        if conflict:
            continue
        for (r, f), key in changes.items():
            state["rhymeKeys"][r][f] = key
        add("D1-two-rule-budget", "; ".join(m["description"] for m in moves), state, low_keys, low["id"])
    job.update(candidates=candidates, rejected=rejected, seedWinner=best["id"])
    (ROOT / "research/.cache/toned-rhyme-refine-job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(candidates=len(candidates), rejected=rejected, winner=best["description"])))


if __name__ == "__main__":
    main()
