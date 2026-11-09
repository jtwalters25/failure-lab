using System.Diagnostics;
using Lab.Core;

var builder = WebApplication.CreateBuilder(args);
var urls = builder.Configuration["urls"] ?? "http://127.0.0.1:5100";
LocalOnly.ValidateBindings(urls);
builder.WebHost.UseUrls(urls);
builder.AddLabTelemetry("failure-lab-shopper");
builder.Services.AddSingleton<LabMetrics>();
var catalog = LocalOnly.BaseUri(builder.Configuration["Catalog:BaseUrl"] ?? "http://127.0.0.1:5101");
builder.Services.AddSingleton(new HttpClient(LocalOnly.Handler()) { BaseAddress = catalog, Timeout = Timeout.InfiniteTimeSpan });
var app = builder.Build();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/lab/metrics", (LabMetrics metrics) => Results.Ok(metrics.Snapshot()));
app.MapGet("/shop/catalog", async (string policy, HttpContext context, HttpClient client, LabMetrics metrics, ILogger<Program> logger) =>
{
    if (!RetryPolicy.IsPolicy(policy)) return Results.BadRequest(new { error = "unknown_policy" });
    var phase = LabMetrics.Phase(context.Request.Headers["X-Lab-Phase"]);
    var requestId = context.Request.Headers["X-Lab-Request-Id"].ToString();
    if (requestId.Length is 0 or > 128) requestId = Guid.NewGuid().ToString("N");
    using var activity = LabMetrics.Activities.StartActivity("shopper.catalog");
    activity?.SetTag("lab.policy", policy);
    activity?.SetTag("lab.phase", phase);
    using var scope = logger.BeginScope(new Dictionary<string, object> { ["requestId"] = requestId, ["policy"] = policy, ["phase"] = phase });
    metrics.Count("logicalRequests", policy, phase);
    var started = Stopwatch.GetTimestamp();
    var attempts = 0;
    var success = false;
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    budget.CancelAfter(RetryPolicy.TotalBudget);
    var pipeline = RetryPolicy.Create(policy, requestId, (retry, delay) =>
    {
        metrics.Count("retriesScheduled", policy, phase);
        logger.LogInformation("Retry {Retry} scheduled after {DelayMs} ms", retry, delay.TotalMilliseconds);
    });
    try
    {
        using var response = await pipeline.ExecuteAsync(async cancellationToken =>
        {
            attempts++;
            metrics.Count("attempts", policy, phase);
            if (attempts > 1) metrics.Count("retries", policy, phase);
            using var request = new HttpRequestMessage(HttpMethod.Get, "api/catalog/items?api-version=1.0&pageSize=10&pageIndex=0");
            request.Headers.Add("X-Lab-Policy", policy);
            request.Headers.Add("X-Lab-Phase", phase);
            using var attemptTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            attemptTimeout.CancelAfter(RetryPolicy.AttemptTimeout);
            try
            {
                var result = await client.SendAsync(request, attemptTimeout.Token);
                if ((int)result.StatusCode == 429) metrics.Count("throttles", policy, phase);
                return result;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                throw new TimeoutException("Catalog attempt exceeded its one-second budget.");
            }
        }, budget.Token);
        success = response.IsSuccessStatusCode;
        context.Response.Headers["X-Lab-Attempts"] = attempts.ToString();
        return Results.Content(await response.Content.ReadAsStringAsync(budget.Token), "application/json", statusCode: (int)response.StatusCode);
    }
    catch (Exception ex) when (ex is OperationCanceledException or HttpRequestException or TimeoutException)
    {
        metrics.Count("timeoutsOrTransportErrors", policy, phase);
        return Results.Json(new { error = "catalog_budget_or_transport_failure", attempts }, statusCode: 504);
    }
    finally
    {
        context.Response.Headers["X-Lab-Attempts"] = attempts.ToString();
        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        metrics.Count(success ? "successes" : "failures", policy, phase);
        metrics.Duration(elapsed, policy, phase);
        logger.LogInformation("Logical request completed: success={Success}, attempts={Attempts}, elapsedMs={ElapsedMs}", success, attempts, elapsed);
    }
});
app.Run();
