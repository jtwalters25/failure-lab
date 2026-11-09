import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from compare import rows_for_run, write_comparison
spec = importlib.util.spec_from_file_location('runner', SCRIPTS / 'run-comparison.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class HarnessTests(unittest.TestCase):
    def test_remote_and_ambiguous_origins_rejected(self):
        for value in ['http://example.com:80', 'http://localhost:5100', 'http://0.0.0.0:80',
                      'http://127.0.0.1:80/path', 'http://u:p@127.0.0.1:80', 'https://127.0.0.1:80']:
            with self.subTest(value=value), self.assertRaises(Exception):
                runner.local_origin(value)
        self.assertEqual('http://127.0.0.1:5222', runner.local_origin('http://127.0.0.1:5222'))

    def test_comparison_measures_amplification_and_rejects_unfinished_work(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            run = root / 'trial-1' / 'fixed'
            run.mkdir(parents=True)
            (run / 'run.json').write_text(json.dumps({'trial': 1, 'policy': 'fixed', 'k6ExitCode': 0}))
            metrics, groups = {}, {}
            for phase in ('normal', 'spike', 'recovery'):
                metrics[f'logical_requests{{phase:{phase}}}'] = {'values': {'count': 10}}
                metrics[f'logical_success{{phase:{phase}}}'] = {'values': {'rate': .8}}
                metrics[f'logical_latency{{phase:{phase}}}'] = {'values': {'p(95)': 123}}
                groups[f'fixed/{phase}'] = {'logicalRequests': 10, 'successes': 8, 'failures': 2, 'attempts': 25, 'throttles': 17}
            (run / 'k6-summary.json').write_text(json.dumps({'metrics': metrics}))
            for name in ('shopper', 'catalog'):
                (run / f'{name}-metrics.json').write_text(json.dumps({'groups': groups}))
            rows = write_comparison(root)
            self.assertEqual(3, len(rows))
            self.assertEqual(2.5, rows[0]['amplification'])
            self.assertEqual(.8, rows[0]['successRate'])
            groups['fixed/recovery']['failures'] = 1
            (run / 'shopper-metrics.json').write_text(json.dumps({'groups': groups}))
            with self.assertRaisesRegex(ValueError, 'unfinished'):
                rows_for_run(run)


if __name__ == '__main__':
    unittest.main()
