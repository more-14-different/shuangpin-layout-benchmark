import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("neighbors", Path(__file__).resolve().parents[1] /
                                            "tools/prepare_toned_rhyme_neighbors.py")
neighbors = importlib.util.module_from_spec(spec)
spec.loader.exec_module(neighbors)


@unittest.skipUnless((neighbors.ROOT / "research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json").exists(),
                     "Run just ckt-v51-toned-mars10-rust-prepare to create the local corpus fixture")
class NeighborhoodContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.job = neighbors.build_job()

    def test_expanded_final_atoms_round_trip_both_anchors(self):
        fixture = self.job["fixture"]
        source = neighbors.read("research/config/ckt-v51-toned-2121-mars10-qz-empty-p3-finalist.json")
        anchors = {x["id"]: x for x in source["layouts"]}
        self.assertEqual(fixture["toneKeysByTone"], "IVUAO")
        for candidate in self.job["candidates"]:
            if candidate["kind"] != "baseline":
                continue
            codes = {}
            for r, region in enumerate(fixture["toneRegions"]):
                for f, final in enumerate(fixture["rhymeAtoms"]):
                    for py in final["pinyin"]:
                        a = next(i for i, atom in enumerate(fixture["atoms"]) if py in atom["pinyin"])
                        for tone in region["tones"]:
                            if fixture["tonedCodes"][py][tone - 1]:
                                codes[fixture["pinyin"][py] + str(tone)] = (
                                    candidate["state"]["firstKeys"][a] + candidate["state"]["rhymeKeys"][r][f])
            self.assertEqual(len(codes), 1407)
            self.assertEqual([codes[t] for t in source["tokenKeys"]], anchors[candidate["anchor"]]["tonedCodes"])
            self.assertNotIn("QZ", codes.values())

    def test_split_budget_is_not_silently_free(self):
        internal = [x for x in self.job["candidates"] if x["kind"] == "internal-final-move"]
        self.assertGreater(len(internal), 0)
        self.assertTrue(all(x["splits"] == 1 and x["memory"] == 24 for x in internal))
        self.assertTrue(all(x["memory"] <= 24 for x in self.job["candidates"]))
        self.assertGreater(self.job["rejected"]["QZ"], 0)
        self.assertGreater(self.job["rejected"]["memory"], 0)

    def test_all_candidate_costs_and_key_domains(self):
        fixture, parents = self.job["fixture"], self.job["parents"]
        for c in self.job["candidates"]:
            first_delta = sum(a["moveMemoryDelta"] for i, a in enumerate(fixture["atoms"])
                              if c["state"]["firstKeys"][i] != a["baselineKey"])
            splits = 0
            for r, row in enumerate(c["state"]["rhymeKeys"]):
                self.assertTrue(set(row) <= set(fixture["toneRegions"][r]["keys"]))
                splits += sum(len({row[i] for i, parent in enumerate(parents) if parent == g}) - 1
                              for g in range(10))
            self.assertEqual(splits, c["splits"])
            self.assertEqual(fixture["baselineMemoryLower"] + first_delta + c["merge"] - 9 + splits, c["memory"])


if __name__ == "__main__":
    unittest.main()
