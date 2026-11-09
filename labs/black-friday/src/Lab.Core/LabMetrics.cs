using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace Lab.Core;

public sealed class LabMetrics
{
    public static readonly ActivitySource Activities = new("FailureLab");
    private static readonly Meter Meter = new("FailureLab", "1.0.0");
    private static readonly Counter<long> Events = Meter.CreateCounter<long>("lab.events", "{event}");
    private static readonly Histogram<double> Latency = Meter.CreateHistogram<double>("lab.logical.duration", "ms");
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, long>> values = new();
    public static string Phase(string? phase) => phase is "normal" or "spike" or "recovery" ? phase : "unknown";
    public static string Policy(string? policy) => policy is "fixed" or "jitter" or "retry-after" ? policy : "unknown";

    public void Count(string name, string policy, string phase)
    {
        policy = Policy(policy);
        phase = Phase(phase);
        values.GetOrAdd($"{policy}/{phase}", _ => new()).AddOrUpdate(name, 1, (_, value) => value + 1);
        Events.Add(1, new("event", name), new("policy", policy), new("phase", phase));
    }

    public void Duration(double milliseconds, string policy, string phase) =>
        Latency.Record(milliseconds, new("policy", Policy(policy)), new("phase", Phase(phase)));

    public object Snapshot() => new
    {
        totals = values.Values.SelectMany(v => v).GroupBy(v => v.Key).ToDictionary(g => g.Key, g => g.Sum(v => v.Value)),
        groups = values.ToDictionary(v => v.Key, v => v.Value.ToDictionary())
    };
}
