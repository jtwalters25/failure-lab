using System.Net;

namespace Lab.Core;

public static class LocalOnly
{
    public static Uri BaseUri(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "http" ||
            !IPAddress.TryParse(uri.Host.Trim('[', ']'), out var address) || !IPAddress.IsLoopback(address) ||
            uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.AbsolutePath != "/")
            throw new ArgumentException("Use an HTTP literal loopback origin, e.g. http://127.0.0.1:5101; no path or credentials.");
        return uri;
    }

    public static void ValidateBindings(string urls)
    {
        foreach (var url in urls.Split(';', StringSplitOptions.RemoveEmptyEntries)) BaseUri(url);
        if (string.IsNullOrWhiteSpace(urls)) throw new ArgumentException("A loopback binding is required.");
    }

    public static SocketsHttpHandler Handler() => new()
    {
        AllowAutoRedirect = false,
        UseProxy = false,
        UseCookies = false,
        MaxConnectionsPerServer = 256
    };
}
