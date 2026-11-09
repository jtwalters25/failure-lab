import http from 'k6/http';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const policies = ['fixed', 'jitter', 'retry-after'];
const policy = __ENV.POLICY;
if (!policies.includes(policy)) throw new Error('POLICY must be fixed, jitter, or retry-after');
const port = Number(__ENV.SHOPPER_PORT || 5100);
if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('Invalid local port');
// No configurable hostname, URL, redirects, remote modules, or k6-side retries.
const target = `http://127.0.0.1:${port}/shop/catalog?policy=${policy}`;
const logicalRequests = new Counter('logical_requests');
const logicalSuccess = new Rate('logical_success');
const logicalLatency = new Trend('logical_latency', true);
const attempts = new Counter('attempts_observed');
const phaseConfig = { normal: [0, 10, 5], spike: [10, 15, 60], recovery: [25, 20, 5] };
const scenarios = {};
const thresholds = { dropped_iterations: ['count==0'], logical_requests: ['count==1050'] };
for (const [phase, [start, duration, rate]] of Object.entries(phaseConfig)) {
  scenarios[phase] = {
    executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration: `${duration}s`,
    startTime: `${start}s`, preAllocatedVUs: 320, maxVUs: 320, gracefulStop: '6s',
    tags: { phase },
  };
  thresholds[`logical_requests{phase:${phase}}`] = [`count==${duration * rate}`];
  thresholds[`logical_success{phase:${phase}}`] = [phase === 'spike' ? 'rate>=0' : 'rate>=0.95'];
  thresholds[`logical_latency{phase:${phase}}`] = ['p(95)<6000'];
}
export const options = {
  scenarios, thresholds, discardResponseBodies: true, maxRedirects: 0,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'max'],
  systemTags: ['status', 'method', 'name', 'scenario'],
};

export default function () {
  const phase = exec.scenario.name;
  // k6 versions may schedule an iteration exactly at the phase end boundary.
  // Keep offered logical demand identical instead of counting that extra arrival.
  if (exec.scenario.iterationInTest >= phaseConfig[phase][1] * phaseConfig[phase][2]) return;
  const tags = { phase, policy };
  const response = http.get(target, {
    redirects: 0, timeout: '6s', tags: { ...tags, name: 'shopper.catalog' },
    headers: {
      'X-Lab-Phase': phase,
      'X-Lab-Request-Id': `${__ENV.SEED || '42'}:${phase}:${exec.scenario.iterationInTest}`,
    },
  });
  logicalRequests.add(1, tags);
  logicalSuccess.add(response.status === 200, tags);
  logicalLatency.add(response.timings.duration, tags);
  attempts.add(Number(response.headers['X-Lab-Attempts'] || 0), tags);
}

export function handleSummary(data) {
  return { [__ENV.SUMMARY_PATH || 'summary.json']: JSON.stringify(data, null, 2) };
}
