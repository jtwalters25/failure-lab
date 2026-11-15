import incidents from "@/content/incidents.json";
import { scenarios } from "@/content/scenarios";
import { formatMinutes, median, type Outage } from "@/lib/incidents";

export type Replay = { id: string; label: string; minutes: number };

const live = incidents.outages as Outage[];
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function RealOutages({ onReplay }: { onReplay: (r: Replay) => void }) {
  const tails = live.map((o) => o.tailMinutes).filter((m): m is number => m !== null);
  const medianTail = median(tails);

  return (
    <section aria-labelledby="real-heading">
      <h2 id="real-heading">Real outages</h2>
      <p className="fine">
        Status pages don&apos;t publish request rates, so the simulator can&apos;t reproduce these incidents. They do publish how long each outage lasted. Replay one to watch an outage that long play out, one real minute per simulated second.
      </p>

      <h3>From Microsoft Azure&apos;s public incident reviews</h3>
      <div className="findings">
        {scenarios.map((s) => (
          <details key={s.id}>
            <summary>
              <span className="row">
                <span className="repo">{day(s.date)}</span>
                <span className="badge muted">{s.approx ? "about " : ""}{formatMinutes(s.outageMinutes)}</span>
              </span>
              <span className="title">{s.name}</span>
            </summary>
            <p>{s.story}</p>
            <p className="takeaway">{s.lesson}</p>
            <button className="replay-btn" onClick={() => onReplay({ id: s.id, label: s.name, minutes: s.outageMinutes })}>
              Replay this outage
            </button>
            <p className="fine">
              Sources:{" "}
              {s.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && ", "}
                  <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
                </span>
              ))}
            </p>
          </details>
        ))}
      </div>

      <h3>Recently on public status pages</h3>
      {live.length === 0 ? (
        <p className="fine">Live data refreshes daily from public status pages. The first refresh hasn&apos;t run yet.</p>
      ) : (
        <>
          {medianTail !== null && (
            <div className="stats">
              <div className="stat">
                <div className="label">Median outage</div>
                <div className="value">{formatMinutes(median(live.map((o) => o.outageMinutes))!)}</div>
              </div>
              <div className="stat">
                <div className="label">Median fix to resolved</div>
                <div className="value">{formatMinutes(medianTail)}</div>
              </div>
            </div>
          )}
          <ul className="outages">
            {live.map((o) => (
              <li key={`${o.provider}-${o.startedAt}`}>
                <span className="row">
                  <span className="repo">{o.provider}, {day(o.startedAt)}</span>
                  <span className="badge muted">{formatMinutes(o.outageMinutes)}</span>
                </span>
                {o.url ? <a className="title" href={o.url} target="_blank" rel="noreferrer">{o.name}</a> : <span className="title">{o.name}</span>}
                <span className="row">
                  <span className="fine">{o.tailMinutes === null ? "No monitoring stage posted" : `${formatMinutes(o.tailMinutes)} from fix to resolved`}</span>
                  <button className="replay-btn" onClick={() => onReplay({ id: `${o.provider}-${o.startedAt}`, label: `${o.provider}: ${o.name}`, minutes: o.outageMinutes })}>
                    Replay
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="fine">
            &quot;Fix to resolved&quot; runs from the first &quot;monitoring&quot; update to &quot;resolved&quot;. Part of it is backlog draining, part is how carefully a team waits before closing, so treat it as a hint, not a measurement. Sources: {incidents.sources.join(", ")}. Last {incidents.days} days, updated {incidents.updatedAt ? day(incidents.updatedAt) : "never"}.
          </p>
        </>
      )}
    </section>
  );
}
