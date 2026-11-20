import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('u7e_gpu',ROOT/'tools/run_u7e_gpu_anneal.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FixedU7ETest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config=json.loads((ROOT/'research/config/u7e-fixed-gpu.json').read_text(encoding='utf8'))

    def test_seed_and_final_only_mutations_preserve_contract(self):
        cfg=self.config;seed=cfg['seedFinalKeys'];initial=list(cfg['initialKeys'])
        self.assertTrue(module.legal(seed,cfg))
        rng=module.Rng(71829);accepted=0
        for i in range(2000):
            proposed=module.mutate(seed,rng,i%2==0,cfg['allowedKeys'])
            if module.legal(proposed,cfg):
                accepted+=1
                self.assertEqual(len(set(proposed)),21)
                self.assertEqual(module.memory(proposed,cfg),41)
        self.assertGreater(accepted,100)
        self.assertEqual(cfg['initialKeys'],initial)

    def test_illegal_key_domain_and_missing_key_are_rejected(self):
        cfg=self.config;seed=cfg['seedFinalKeys'];bad=list(seed);bad[0]=0
        self.assertFalse(module.legal(bad,cfg))
        missing=list(seed)
        key=missing[0]
        missing=[missing[1] if k==key else k for k in missing]
        self.assertFalse(module.legal(missing,cfg))

    def test_seed_costs_include_tripled_reference(self):
        cfg=self.config
        score=module.scores(cfg['seedModes'],cfg['referenceModes'])
        for actual,expected in zip(score,cfg['expectedSeedScores']):
            self.assertAlmostEqual(actual,expected,places=9)

    def test_auxiliary_semantics_round_trip(self):
        semantics=self.config['auxiliarySemantics']
        tone=semantics['toneKeysByTone'];shape=semantics['shapeKeysByMeaning']
        self.assertEqual(tone,'IVUAO');self.assertEqual(shape,'AVUIO')
        digits=''.join('12340'[tone.index(key)] for key in shape)
        self.assertEqual(digits,'42310')
        self.assertEqual(''.join(shape[digits.index(d)] for d in '12340'),tone)

    def test_qz_bucket_and_resume_parameter_changes_are_rejected(self):
        cfg=self.config;seed=cfg['seedFinalKeys'];bad=list(seed)
        f=next(f for h,f in cfg['commonPairs'] if cfg['initialKeys'][h]==16)
        a,b=bad[f],25
        bad=[b if k==a else a if k==b else k for k in bad]
        self.assertFalse(module.legal(bad,cfg))
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.sqlite';campaign=module.Campaign(path,cfg);campaign.close()
            with self.assertRaises(AssertionError):module.Campaign(path,{**cfg,'targetMemory':42})

    def test_resume_preserves_rng_chains_and_batch_transaction(self):
        cfg=self.config
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.sqlite'
            campaign=module.Campaign(path,cfg)
            chain=campaign.chains[0]
            candidate=campaign.proposal(chain)
            campaign.commit([(chain,candidate,{'scores':[9.6,9.6,9.6]})])
            expected=json.loads(json.dumps(campaign.chains));rounds=campaign.rounds
            campaign.close()
            resumed=module.Campaign(path,cfg)
            self.assertEqual(resumed.chains,expected)
            self.assertEqual(resumed.rounds,rounds)
            self.assertEqual(resumed.proposal(resumed.chains[0]),campaign.proposal(expected[0]))
            resumed.close()

if __name__=='__main__':unittest.main()
