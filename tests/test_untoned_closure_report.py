import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('closure_report', Path(__file__).resolve().parents[1] / 'tools/report_untoned_2126_closure.py')
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class FinalizationTests(unittest.TestCase):
    def state(self):
        return {'runState': 'finalized', 'bestId': 'seed', 'bestScore': 9.0,
                'seed': {'id': 'seed'}, 'completed': True,
                'records': {'a': {'id': 'seed', 'score': 9.0}},
                'centers': [{'id': 'seed', 'completed': True, 'keys': ['a'], 'nextId': None}]}

    def test_incomplete_center_is_rejected_despite_stale_final_status(self):
        saved = self.state()
        report.assert_finalized(saved)
        saved['centers'][0]['completed'] = False
        with self.assertRaisesRegex(AssertionError, 'Unfinished'):
            report.assert_finalized(saved)

    def test_running_snapshot_is_rejected_despite_best_id(self):
        saved = self.state()
        saved['runState'] = 'running'
        with self.assertRaisesRegex(AssertionError, 'not finalized'):
            report.assert_finalized(saved)

    def test_saturated_status_rejects_unscanned_successor(self):
        saved = self.state()
        saved['records']['b'] = {'id': 'better', 'score': 8.9}
        saved['bestId'], saved['bestScore'] = 'better', 8.9
        saved['centers'][0]['nextId'] = 'better'
        with self.assertRaisesRegex(AssertionError, 'unscanned'):
            report.assert_finalized(saved)


if __name__ == '__main__':
    unittest.main()
