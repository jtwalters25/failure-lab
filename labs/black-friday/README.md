# Black Friday reliability lab

Imagine a storefront at the start of a sale. Catalog traffic rises faster than the service can handle, so it returns `429`. The question is what shoppers do next: retry together on a fixed interval, spread out with jitter, or follow the server's `Retry-After` instruction. This lab makes that question measurable on your own machine.

There is no new storefront UI in this slice. The original [Next.js simulator](../../README.md) is the visual introduction. Aspire supplies a local dashboard for traces and metrics, while each k6 run produces a Markdown comparison of real HTTP results.

## Walk through the system

Start at the boundary: `Lab.Catalog` admits 20 reads per second. A shopper request enters `Lab.Shopper`, which makes the catalog call through a single Polly retry pipeline. When the gate fills, the catalog sends `429` and `Retry-After`. That header estimates the next refill; it does not reserve a place for any shopper.

The client budget is the control. Every policy gets four total attempts, one second per attempt, and five seconds for the logical operation. k6 does not retry, so any extra backend load comes from the shopper policy. The runner restarts both services for each policy, rotates their order across trials, and offers the same 50 normal, 900 spike, and 100 recovery requests. It checks for dropped work and requires at least 95% success in normal and recovery phases.

Read the report as a tradeoff. Compare logical success, p95 latency, attempts per request, and backend throttles for each phase. In the initial three local trials, `Retry-After` raised spike success to about 39% from about 35% for fixed and jitter, and reduced attempts per request from roughly 3.4 to 3.2. Its spike p95 was about 3.3 seconds, versus 0.4–0.6 seconds for the other policies. Quick failures can make latency look good, so the report keeps success and latency separate. These observations describe the bounded sample, not a universal policy ranking.

The next boundary is realism. This sample isolates retry behavior; it does not measure eShop's database, broker, identity, or checkout behavior. The [pinned upstream guide](docs/upstream-eshop.md) describes using a locally controlled real eShop catalog, and the [implementation plan](docs/implementation-plan.md) lists the next increments.

## Run the walkthrough

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
