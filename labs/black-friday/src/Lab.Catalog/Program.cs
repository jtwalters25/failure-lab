using System.Globalization;
using System.Net.Http.Headers;
using Lab.Core;

var builder = WebApplication.CreateBuilder(args);
var urls = builder.Configuration["urls"] ?? "http://127.0.0.1:5101";
LocalOnly.ValidateBindings(urls);
builder.WebHost.UseUrls(urls);
builder.AddLabTelemetry("failure-lab-catalog");
builder.Services.AddSingleton<LabMetrics>();
builder.Services.AddSingleton(new CapacityGate());
var upstreamValue = builder.Configuration["Catalog:UpstreamBaseUrl"];
var upstream = upstreamValue is null ? null : LocalOnly.BaseUri(upstreamValue);
builder.Services.AddSingleton(new HttpClient(LocalOnly.Handler()) { BaseAddress = upstream, Timeout = TimeSpan.FromSeconds(1) });
var app = builder.Build();
app.MapGet("/health", () => Results.Ok(new { status = "ok", mode = upstream is null ? "sample" : "upstream-eshop" }));
app.MapGet("/lab/metrics", (LabMetrics metrics) => Results.Ok(metrics.Snapshot()));
app.MapGet("/api/catalog/items", async (HttpContext context, CapacityGate gate, LabMetrics metrics, HttpClient client) =>
{
    var policy = LabMetrics.Policy(context.Request.Headers["X-Lab-Policy"]);
    var phase = LabMetrics.Phase(context.Request.Headers["X-Lab-Phase"]);
    metrics.Count("attempts", policy, phase);
    var decision = gate.TryAcquire();
    if (!decision.Allowed)
    {
        metrics.Count("throttles", policy, phase);
        // Exercise both legal header encodings without a per-client slot scheduler.
        var mode = builder.Configuration["Catalog:RetryAfterFormat"] ?? "delta";
        context.Response.Headers.RetryAfter = mode == "date"
            ? DateTimeOffset.FromUnixTimeSeconds((long)Math.Ceiling(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0) +
                (long)decision.RetryAfter.TotalSeconds).ToString("R", CultureInfo.InvariantCulture)
            : ((int)decision.RetryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        return Results.Json(new { error = "capacity_exhausted" }, statusCode: 429);
    }
    metrics.Count("admitted", policy, phase);
    await Task.Delay(25, context.RequestAborted);
    if (upstream is not null)
    {
        try
        {
            using var response = await client.GetAsync("api/catalog/items?api-version=1.0&pageSize=10&pageIndex=0", context.RequestAborted);
            if (response.Headers.TryGetValues("Retry-After", out var retryAfter))
                context.Response.Headers.RetryAfter = retryAfter.First();
            var body = await response.Content.ReadAsStringAsync(context.RequestAborted);
            metrics.Count(response.IsSuccessStatusCode ? "successes" : "failures", policy, phase);
            return Results.Content(body, "application/json", statusCode: (int)response.StatusCode);
        }
        catch (Exception ex) when (ex is HttpRequestException || ex is OperationCanceledException && !context.RequestAborted.IsCancellationRequested)
        {
            metrics.Count("failures", policy, phase);
            return Results.Json(new { error = "upstream_unavailable" }, statusCode: 503);
        }
    }
    metrics.Count("successes", policy, phase);
    return Results.Ok(new
    {
        pageIndex = 0, pageSize = 10, count = 2,
        data = new[] { new { id = 1, name = "Lab hoodie", price = 49.0 }, new { id = 2, name = "Lab mug", price = 12.0 } }
    });
});
app.Run();
