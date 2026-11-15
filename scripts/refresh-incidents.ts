// Pulls recent incidents from public status pages and writes content/incidents.json.
// Run daily by .github/workflows/refresh-incidents.yml. Usage: node --experimental-strip-types scripts/refresh-incidents.ts
import { writeFileSync } from "node:fs";
import { toOutage, type Outage, type StatusIncident } from "../lib/incidents.ts";

const PROVIDERS: { name: string; url: string }[] = [
  { name: "GitHub", url: "https://www.githubstatus.com/api/v2/incidents.json" },
  { name: "Cloudflare", url: "https://www.cloudflarestatus.com/api/v2/incidents.json" },
  { name: "Anthropic", url: "https://status.anthropic.com/api/v2/incidents.json" },
  { name: "Datadog", url: "https://status.datadoghq.com/api/v2/incidents.json" },
  { name: "Twilio", url: "https://status.twilio.com/api/v2/incidents.json" },
];
const DAYS = 90;
const KEEP = 15;

const since = Date.now() - DAYS * 86400000;
const outages: Outage[] = [];
const sources: string[] = [];

for (const p of PROVIDERS) {
  try {
    const res = await fetch(p.url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { incidents?: StatusIncident[] };
    const found = (body.incidents ?? [])
      .map((i) => toOutage(p.name, i))
      .filter((o): o is Outage => o !== null && Date.parse(o.startedAt) >= since);
    outages.push(...found);
    sources.push(p.name);
    console.log(`${p.name}: ${found.length} resolved incidents in the last ${DAYS} days`);
  } catch (e) {
    // One provider being down or changing its format should not block the others.
    console.warn(`${p.name}: skipped (${(e as Error).message})`);
  }
}

if (sources.length === 0) {
  console.error("No provider responded; leaving content/incidents.json unchanged.");
  process.exit(1);
}

outages.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
const data = { updatedAt: new Date().toISOString(), days: DAYS, sources, outages: outages.slice(0, KEEP) };
writeFileSync(new URL("../content/incidents.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
