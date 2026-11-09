#!/usr/bin/env python3
"""Fetch one verified upstream commit into an ignored checkout; never overwrite local work."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def git(*args, cwd=None):
    return subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()


def main():
    lock = json.loads((ROOT / 'upstream.lock.json').read_text())
    checkout = ROOT / '.deps' / 'eshop'
    if checkout.exists():
        if not (checkout / '.git').is_dir():
            raise SystemExit(f'Refusing to modify non-checkout directory: {checkout}')
        if git('remote', 'get-url', 'origin', cwd=checkout) != lock['repository']:
            raise SystemExit('Existing checkout origin does not match the pinned upstream')
        if git('status', '--porcelain', '--untracked-files=all', cwd=checkout):
            raise SystemExit('Existing checkout has local changes; preserve them before continuing')
        if git('rev-parse', 'HEAD', cwd=checkout) != lock['commit']:
            raise SystemExit('Existing checkout has a different revision; use a new directory or update it manually')
    else:
        checkout.mkdir(parents=True)
        git('init', cwd=checkout)
        git('remote', 'add', 'origin', lock['repository'], cwd=checkout)
        git('fetch', '--depth=1', 'origin', lock['commit'], cwd=checkout)
        git('checkout', '--detach', lock['commit'], cwd=checkout)
    if git('rev-parse', 'HEAD', cwd=checkout) != lock['commit']:
        raise SystemExit('Upstream commit verification failed')
    print(f'Verified {lock["commit"]}: {checkout}')


if __name__ == '__main__':
    main()
