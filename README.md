# Failure lab

Interactive demos of how distributed systems fail, and the patterns that prevent it.

## 1. Retry storms

Why do outages get worse after they're fixed? A simulator of what happens after a 10 second outage under three retry strategies, plus retry patterns found in public open-source code.

- `lib/sim.ts`: the simulation. Open system, 60 req/s into a 100 req/s service, rejections cost 30% of a served request, clients give up after 8 attempts.
- `lib/sim.test.ts`: checks the behavior holds on 500 seeded runs per strategy. Run `npm test`.
- `content/findings.ts`: hand-reviewed scanner findings, each pinned to a commit and line range.
- `rules/retry-hygiene.yml`: the Semgrep rules used to find them.

## Running it

`npm install && npm run dev`. Deploys to Vercel as a static page with no configuration.

## 2. Local Black Friday reliability lab

Start with the [Black Friday walkthrough](labs/black-friday/README.md): a shopper hits a capacity-limited local catalog, and you compare fixed retry, exponential jitter, and HTTP `Retry-After` under normal traffic, a spike, and recovery. The original simulator above is the visual demo; the .NET lab uses Aspire's local telemetry dashboard and generates a comparison report.
