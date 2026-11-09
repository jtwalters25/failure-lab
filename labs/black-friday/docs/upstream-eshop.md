# Optional pinned upstream eShop

The default lab is a **catalog-contract sample**. It is not a vendored eShop service and is not a benchmark of full eShop.

`upstream.lock.json` pins public [dotnet/eShop](https://github.com/dotnet/eShop/tree/913acea66708a59595351174cee9b29f37179d29) to `913acea66708a59595351174cee9b29f37179d29`. Fetch it without copying its code into this repo:

```sh
cd labs/black-friday
python3 scripts/fetch-eshop.py
```

The ignored `.deps/eshop` checkout stays detached at that commit. The script verifies its origin and commit and refuses to overwrite local changes or a different revision. Updates require an explicit lock change and review of upstream compatibility.

At this pin, upstream `global.json` specifies SDK 10.0.302 with `latestFeature` roll-forward, Catalog.API targets .NET 10, and upstream Aspire uses 13.6.0. The sample lab independently pins a patched Aspire version. Catalog's read endpoint is `/api/catalog/items?api-version=1.0&pageSize=10&pageIndex=0` and returns `pageIndex`, `pageSize`, `count`, and `data`.

## Local integration path

1. Install a container runtime and follow the pinned upstream README to run its local `src/eShop.AppHost` with the .NET SDK. This starts the real dependencies and additional eShop services. Do not configure cloud AI/Foundry or remote endpoints. The upstream Catalog HTTP profile uses port 5222; when Aspire chooses a different port, use the actual literal loopback HTTP origin shown in its dashboard.
2. Alternatively, a smaller manual stack needs PostgreSQL with the `vector` extension and RabbitMQ. Catalog uses connection-string names `catalogdb` and `eventbus`, performs database migrations/seeding, and registers broker consumers during startup. Supply `ConnectionStrings__catalogdb` and `ConnectionStrings__eventbus` pointing at your local containers, set `ASPNETCORE_ENVIRONMENT=Development`, and run `dotnet run --project .deps/eshop/src/Catalog.API --launch-profile http`. Verify `/health` and the catalog read endpoint before running load. These are integration instructions, not a tested container recipe.
3. Stop the sample Aspire host if it occupies ports 5100/5101, then run:

   ```sh
   python3 scripts/run-comparison.py --upstream http://127.0.0.1:5222 --trials 3
   ```

The runner starts its own shopper and admission gate. Admitted reads are forwarded to the local upstream Catalog with redirects, proxies and extra retries disabled in the forwarding client. The gate's synthetic 20/s limit and 25ms delay remain in place for comparison. The manifest identifies this mode as `upstream-local`; it does not assert the supplied process is the pinned upstream checkout.

## Limitations and next integration milestone

The real eShop stack has **not been started or load-tested** in the initial implementation environment because it has no container runtime. The exact upstream source checkout is verified separately. Upstream infrastructure references include floating image tags; the source SHA alone does not pin container contents or all restore dependencies. Before publishing eShop results, create a minimal Aspire host referencing the external Catalog project, pin PostgreSQL/pgvector and RabbitMQ image digests, lock NuGet resolution, record those versions in each manifest, and validate startup and shutdown in CI.

Upstream ServiceDefaults already registers standard HTTP resilience. Do not add another retry handler around this lab's shopper; nested retries would invalidate the attempt budget. Full eShop behavior includes database and broker effects that the lightweight sample intentionally does not model. A `Retry-After` header from the gate is an estimate of the next refill, never a reservation for that client.
