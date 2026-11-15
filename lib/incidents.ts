// Turns public status-page incidents (the Atlassian Statuspage v2 format that
// GitHub, Cloudflare and others publish) into the two numbers this lab can use:
// how long the outage lasted, and how long it took to close after the fix went out.

export type StatusUpdate = { status: string; created_at: string };
export type StatusIncident = {
  name: string;
  status: string;
  impact: string;
  shortlink?: string;
  created_at: string;
  started_at?: string | null;
  monitoring_at?: string | null;
  resolved_at?: string | null;
  incident_updates?: StatusUpdate[];
};

export type Outage = {
  provider: string;
  name: string;
  url: string | null;
  impact: string;
  startedAt: string;
  outageMinutes: number;
  // Minutes from "monitoring" (fix deployed, watching) to "resolved". null when the incident skipped monitoring.
  tailMinutes: number | null;
};

const minutes = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 60000);

export function toOutage(provider: string, inc: StatusIncident): Outage | null {
  if (inc.status !== "resolved" || !inc.resolved_at || inc.impact === "none") return null;
  const startedAt = inc.started_at ?? inc.created_at;
  const monitoringAt =
    inc.monitoring_at ??
    (inc.incident_updates ?? [])
      .filter((u) => u.status === "monitoring")
      .map((u) => u.created_at)
      .sort()[0] ??
    null;
  const outageMinutes = minutes(startedAt, inc.resolved_at);
  if (outageMinutes <= 0) return null;
  const tail = monitoringAt ? minutes(monitoringAt, inc.resolved_at) : null;
  return {
    provider,
    name: inc.name,
    url: inc.shortlink ?? null,
    impact: inc.impact,
    startedAt,
    outageMinutes,
    tailMinutes: tail !== null && tail >= 0 ? tail : null,
  };
}

// Google Cloud publishes its own format (status.cloud.google.com/incidents.json).
// It has no "monitoring" stage, so there is no fix-to-resolved tail.
export type GoogleIncident = {
  begin: string;
  end?: string | null;
  external_desc: string;
  uri?: string;
  severity?: string;
};

export function toOutageFromGoogle(inc: GoogleIncident): Outage | null {
  if (!inc.end) return null;
  const outageMinutes = minutes(inc.begin, inc.end);
  if (outageMinutes <= 0) return null;
  return {
    provider: "Google Cloud",
    name: inc.external_desc,
    url: inc.uri ? `https://status.cloud.google.com/${inc.uri.replace(/^\//, "")}` : null,
    impact: inc.severity ?? "unknown",
    startedAt: inc.begin,
    outageMinutes,
    tailMinutes: null,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
