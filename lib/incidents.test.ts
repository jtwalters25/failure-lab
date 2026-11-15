import { test } from "node:test";
import assert from "node:assert/strict";
import { toOutage, median, formatMinutes, type StatusIncident } from "./incidents.ts";

const base: StatusIncident = {
  name: "Degraded API",
  status: "resolved",
  impact: "major",
  shortlink: "https://stspg.io/x",
  created_at: "2026-11-01T10:05:00Z",
  started_at: "2026-11-01T10:00:00Z",
  monitoring_at: "2026-11-01T11:00:00Z",
  resolved_at: "2026-11-01T11:45:00Z",
};

test("outage runs from start to resolved; tail runs from monitoring to resolved", () => {
  const o = toOutage("Example", base)!;
  assert.equal(o.outageMinutes, 105);
  assert.equal(o.tailMinutes, 45);
  assert.equal(o.url, "https://stspg.io/x");
});

test("falls back to created_at and the first monitoring update", () => {
  const o = toOutage("Example", {
    ...base,
    started_at: null,
    monitoring_at: null,
    incident_updates: [
      { status: "resolved", created_at: "2026-11-01T11:45:00Z" },
      { status: "monitoring", created_at: "2026-11-01T11:30:00Z" },
      { status: "monitoring", created_at: "2026-11-01T11:10:00Z" },
    ],
  })!;
  assert.equal(o.outageMinutes, 100);
  assert.equal(o.tailMinutes, 35);
});

test("no monitoring stage means no tail, not a zero tail", () => {
  assert.equal(toOutage("Example", { ...base, monitoring_at: null, incident_updates: [] })!.tailMinutes, null);
});

test("skips unresolved, no-impact and malformed incidents", () => {
  assert.equal(toOutage("Example", { ...base, status: "monitoring", resolved_at: null }), null);
  assert.equal(toOutage("Example", { ...base, impact: "none" }), null);
  assert.equal(toOutage("Example", { ...base, resolved_at: "2026-11-01T09:00:00Z" }), null);
});

test("median and formatting", () => {
  assert.equal(median([]), null);
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(355), "5 h 55 min");
});
