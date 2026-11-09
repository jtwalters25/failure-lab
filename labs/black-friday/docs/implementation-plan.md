# Incremental implementation plan

Initial inspection: `a743b42` is a small Next.js static demo with four seeded simulator tests, curated public-source findings, and no .NET services or CI. Keep its application and tests intact. The original simulator models idealized Retry-After scheduling; real HTTP Retry-After is a minimum wait, not a capacity reservation.

1. **Runnable local slice (this PR):** two .NET 10 processes, a small catalog-contract sample behind a 20-per-second admission gate and a shopper with one Polly retry pipeline. Add fixed delay, exponential full jitter, and Retry-After-aware delay with equal attempt/time budgets. Instrument HTTP and logical operations with OpenTelemetry. Offer Aspire for interactive traces and structured JSON for unattended runs.
2. **Comparable load (this PR):** k6 open-arrival normal/spike/recovery phases. Restart both processes between policies, rotate order across trials, seed retry jitter by logical request, reject dropped work, and retain raw summaries, counters, logs, versions, configuration, and a comparison table. Test cancellation, actual headers, capacity, HTTP integration, and preservation of the browser simulator.
3. **Pinned real eShop integration (prepared, not runtime-validated in this PR):** fetch public upstream eShop by exact commit without vendoring its source; run its catalog with PostgreSQL/pgvector and RabbitMQ locally; connect the same admission gate to its HTTP endpoint. Pin container digests and validate the external stack before treating it as a reproducible eShop benchmark.
4. **Later increments:** a minimal eShop Aspire host with digest-pinned infrastructure; deterministic dependency latency/outage injection; recovery-time measures based on completion windows; queue, concurrency, circuit-breaker and bulkhead experiments; order/checkout idempotency; regression envelopes over repeated runs. Keep these independently reviewable.

## Why the lightweight target first

At upstream `913acea66708a59595351174cee9b29f37179d29`, Catalog.API needs .NET 10, PostgreSQL with the vector extension, and RabbitMQ; the full AppHost includes many more services. This machine initially had .NET 6 and no Docker. A workspace .NET 10 SDK and k6 make the sample runnable without changing the machine's container setup. This validates real HTTP load, bounded retries and telemetry, but says nothing about eShop database, broker, identity, checkout or production capacity.

## Acceptance criteria

- Existing `npm test` and production build still pass.
- .NET build, retry/capacity tests, harness tests and HTTP/telemetry integration tests pass.
- Every valid load run offers 1,050 logical requests with no dropped iterations; normal and recovery success are at least 95%; all requests complete within the client budget.
- No assumption that a policy always wins; the report records observed success, latency, attempts/request and throttles separately.
- All load targets are literal loopback addresses; redirects and proxy use are disabled. No Microsoft internal resource or third-party retail target is involved.
- Setup, tradeoffs, unvalidated upstream integration and measured evidence are explicit in a draft PR.
