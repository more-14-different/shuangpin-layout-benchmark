"""The supplemental polish must use genuinely new root groupings."""
import dataclasses
from pathlib import Path
import random
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from search_toned_2126_um40_wide import Context,canonical,propose
from extend_toned_2126_um40_wide_basins import grouping,select_novel


class NovelBasinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx=Context(ROOT.parent/'shuangpin-layout-benchmark');cls.s=canonical(cls.ctx.state(cls.ctx.source['A']))

    def test_grouping_ignores_key_placement_and_policy(self):
        s=self.s;maps=(s.maps[0],tuple(reversed(s.maps[1])),s.maps[2])
        self.assertEqual(grouping(s),grouping(dataclasses.replace(s,maps=maps,policy=('21','21','43'))))

    def test_selects_distinct_new_groupings_even_when_old_and_key_only_states_score_better(self):
        s=self.s;rng=random.Random(21);a=propose(self.ctx,s,rng,kind='root-swap');b=propose(self.ctx,a,rng,kind='root-cycle')
        key_only=propose(self.ctx,s,rng,kind='key-swap')
        a_policy=dataclasses.replace(a,policy=('21','12','24'))
        cache={s:{'score':8.1},key_only:{'score':8.2},a:{'score':8.4},a_policy:{'score':8.3},b:{'score':8.5}}
        picked=select_novel(cache,{grouping(s)},'score',2)
        self.assertEqual(picked,[a_policy,b]);self.assertEqual(len({grouping(x) for x in picked}),2)


if __name__=='__main__':unittest.main()
