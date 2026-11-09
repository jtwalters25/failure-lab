using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

public static class Extensions
{
    // Intentionally no default HTTP resilience handler: the experiment owns retries.
    public static TBuilder AddLabTelemetry<TBuilder>(this TBuilder builder, string serviceName)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.ClearProviders();
        builder.Logging.AddJsonConsole(options => options.IncludeScopes = true);
        builder.Logging.AddOpenTelemetry(options =>
        {
            options.IncludeFormattedMessage = true;
            options.IncludeScopes = true;
        });
        var telemetry = builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(serviceName))
            .WithMetrics(metrics => metrics.AddMeter("FailureLab")
                .AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddRuntimeInstrumentation())
            .WithTracing(tracing => tracing.AddSource("FailureLab")
                .AddAspNetCoreInstrumentation(options => options.Filter = context =>
                    !context.Request.Path.StartsWithSegments("/health") &&
                    !context.Request.Path.StartsWithSegments("/lab/metrics"))
                .AddHttpClientInstrumentation());
        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
            telemetry.UseOtlpExporter();
        return builder;
    }
}
