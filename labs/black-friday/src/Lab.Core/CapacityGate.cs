namespace Lab.Core;

// A bounded periodic token bucket. Retry-After is an estimate of the next refill,
// not a reservation: competing clients may consume all permits at that time.
public sealed class CapacityGate(int permits = 20, TimeProvider? clock = null)
{
    private readonly object sync = new();
    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private long? windowStart;
    private int remaining = permits > 0 ? permits : throw new ArgumentOutOfRangeException(nameof(permits));

    public GateDecision TryAcquire()
    {
        lock (sync)
        {
            var now = time.GetTimestamp();
            windowStart ??= now;
            var elapsed = time.GetElapsedTime(windowStart.Value, now);
            if (elapsed >= TimeSpan.FromSeconds(1))
            {
                windowStart = now;
                elapsed = TimeSpan.Zero;
                remaining = permits;
            }
            if (remaining > 0)
            {
                remaining--;
                return new(true, TimeSpan.Zero);
            }
            return new(false, TimeSpan.FromSeconds(Math.Max(1, Math.Ceiling(1 - elapsed.TotalSeconds))));
        }
    }
}

public readonly record struct GateDecision(bool Allowed, TimeSpan RetryAfter);
