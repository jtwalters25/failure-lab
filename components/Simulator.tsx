"use client";

import { useState } from "react";
import { simulate, rng, CAPACITY, DURATION, OUTAGE_START, OUTAGE_END, type Strategy, type SimResult } from "@/lib/sim";

const OPTIONS: { id: Strategy; label: string; note: string }[] = [
  {
    id: "fixed",
    label: "Fixed delay",
    note: "Every failed request comes back 2 seconds later, together. The outage ended at 30s, but retries keep the service down.",
  },
  {
    id: "backoff",
    label: "Backoff + jitter",
    note: "Clients wait longer each time, at slightly random intervals. Nothing fails, but some clients wait over 30 seconds.",
  },
  {
    id: "retryAfter",
    label: "Honor Retry-After",
    note: "The server tells each client when to come back, using only its spare capacity. Load never passes the line.",
  },
];

const W = 320;
const H = 150;
const MAX_Y = 600;

function path(series: number[]) {
  return series
    .map((v, t) => `${t === 0 ? "M" : "L"}${((t / (DURATION - 1)) * W).toFixed(1)},${(H - (Math.min(v, MAX_Y) / MAX_Y) * H).toFixed(1)}`)
    .join(" ");
}

export function Simulator() {
  const [strategy, setStrategy] = useState<Strategy>("fixed");
  // Seeded first render so server and client HTML match; taps after that are random.
  const [result, setResult] = useState<SimResult>(() => simulate("fixed", rng(1)));

  function run(s: Strategy) {
    setStrategy(s);
    setResult(simulate(s));
  }

  const capY = H - (CAPACITY / MAX_Y) * H;
  const x = (t: number) => (t / (DURATION - 1)) * W;
  const note = OPTIONS.find((o) => o.id === strategy)!.note;

  return (
    <section aria-labelledby="sim-heading">
      <h2 id="sim-heading" className="sr-only">Retry storm simulator</h2>
      <div className="choices" role="group" aria-label="Retry strategy">
        {OPTIONS.map((o) => (
          <button key={o.id} onClick={() => run(o.id)} aria-pressed={strategy === o.id}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Backlog cleared</div>
          <div className="value">{result.clearedSeconds === null ? "Never" : `${result.clearedSeconds}s`}</div>
        </div>
        <div className="stat">
          <div className="label">Requests failed</div>
          <div className="value">{result.failedRequests.toLocaleString()}</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Requests per second over ${DURATION} seconds with ${OPTIONS.find((o) => o.id === strategy)!.label}. ${note}`}>
        <rect x={x(OUTAGE_START)} y={0} width={x(OUTAGE_END) - x(OUTAGE_START)} height={H} className="outage" />
        <text x={x(OUTAGE_START) + 3} y={12} className="tick">outage</text>
        <line x1={0} x2={W} y1={capY} y2={capY} className="cap" />
        <text x={W - 3} y={capY - 4} textAnchor="end" className="tick">capacity</text>
        <path d={path(result.load)} className="load" />
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {[0, 30, 60, 90, 120].map((t) => (
          <text key={t} x={x(Math.min(t, DURATION - 1))} y={H + 14} textAnchor={t === 0 ? "start" : t === 120 ? "end" : "middle"} className="tick">{t}s</text>
        ))}
      </svg>
      <p className="note">{note}</p>
      <p className="fine">Each tap runs a fresh simulation: 60 requests/sec into a service that can handle 100, then a 10 second outage. Rejecting a request still costs the server 30% of the work of serving one.</p>
    </section>
  );
}
