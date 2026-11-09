#!/usr/bin/env python3
"""Own fresh loopback services per policy, enforce k6 checks, retain evidence on failure."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import ipaddress
from urllib.parse import urlparse
from compare import write_comparison

ROOT = Path(__file__).resolve().parents[1]
POLICIES = ('fixed', 'jitter', 'retry-after')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Unexpected redirect')


OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def local_origin(value):
    parsed = urlparse(value)
    try:
        valid = ipaddress.ip_address(parsed.hostname).is_loopback
        port = parsed.port
    except (ValueError, TypeError):
        valid, port = False, None
    if (not valid or parsed.scheme != 'http' or parsed.path not in ('', '/') or
            parsed.query or parsed.fragment or parsed.username or parsed.password or port is None):
        raise argparse.ArgumentTypeError('Use an HTTP literal loopback origin with a port, e.g. http://127.0.0.1:5222')
    return value


def get_json(url):
    # The services never redirect health or metrics, so redirects indicate a wrong target.
    request = urllib.request.Request(url)
    with OPENER.open(request, timeout=2) as response:
        if response.url != url:
            raise RuntimeError('Unexpected redirect')
        return json.load(response)


def require_free_port(port):
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(('127.0.0.1', port))


def wait_ready(process, port):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError(f'Service exited with {process.returncode}; inspect its log')
        try:
            if get_json(f'http://127.0.0.1:{port}/health')['status'] == 'ok':
                return
        except (OSError, ValueError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f'Service on port {port} did not become ready')


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def capture(command):
    return subprocess.check_output(command, cwd=ROOT, text=True, stderr=subprocess.STDOUT).strip()


def source_fingerprint():
    digest = hashlib.sha256()
    for path in sorted(ROOT.rglob('*')):
        relative = path.relative_to(ROOT)
        if (path.is_file() and not any(part in ('.deps', 'results', 'bin', 'obj', '__pycache__', '.aspire') for part in relative.parts)
                and relative.parts[0] != 'docs'):
            digest.update(str(relative).encode())
            digest.update(b'\0')
            digest.update(path.read_bytes())
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--trials', type=int, default=3)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--no-build', action='store_true')
    parser.add_argument('--header-format', choices=('delta', 'date'), default='delta')
    parser.add_argument('--upstream', type=local_origin, help='Optional locally controlled upstream eShop catalog')
    args = parser.parse_args()
    if not 1 <= args.trials <= 20:
        parser.error('--trials must be between 1 and 20')
    dotnet, k6 = shutil.which('dotnet'), shutil.which('k6')
    if not dotnet or not k6:
        parser.error('Install .NET 10 SDK and k6, then add them to PATH')
    output = (args.output or ROOT / 'results' / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')).resolve()
    output.mkdir(parents=True, exist_ok=False)
    env = os.environ.copy()
    # Standalone comparisons export locally to JSON. Do not inherit remote telemetry destinations.
    for key in list(env):
        if key.startswith(('OTEL_', 'ASPNETCORE_', 'DOTNET_', 'Catalog__')):
            del env[key]
    for key in ('DOTNET_ROOT', 'DOTNET_CLI_HOME'):
        if key in os.environ:
            env[key] = os.environ[key]
    env.update(DOTNET_CLI_TELEMETRY_OPTOUT='1', DOTNET_NOLOGO='1', DOTNET_ENVIRONMENT='Development',
               K6_NO_USAGE_REPORT='true', HTTP_PROXY='', HTTPS_PROXY='', ALL_PROXY='', NO_PROXY='127.0.0.1,::1',
               Catalog__RetryAfterFormat=args.header_format)
    if args.upstream:
        env['Catalog__UpstreamBaseUrl'] = args.upstream
    manifest = {
        'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'gitCommit': capture(['git', 'rev-parse', 'HEAD']), 'gitStatus': capture(['git', 'status', '--porcelain']),
        'sourceSha256': source_fingerprint(),
        'dotnet': capture([dotnet, '--version']), 'k6': capture([k6, 'version']), 'os': platform.platform(),
        'seed': args.seed, 'trials': args.trials, 'headerFormat': args.header_format,
        'mode': 'upstream-local' if args.upstream else 'catalog-sample', 'upstream': args.upstream,
        'phases': {'normal': {'rps': 5, 'seconds': 10}, 'spike': {'rps': 60, 'seconds': 15}, 'recovery': {'rps': 5, 'seconds': 20}},
        'capacityPerSecond': 20, 'maxAttempts': 4, 'totalBudgetSeconds': 5,
        'status': 'running',
    }
    manifest_path = output / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    try:
        if not args.no_build:
            for name in ('Catalog', 'Shopper'):
                subprocess.run([dotnet, 'build', f'src/Lab.{name}', '-c', 'Release', '-p:RestoreLockedMode=true'], cwd=ROOT, env=env, check=True)
        for trial in range(1, args.trials + 1):
            # Rotate order to reduce systematic warming / background-load bias.
            order = POLICIES[(trial - 1) % 3:] + POLICIES[:(trial - 1) % 3]
            for policy in order:
                directory = output / f'trial-{trial}' / policy
                directory.mkdir(parents=True)
                print(f'Trial {trial}: {policy}; output {directory}', flush=True)
                processes, logs = [], []
                try:
                    for port in (5100, 5101):
                        require_free_port(port)
                    for name, port in (('Catalog', 5101), ('Shopper', 5100)):
                        log = (directory / f'{name.lower()}.jsonl').open('w')
                        logs.append(log)
                        service_env = dict(env, ASPNETCORE_URLS=f'http://127.0.0.1:{port}', Catalog__BaseUrl='http://127.0.0.1:5101')
                        process = subprocess.Popen([dotnet, str(ROOT / f'src/Lab.{name}/bin/Release/net10.0/Lab.{name}.dll')],
                                                   cwd=ROOT, env=service_env, stdout=log, stderr=subprocess.STDOUT)
                        processes.append(process)
                        wait_ready(process, port)
                    run_env = dict(env, POLICY=policy, SEED=str(args.seed + trial - 1), SHOPPER_PORT='5100', SUMMARY_PATH=str(directory / 'k6-summary.json'))
                    with (directory / 'k6.log').open('w') as log:
                        result = subprocess.run([k6, 'run', '--quiet', str(ROOT / 'load/black-friday.js')],
                                                cwd=ROOT, env=run_env, stdout=log, stderr=subprocess.STDOUT, timeout=90)
                    for name, port in (('shopper', 5100), ('catalog', 5101)):
                        (directory / f'{name}-metrics.json').write_text(json.dumps(get_json(f'http://127.0.0.1:{port}/lab/metrics'), indent=2) + '\n')
                    (directory / 'run.json').write_text(json.dumps({'trial': trial, 'policy': policy, 'seed': args.seed + trial - 1, 'k6ExitCode': result.returncode}, indent=2) + '\n')
                    if result.returncode != 0:
                        raise RuntimeError(f'k6 failed checks ({result.returncode}); inspect {directory / "k6.log"}')
                finally:
                    for process in reversed(processes):
                        stop(process)
                    for log in logs:
                        log.close()
        write_comparison(output)
        manifest['status'] = 'passed'
        print(f'Comparison: {output / "comparison.md"}')
    except BaseException as error:
        manifest['status'] = 'failed'
        manifest['error'] = str(error)
        raise
    finally:
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
