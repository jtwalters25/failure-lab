import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate, rng, CAPACITY, OUTAGE_END, type Strategy } from "./sim.ts";

const SEEDS = 500;
function runs(s: Strategy) {
  return Array.from({ length: SEEDS }, (_, i) => simulate(s, rng(i + 1)));
}
const peak = (load: number[]) => Math.max(...load.slice(OUTAGE_END)) / CAPACITY;

test("fixed delay never recovers and fails thousands of requests, on every run", () => {
  for (const r of runs("fixed")) {
    assert.equal(r.clearedSeconds, null);
    assert.ok(r.failedRequests > 1000, `failed ${r.failedRequests}`);
    assert.ok(peak(r.load) > 3, `peak ${peak(r.load)}`);
  }
});

test("backoff + jitter recovers with zero failures, but slower than Retry-After, on every run", () => {
  const ra = runs("retryAfter");
  runs("backoff").forEach((r, i) => {
    assert.equal(r.failedRequests, 0);
    assert.notEqual(r.clearedSeconds, null);
    assert.ok(r.clearedSeconds! > ra[i].clearedSeconds!, `backoff ${r.clearedSeconds} vs RA ${ra[i].clearedSeconds}`);
  });
});

test("Retry-After never pushes load past capacity and drains within 20s, on every run", () => {
  for (const r of runs("retryAfter")) {
    assert.equal(r.failedRequests, 0);
    assert.ok(r.clearedSeconds! <= 20, `cleared ${r.clearedSeconds}`);
    assert.ok(peak(r.load) <= 1, `peak ${peak(r.load)}`);
  }
});

test("healthy service before the outage is never overloaded", () => {
  for (const s of ["fixed", "backoff", "retryAfter"] as Strategy[]) {
    for (const r of runs(s)) assert.ok(Math.max(...r.load.slice(0, 20)) <= CAPACITY);
  }
});
