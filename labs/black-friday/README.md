# Black Friday reliability lab

This first slice exercises **real local HTTP traffic** against two .NET 10 services. `Lab.Catalog` is a small, eShop-compatible catalog read sample with a 20-per-second capacity gate. `Lab.Shopper` makes that read using one Polly retry pipeline. k6 issues one logical operation per iteration, with no retry of its own. The services emit OpenTelemetry traces, metrics, and logs; the runner also saves structured local counters and k6 summaries.

The [implementation plan](docs/implementation-plan.md) records the incremental scope and the [pinned upstream guide](docs/upstream-eshop.md) explains how to replace the catalog sample with a locally run public eShop catalog. The first slice does not measure full eShop's database, broker, checkout, or identity behavior.

## Setup

Install the .NET 10 SDK (10.0.403 or a later patch in that feature band), k6 2.3.0, Python 3.10+, and Node 22+ for the existing Next.js demo. The .NET project uses `global.json` and committed NuGet lock files. No container runtime is needed for the sample. Run from this directory:

```sh
dotnet build src/Lab.AppHost -c Release -p:RestoreLockedMode=true
dotnet test tests/Lab.Tests -c Release -p:RestoreLockedMode=true
LAB_HTTP_TESTS=1 python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/run-comparison.py --trials 3
```

The runner builds the two services from locked dependencies, checks that ports 5100 and 5101 are free, starts fresh local processes for each policy, and stops only its own children. Output goes to ignored `results/<UTC timestamp>/`: `manifest.json`, per-policy k6 JSON, service counter snapshots, JSON logs, and `comparison.json`/`comparison.md`. You can pass `--output results/my-run`, `--seed 42`, `--header-format date`, or `--no-build` after an explicit build. A failed run retains its evidence and marks the manifest failed. Do not compare a failed or incomplete run as if it passed.

The runner sets local telemetry export off and uses `/lab/metrics` for comparable snapshots. For an interactive view, run `dotnet run --project src/Lab.AppHost --launch-profile http` separately and open the dashboard URL printed by Aspire. It starts the sample services on loopback ports 5100/5101. Run the comparison after stopping the AppHost so it can own those ports. The services export OTLP to the dashboard when Aspire provides its local endpoint. To test manually: `curl 'http://127.0.0.1:5100/shop/catalog?policy=jitter'`.

The original browser demo remains independent: from the repository root, run `npm ci && npm test && npm run build`.

## Experiment design

All policies get four total attempts, a one-second attempt timeout, and a five-second logical budget. Only 429, 503 and transport/attempt-timeout errors are retried. Fixed waits 100 ms. Jitter uses a seeded full-jitter draw over an exponentially growing cap (100, 200, 400 ms for these three retries; the general cap is 2 seconds). Retry-After honors both legal delta-seconds and HTTP-date forms, adding up to 100 ms of seeded jitter to avoid a synchronized return; missing, invalid or past headers use exponential jitter. A long server delay is never shortened to fit the client budget: the logical request times out instead. The catalog gate's `Retry-After` describes its next refill and **does not reserve capacity**.

k6 offers exactly 50 normal requests at 5/s for 10 seconds, 900 spike requests at 60/s for 15 seconds, and 100 recovery requests at 5/s for 20 seconds. The phases start at 0, 10, and 25 seconds. Every request keeps its original phase label while retries finish. k6 version 2.3.0 may schedule one extra boundary iteration per phase; the script ignores that iteration to keep offered demand exactly 1,050. Three trials rotate policy order and use equal per-trial request-ID seeds. The runner restarts both services before every policy, resets in-memory counters, and requires zero dropped iterations plus at least 95% success in normal/recovery. A failure in the spike is expected at this deliberately overloaded capacity; no ranking is asserted. The table reports observed p95 latency, logical success, attempts per request, and backend throttles. A p95 dominated by quick failed requests is not a user-experience success metric on its own.

Each service binds only literal loopback HTTP. The k6 target is fixed to `127.0.0.1`; upstream forwarding accepts only literal loopback origins and does not follow redirects or use proxies. The scripts never contact a public retail site. The optional eShop fetch downloads only public `dotnet/eShop` at the pinned commit. The lab does not use Microsoft internal resources.
