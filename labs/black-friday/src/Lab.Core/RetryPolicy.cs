using System.Net;
using Polly;
using Polly.Retry;

namespace Lab.Core;

public static class RetryPolicy
{
    public const int MaxAttempts = 4;
    public static readonly TimeSpan TotalBudget = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan AttemptTimeout = TimeSpan.FromSeconds(1);
    public static bool IsPolicy(string value) => value is "fixed" or "jitter" or "retry-after";

    // Stable FNV-1a + xorshift, independent of runtime hash randomization and VU scheduling.
    public static double Jitter(string requestId, int attempt)
    {
        uint hash = 2166136261;
        foreach (var c in $"{requestId}:{attempt}") hash = unchecked((hash ^ c) * 16777619);
        hash ^= hash << 13;
        hash ^= hash >> 17;
        hash ^= hash << 5;
        return hash / ((double)uint.MaxValue + 1);
    }

    public static TimeSpan Delay(string policy, string requestId, int retryIndex,
        HttpResponseMessage? response, DateTimeOffset now)
    {
        if (!IsPolicy(policy)) throw new ArgumentException("Unknown retry policy.");
        if (policy == "fixed") return TimeSpan.FromMilliseconds(100);
        var random = Jitter(requestId, retryIndex);
        if (policy == "retry-after")
        {
            // Typed header parsing supports delta-seconds and HTTP-date. Invalid values fall back.
            var header = response?.Headers.RetryAfter;
            var delay = header?.Delta ?? (header?.Date - now);
            if (delay is { } serverDelay && serverDelay >= TimeSpan.Zero)
                return serverDelay + TimeSpan.FromMilliseconds(100 * random);
        }
        return TimeSpan.FromMilliseconds(random * Math.Min(2000, 100 * Math.Pow(2, retryIndex)));
    }

    public static ResiliencePipeline<HttpResponseMessage> Create(string policy, string requestId,
        Action<int, TimeSpan>? onRetry = null)
    {
        if (!IsPolicy(policy)) throw new ArgumentException("Unknown retry policy.");
        return new ResiliencePipelineBuilder<HttpResponseMessage>().AddRetry(new RetryStrategyOptions<HttpResponseMessage>
        {
            MaxRetryAttempts = MaxAttempts - 1,
            ShouldHandle = args => ValueTask.FromResult(args.Outcome.Exception is HttpRequestException or TimeoutException ||
                args.Outcome.Result?.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.ServiceUnavailable),
            DelayGenerator = args => ValueTask.FromResult<TimeSpan?>(Delay(policy, requestId, args.AttemptNumber,
                args.Outcome.Result, DateTimeOffset.UtcNow)),
            OnRetry = args =>
            {
                onRetry?.Invoke(args.AttemptNumber + 1, args.RetryDelay);
                args.Outcome.Result?.Dispose();
                return default;
            }
        }).Build();
    }
}
