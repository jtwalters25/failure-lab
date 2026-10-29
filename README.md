# Retry storm

Why do outages get worse after they're fixed? An interactive simulator of retry strategies after a 10 second outage, plus retry patterns found in public open-source code.

- `lib/sim.ts`: the simulation. Open system, 60 req/s into a 100 req/s service, rejections cost 30% of a served request, clients give up after 8 attempts.
- `lib/sim.test.ts`: checks the behavior holds on 500 seeded runs per strategy. Run `npm test`.
- `content/findings.ts`: hand-reviewed scanner findings, each pinned to a commit and line range.

Run locally with `npm install && npm run dev`. Deploys to Vercel as a static page with no configuration.
