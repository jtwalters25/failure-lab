export type Strategy = "fixed" | "backoff" | "retryAfter";

export const CAPACITY = 100; // requests/sec the service can serve
export const ARRIVAL_RATE = 60; // new requests/sec when healthy
export const DURATION = 120;
export const OUTAGE_START = 20;
export const OUTAGE_END = 30;
export const MAX_ATTEMPTS = 8; // clients give up after this many tries
const MAX_BACKOFF = 32;
// Rejecting a request still costs the server this fraction of the work of serving one.
// This is what lets overload feed on itself: more retries, less goodput.
export const REJECT_COST = 0.3;
// Spare capacity per second the server hands out as Retry-After slots.
const HEADROOM = CAPACITY - ARRIVAL_RATE - 5;

export type SimResult = {
  load: number[]; // requests offered per second
  capacity: number[];
  clearedSeconds: number | null; // seconds after the outage until the backlog is gone; null = never
  failedRequests: number; // requests that gave up after MAX_ATTEMPTS
};

// Small seeded PRNG (mulberry32) so runs are reproducible in tests.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function retryAt(s: Strategy, t: number, attempt: number, slots: number[], rand: () => number): number {
  switch (s) {
    case "fixed":
      return t + 2;
    case "backoff": {
      // Exponential backoff, spread +/-50% so clients desynchronize.
      const backoff = Math.min(MAX_BACKOFF, 2 ** attempt);
      return t + Math.max(1, Math.round(backoff * (0.5 + rand())));
    }
    case "retryAfter": {
      // Server tells each client the earliest second it has spare capacity for.
      let u = t + 1;
      while (slots[u] >= HEADROOM) u++;
      slots[u]++;
      return u;
    }
  }
}

export function simulate(s: Strategy, rand: () => number = Math.random): SimResult {
  const horizon = DURATION + 2000;
  const retries: number[][] = Array.from({ length: horizon }, () => []); // attempt numbers due at second t
  const slots: number[] = new Array(horizon).fill(0);
  const load: number[] = [];
  const capacity: number[] = [];
  let pending = 0; // retries scheduled but not yet arrived
  let failed = 0;
  let clearedSeconds: number | null = null;

  for (let t = 0; t < DURATION; t++) {
    const cap = t >= OUTAGE_START && t < OUTAGE_END ? 0 : CAPACITY;
    // New requests: ARRIVAL_RATE +/- 5 so the line isn't perfectly flat.
    const fresh = ARRIVAL_RATE + Math.round((rand() - 0.5) * 10);
    const arriving = [...Array<number>(fresh).fill(0), ...retries[t]];
    pending -= retries[t].length;
    // Shuffle so who gets served is random.
    for (let i = arriving.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arriving[i], arriving[j]] = [arriving[j], arriving[i]];
    }
    const a = arriving.length;
    // served + REJECT_COST * rejected <= cap
    const served = Math.max(0, Math.min(a, Math.floor((cap - REJECT_COST * a) / (1 - REJECT_COST))));
    for (let i = served; i < a; i++) {
      const attempt = arriving[i] + 1;
      if (attempt >= MAX_ATTEMPTS) {
        failed++;
        continue;
      }
      retries[retryAt(s, t, attempt, slots, rand)].push(attempt);
      pending++;
    }
    load.push(a);
    capacity.push(cap);
    if (clearedSeconds === null && t >= OUTAGE_END && served === a && pending === 0) {
      clearedSeconds = t - OUTAGE_END;
    }
  }

  return { load, capacity, clearedSeconds, failedRequests: failed };
}
