import { findings, type Verdict } from "@/content/findings";

const BADGE: Record<Verdict, { label: string; className: string }> = {
  pattern: { label: "Pattern", className: "badge warn" },
  "done-well": { label: "Done well", className: "badge good" },
  noise: { label: "Noise", className: "badge muted" },
};

export function Findings() {
  return (
    <section aria-labelledby="wild-heading">
      <h2 id="wild-heading">Found in the wild</h2>
      <p className="fine">
        I wrote a few scanner rules for retry anti-patterns and ran them on public code from companies at AfroTech. Then I reviewed every hit by hand.
      </p>
      <div className="findings">
        {findings.map((f) => (
          <details key={f.url}>
            <summary>
              <span className="row">
                <span className="repo">{f.repo}</span>
                <span className={BADGE[f.verdict].className}>{BADGE[f.verdict].label}</span>
              </span>
              <span className="title">{f.title}</span>
            </summary>
            <p>{f.summary}</p>
            <pre><code>{f.snippet}</code></pre>
            <p className="takeaway">{f.takeaway}</p>
            <a href={f.url} target="_blank" rel="noreferrer">View the exact lines on GitHub</a>
          </details>
        ))}
      </div>
    </section>
  );
}
