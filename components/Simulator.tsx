"use client";

import { useState } from "react";
import { simulate, rng, CAPACITY, OUTAGE_START, OUTAGE_END, type Strategy, type SimResult } from "@/lib/sim";

const OPTIONS: { id: Strategy; label: string; note: string }[] = [
  {
    id: "fixed",
    label: "Fixed delay",
    note: "Every failed request comes back 2 seconds later, together. The outage ended, but retries keep the service down.",
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
    .map((v, t) => `${t === 0 ? "M" : "L"}${((t / (series.length - 1)) * W).toFixed(1)},${(H - (Math.min(v, MAX_Y) / MAX_Y) * H).toFixed(1)}`)
    .join(" ");
}

const LONG_BACKOFF_NOTE =
  "Backoff spreads retries out, but this outage built a backlog bigger than the spare capacity. The retries alone keep the service overloaded.";

export function Simulator({ outageSeconds = OUTAGE_END - OUTAGE_START }: { outageSeconds?: number }) {
  const [strategy, setStrategy] = useState<Strategy>("fixed");
  // Seeded first render so server and client HTML match; taps after that are random.
  const [result, setResult] = useState<SimResult>(() => simulate("fixed", rng(1), outageSeconds));

  function run(s: Strategy) {
    setStrategy(s);
    setResult(simulate(s, Math.random, outageSeconds));
  }

  const duration = result.load.length;
  const capY = H - (CAPACITY / MAX_Y) * H;
  const x = (t: number) => (t / (duration - 1)) * W;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((duration * f) / 10) * 10);
  const note =
    strategy === "backoff" && result.clearedSeconds === null ? LONG_BACKOFF_NOTE : OPTIONS.find((o) => o.id === strategy)!.note;

  return (
    <section id="simulator" aria-labelledby="sim-heading">
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

      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Requests per second over ${duration} seconds with ${OPTIONS.find((o) => o.id === strategy)!.label}. ${note}`}>
        <rect x={x(OUTAGE_START)} y={0} width={x(result.outageEnd) - x(OUTAGE_START)} height={H} className="outage" />
        <text x={x(OUTAGE_START) + 3} y={12} className="tick">outage</text>
        <line x1={0} x2={W} y1={capY} y2={capY} className="cap" />
        <text x={W - 3} y={capY - 4} textAnchor="end" className="tick">capacity</text>
        <path d={path(result.load)} className="load" />
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {ticks.map((t, i) => (
          <text key={t} x={x(Math.min(t, duration - 1))} y={H + 14} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="tick">{t}s</text>
        ))}
      </svg>
      <p className="note">{note}</p>
      <p className="fine">Each tap runs a fresh simulation: 60 requests/sec into a service that can handle 100, then a {outageSeconds} second outage. Rejecting a request still costs the server 30% of the work of serving one.</p>
    </section>
  );
}
