var builder = DistributedApplication.CreateBuilder(args);
var port = int.TryParse(builder.Configuration["Lab:PortBase"], out var configured) ? configured : 5100;
if (port < 1024 || port > 65534) throw new ArgumentException("Lab:PortBase must be between 1024 and 65534.");
var catalog = builder.AddProject<Projects.Lab_Catalog>("catalog", launchProfileName: null)
    .WithEnvironment("ASPNETCORE_URLS", "http://127.0.0.1:" + (port + 1));
builder.AddProject<Projects.Lab_Shopper>("shopper", launchProfileName: null)
    .WithEnvironment("ASPNETCORE_URLS", "http://127.0.0.1:" + port)
    .WithEnvironment("Catalog__BaseUrl", "http://127.0.0.1:" + (port + 1))
    .WaitFor(catalog);
builder.Build().Run();
