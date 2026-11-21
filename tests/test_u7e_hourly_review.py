import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from schedule_u7e_hourly_review import classify_receipt,prompt_for,should_dispatch


class ReviewTimerTests(unittest.TestCase):
    def test_queued_is_distinct_from_model_ack(self):
        result=classify_receipt(0,'Queued message uuid for thread thread-id.','Warning: resume failed')
        self.assertTrue(result['queued'])
        self.assertTrue(result['resumeWarning'])
        self.assertFalse(classify_receipt(1,'','connection refused')['queued'])

    def test_no_backlog_while_actual_review_unacknowledged(self):
        self.assertTrue(should_dispatch(7200,3600,False,None))
        self.assertFalse(should_dispatch(7200,3600,False,3600))
        self.assertTrue(should_dispatch(7200,3600,True,3600))
        self.assertFalse(should_dispatch(3500,3600,False,None))

    def test_prompt_preserves_boundaries_and_demands_real_analysis(self):
        prompt=prompt_for(Path('campaign'),Path('ack.json'))
        for value in ['亲自比较','D2/V5/M41','不得自动发布HTML','ack.json','不另开任务']:
            self.assertIn(value,prompt)


if __name__=='__main__':
    unittest.main()
