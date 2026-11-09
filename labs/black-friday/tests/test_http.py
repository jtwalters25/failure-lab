"""Real-process HTTP and OTLP integration checks. Set LAB_HTTP_TESTS=1 after building."""
from contextlib import contextmanager
import datetime
import email.utils
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def request(port, path, method='GET'):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method,
                                 headers={'X-Lab-Phase': 'normal', 'X-Lab-Policy': 'fixed', 'X-Lab-Request-Id': 'test-42'})
    try:
        response = OPENER.open(req, timeout=7)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


@contextmanager
def services(**overrides):
    env = {k: v for k, v in os.environ.items() if not k.startswith(('OTEL_', 'ASPNETCORE_', 'Catalog__'))}
    env.update(Catalog__BaseUrl='http://127.0.0.1:5211', OTEL_EXPORTER_OTLP_ENDPOINT='http://127.0.0.1:5318',
               OTEL_EXPORTER_OTLP_PROTOCOL='http/protobuf', OTEL_METRIC_EXPORT_INTERVAL='500',
               OTEL_BSP_SCHEDULE_DELAY='500', DOTNET_CLI_TELEMETRY_OPTOUT='1')
    env.update(overrides)
    processes = []
    with tempfile.TemporaryDirectory() as temporary:
        logs = []
        try:
            for name, port in (('Catalog', 5211), ('Shopper', 5210)):
                log = open(Path(temporary) / f'{name}.log', 'w+')
                logs.append(log)
                process = subprocess.Popen([shutil.which('dotnet'), str(ROOT / f'src/Lab.{name}/bin/Release/net10.0/Lab.{name}.dll')],
                                           cwd=ROOT, env=dict(env, ASPNETCORE_URLS=f'http://127.0.0.1:{port}'), stdout=log, stderr=subprocess.STDOUT)
                processes.append(process)
                for _ in range(100):
                    if process.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(log.read())
                    try:
                        if request(port, '/health')[0] == 200:
                            break
                    except OSError:
                        pass
                    time.sleep(.1)
                else:
                    raise RuntimeError('Service did not start')
            yield
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
            for log in logs:
                log.close()


@unittest.skipUnless(os.environ.get('LAB_HTTP_TESTS') == '1', 'Set LAB_HTTP_TESTS=1 to run built-service integration tests')
class HttpTests(unittest.TestCase):
    def setUp(self):
        self.received = []
        self.upstream_status = 302
        owner = self

        class Receiver(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                owner.received.append((self.path, len(body)))
                self.send_response(200)
                self.end_headers()

            def do_GET(self):
                owner.received.append((self.path, 0))
                self.send_response(owner.upstream_status)
                self.send_header('Location', 'http://127.0.0.1:5318/forbidden')
                self.send_header('Retry-After', '30')
                self.end_headers()
                self.wfile.write(b'{}')

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 5318), Receiver)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_real_catalog_throttling_shopper_and_otlp(self):
        with services():
            status, _, body = request(5210, '/shop/catalog?policy=jitter')
            self.assertEqual(200, status)
            self.assertEqual(2, json.loads(body)['count'])
            self.assertEqual(400, request(5210, '/shop/catalog?policy=bogus')[0])
            self.assertEqual(405, request(5210, '/shop/catalog?policy=fixed', 'POST')[0])
            replies = [request(5211, '/api/catalog/items?api-version=1.0') for _ in range(25)]
            denied = [reply for reply in replies if reply[0] == 429]
            self.assertTrue(denied)
            self.assertTrue(all(int(reply[1]['Retry-After']) >= 1 for reply in denied))
            metrics = json.loads(request(5210, '/lab/metrics')[2])
            self.assertEqual(1, metrics['totals']['logicalRequests'])
            self.assertEqual(1, metrics['totals']['successes'])
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                paths = {path for path, size in self.received if size > 0}
                if {'/v1/traces', '/v1/metrics', '/v1/logs'} <= paths:
                    break
                time.sleep(.2)
            self.assertTrue({'/v1/traces', '/v1/metrics', '/v1/logs'} <= paths, paths)

    def test_http_date_retry_after_is_future_estimate(self):
        with services(Catalog__RetryAfterFormat='date'):
            replies = [request(5211, '/api/catalog/items') for _ in range(25)]
            denied = [reply for reply in replies if reply[0] == 429]
            self.assertTrue(denied)
            retry_at = email.utils.parsedate_to_datetime(denied[-1][1]['Retry-After'])
            self.assertGreater(retry_at, datetime.datetime.now(datetime.timezone.utc))

    def test_upstream_redirect_is_not_followed(self):
        with services(Catalog__UpstreamBaseUrl='http://127.0.0.1:5318'):
            self.assertEqual(302, request(5210, '/shop/catalog?policy=fixed')[0])
            self.assertFalse(any(path == '/forbidden' for path, _ in self.received))
            metrics = json.loads(request(5210, '/lab/metrics')[2])
            self.assertEqual(1, metrics['totals']['attempts'])

    def test_budget_expires_without_violating_long_server_delay(self):
        self.upstream_status = 503
        with services(Catalog__UpstreamBaseUrl='http://127.0.0.1:5318'):
            start = time.monotonic()
            self.assertEqual(504, request(5210, '/shop/catalog?policy=retry-after')[0])
            self.assertLess(time.monotonic() - start, 6)
            metrics = json.loads(request(5210, '/lab/metrics')[2])
            self.assertEqual(1, metrics['totals']['attempts'])
            self.assertEqual(1, metrics['totals']['failures'])


if __name__ == '__main__':
    unittest.main()
