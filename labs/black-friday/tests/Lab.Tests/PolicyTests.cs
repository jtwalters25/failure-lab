using System.Net;
using System.Net.Http.Headers;
using Lab.Core;
using Xunit;

public class PolicyTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("http://example.com")]
    [InlineData("http://localhost:1234")]
    [InlineData("http://127.0.0.1:80/redirect")]
    [InlineData("http://127.0.0.1:80?url=example.com")]
    [InlineData("http://user:secret@127.0.0.1")]
    [InlineData("https://127.0.0.1")]
    [InlineData("http://0.0.0.0")]
    public void NonLocalOrAmbiguousOriginsAreRejected(string value) => Assert.Throws<ArgumentException>(() => LocalOnly.BaseUri(value));

    [Theory]
    [InlineData("http://127.0.0.1:5101")]
    [InlineData("http://[::1]:5101")]
    public void LiteralLoopbackIsAllowed(string value) => Assert.True(LocalOnly.BaseUri(value).IsLoopback);

    [Fact]
    public void RetryAfterDeltaAndDateAreMinimumDelays()
    {
        using var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(3));
        Assert.InRange(RetryPolicy.Delay("retry-after", "42", 0, response, Now).TotalSeconds, 3, 3.1);
        response.Headers.RetryAfter = new RetryConditionHeaderValue(Now.AddSeconds(10));
        // A large header must not be capped to the ordinary backoff maximum.
        Assert.InRange(RetryPolicy.Delay("retry-after", "42", 0, response, Now).TotalSeconds, 10, 10.1);
        Assert.Equal(TimeSpan.FromMilliseconds(100), RetryPolicy.Delay("fixed", "42", 0, response, Now));
    }

    [Fact]
    public void MissingMalformedAndPastHeadersFallBackToSeededJitter()
    {
        using var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        var expected = RetryPolicy.Delay("jitter", "42", 2, null, Now);
        Assert.Equal(expected, RetryPolicy.Delay("retry-after", "42", 2, response, Now));
        response.Headers.TryAddWithoutValidation("Retry-After", "garbage");
        Assert.Equal(expected, RetryPolicy.Delay("retry-after", "42", 2, response, Now));
        response.Headers.Remove("Retry-After");
        response.Headers.RetryAfter = new RetryConditionHeaderValue(Now.AddSeconds(-3));
        Assert.Equal(expected, RetryPolicy.Delay("retry-after", "42", 2, response, Now));
    }

    [Fact]
    public void JitterIsReproducibleBoundedAndVariesAcrossRequests()
    {
        var samples = Enumerable.Range(0, 100).Select(i => RetryPolicy.Delay("jitter", i.ToString(), 2, null, Now).TotalMilliseconds).ToArray();
        Assert.All(samples, x => Assert.InRange(x, 0, 400));
        Assert.True(samples.Distinct().Count() > 90);
        Assert.Equal(RetryPolicy.Jitter("17", 2), RetryPolicy.Jitter("17", 2));
    }

    [Fact]
    public async Task TransientResponsesStopAtFourAttemptsAndPermanentResponsesDoNotRetry()
    {
        foreach (var status in new[] { HttpStatusCode.TooManyRequests, HttpStatusCode.ServiceUnavailable, HttpStatusCode.NotFound })
        {
            var calls = 0;
            using var response = await RetryPolicy.Create("jitter", "1").ExecuteAsync(_ =>
            {
                calls++;
                return ValueTask.FromResult(new HttpResponseMessage(status));
            });
            Assert.Equal(status == HttpStatusCode.NotFound ? 1 : RetryPolicy.MaxAttempts, calls);
        }
    }

    [Fact]
    public async Task CancellationInterruptsLongRetryAfterRatherThanRetryingEarly()
    {
        var calls = 0;
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await RetryPolicy.Create("retry-after", "1")
            .ExecuteAsync(_ =>
            {
                calls++;
                var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
                response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(30));
                return ValueTask.FromResult(response);
            }, cancellation.Token));
        Assert.Equal(1, calls);
    }

    [Fact]
    public void GateRefillsAndDoesNotPromiseReservedCapacity()
    {
        var clock = new FakeClock();
        var gate = new CapacityGate(2, clock);
        Assert.True(gate.TryAcquire().Allowed);
        Assert.True(gate.TryAcquire().Allowed);
        var denied = gate.TryAcquire();
        Assert.False(denied.Allowed);
        Assert.Equal(TimeSpan.FromSeconds(1), denied.RetryAfter);
        clock.Advance(TimeSpan.FromMilliseconds(999));
        Assert.False(gate.TryAcquire().Allowed);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.True(gate.TryAcquire().Allowed);
        Assert.True(gate.TryAcquire().Allowed);
        Assert.False(gate.TryAcquire().Allowed);
    }

    private sealed class FakeClock : TimeProvider
    {
        private long ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => ticks;
        public void Advance(TimeSpan duration) => ticks += duration.Ticks;
    }
}
