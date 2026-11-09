#!/usr/bin/env python3
"""Build comparable rows from k6 summaries and service counters; no timing claims inferred."""
import json
from pathlib import Path

PHASES = ('normal', 'spike', 'recovery')


def rows_for_run(directory):
    directory = Path(directory)
    run = json.loads((directory / 'run.json').read_text())
    if run.get('k6ExitCode') != 0:
        raise ValueError(f'{directory}: k6 did not pass its validation checks')
    summary = json.loads((directory / 'k6-summary.json').read_text())['metrics']
    shopper = json.loads((directory / 'shopper-metrics.json').read_text())
    catalog = json.loads((directory / 'catalog-metrics.json').read_text())
    rows = []
    for phase in PHASES:
        logical = summary[f'logical_requests{{phase:{phase}}}']['values']['count']
        success = summary[f'logical_success{{phase:{phase}}}']['values']['rate']
        group = f'{run["policy"]}/{phase}'
        counters = shopper['groups'].get(group, {})
        backend = catalog['groups'].get(group, {})
        # Refuse incomplete/incompatible summaries instead of filling missing data with zero.
        if logical != counters.get('logicalRequests', 0):
            raise ValueError(f'{directory}: logical request count mismatch in {phase}')
        if counters.get('successes', 0) + counters.get('failures', 0) != logical:
            raise ValueError(f'{directory}: unfinished requests in {phase}')
        if logical and abs(counters.get('successes', 0) / logical - success) > 1e-9:
            raise ValueError(f'{directory}: success count mismatch in {phase}')
        rows.append({
            'trial': run['trial'], 'policy': run['policy'], 'phase': phase,
            'logicalRequests': logical, 'successRate': success,
            'p95Ms': summary[f'logical_latency{{phase:{phase}}}']['values']['p(95)'],
            'attempts': counters.get('attempts', 0),
            'amplification': counters.get('attempts', 0) / logical if logical else 0,
            'backendAttempts': backend.get('attempts', 0), 'throttles': backend.get('throttles', 0),
        })
    return rows


def write_comparison(root):
    root = Path(root)
    rows = [row for directory in sorted(root.glob('trial-*/**/run.json')) for row in rows_for_run(directory.parent)]
    if not rows:
        raise ValueError('No completed runs found')
    (root / 'comparison.json').write_text(json.dumps(rows, indent=2) + '\n')
    lines = ['# Local Black Friday comparison', '',
             'Observed measurements, not a guaranteed policy ranking. Phase labels follow the original logical request, including its retries across phase boundaries.', '',
             '| Trial | Policy | Phase | Requests | Success | p95 ms | Attempts/request | Backend 429s |',
             '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |']
    for row in rows:
        lines.append(f'| {row["trial"]} | {row["policy"]} | {row["phase"]} | {row["logicalRequests"]:.0f} | '
                     f'{row["successRate"]:.1%} | {row["p95Ms"]:.1f} | {row["amplification"]:.2f} | {row["throttles"]} |')
    (root / 'comparison.md').write_text('\n'.join(lines) + '\n')
    return rows


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    write_comparison(parser.parse_args().directory)
