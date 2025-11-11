using MangaTracker.Services.ChapterTracking;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Linq;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public sealed class HttpFetcher : IDisposable
{
    private readonly HttpClient _http;
    private readonly HttpClientHandler _handler;
    private readonly CookieContainer _cookies = new();
    private readonly ConcurrentDictionary<string, DateTime> _perHostNext = new(StringComparer.OrdinalIgnoreCase);
    private readonly TimeSpan _minDelayPerHost = TimeSpan.FromMilliseconds(900);
    private readonly Random _rng = new();

    private readonly ILogger? _logger;

    private const string ChromeUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

    private static readonly string[] UserAgents =
    {
        ChromeUA,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/127.0.0.0 Safari/537.36"
    };

    // Public API: JS-only Hosts vormerken
    private static readonly ConcurrentDictionary<string, byte> JsOnlyHosts = new(StringComparer.OrdinalIgnoreCase);

    // Gelernt zur Laufzeit
    private readonly ConcurrentDictionary<string, byte> _jsFallbackHosts = new(StringComparer.OrdinalIgnoreCase);

    private static string HostOf(Uri u) => u.Host;

    public HttpFetcher(TimeSpan? timeout = null, ILogger? logger = null)
    {
        _logger = logger;
        _handler = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
            UseCookies = true,
            CookieContainer = _cookies,
        };

        _http = new HttpClient(_handler)
        {
            Timeout = timeout ?? TimeSpan.FromSeconds(35),
            DefaultRequestVersion = HttpVersion.Version20,
            DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrHigher
        };

        _http.DefaultRequestHeaders.Clear();
        _http.DefaultRequestHeaders.TryAddWithoutValidation(
            "Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
        _http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "de-DE,de;q=0.7,en-US;q=0.6,en;q=0.5");
        _http.DefaultRequestHeaders.TryAddWithoutValidation("Cache-Control", "no-cache");
        _http.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
        _http.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("deflate"));
        _http.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("br"));
    }

    private void LDebug(string cid, string msg) => (_logger ?? DummyLogger.Instance).LogDebug("[{Cid}] {Msg}", cid, msg);
    private void LInfo(string cid, string msg) => (_logger ?? DummyLogger.Instance).LogInformation("[{Cid}] {Msg}", cid, msg);
    private void LWarn(string cid, string msg) => (_logger ?? DummyLogger.Instance).LogWarning("[{Cid}] {Msg}", cid, msg);
    private void LError(string cid, string msg, Exception? ex = null) =>
        (_logger ?? DummyLogger.Instance).LogError(ex, "[{Cid}] {Msg}", cid, msg);

    private async Task ThrottleAsync(Uri u, CancellationToken ct, string cid)
    {
        var host = u.Host;
        var now = DateTime.UtcNow;
        var next = _perHostNext.GetOrAdd(host, now);
        if (next > now)
        {
            var wait = next - now;
            LDebug(cid, $"Throttle {host} for {wait.TotalMilliseconds:F0} ms");
            await Task.Delay(wait, ct);
        }
        var jitter = TimeSpan.FromMilliseconds(_rng.Next(50, 250));
        _perHostNext[host] = DateTime.UtcNow + _minDelayPerHost + jitter;
    }

    public CookieContainer Cookies => _cookies;

    public static void RegisterJsOnlyHost(string host)
    {
        if (!string.IsNullOrWhiteSpace(host))
            JsOnlyHosts[host] = 1;
    }

    public static string NormalizeUrl(string url)
    {
        url = (url ?? "").Trim();
        if (Uri.TryCreate(url, UriKind.Absolute, out _))
            return url;
        if (Uri.TryCreate("https://" + url, UriKind.Absolute, out var abs) && !string.IsNullOrEmpty(abs.Host))
            return abs.ToString();
        throw new ArgumentException($"Invalid absolute URL: '{url}'");
    }

    private static string OriginOf(Uri uri) => uri.GetLeftPart(UriPartial.Authority) + "/";

    private static bool LooksLikeJsChallenge(HttpResponseMessage resp)
    {
        static bool Has(HttpResponseHeaders h, string name) => h.TryGetValues(name, out _);
        var server = string.Join(" ", resp.Headers.Server.Select(v => v.ToString())).ToLowerInvariant();
        return server.Contains("cloudflare") ||
               server.Contains("ddos") ||
               server.Contains("sucuri") ||
               Has(resp.Headers, "cf-ray") ||
               Has(resp.Headers, "cf-cache-status") ||
               Has(resp.Headers, "x-sucuri-id");
    }

    private static bool BodyLooksLikeChallenge(string html)
    {
        if (string.IsNullOrEmpty(html))
            return false;
        var low = html.ToLowerInvariant();
        return
            low.Contains("challenges.cloudflare.com") ||
            low.Contains("cf-chl-") ||
            low.Contains("please verify you are human") ||
            low.Contains("bestätigen sie, dass sie ein mensch sind") ||
            low.Contains("checking your browser before accessing") ||
            low.Contains("just a moment");
    }

    public async Task<string> GetStringSmartAsync(string rawUrl, string? referer = null, CancellationToken ct = default)
    {
        var cid = Guid.NewGuid().ToString("N").Substring(0, 8); // kompakte Correlation-ID
        var swAll = Stopwatch.StartNew();

        var url = NormalizeUrl(rawUrl);
        var uri = new Uri(url);
        var host = HostOf(uri);

        LInfo(cid, $"START fetch {url} (host={host})");

        await ThrottleAsync(uri, ct, cid);

        // Direkt via WebView2, wenn Host dafür markiert ist
        if (JsOnlyHosts.ContainsKey(host) || _jsFallbackHosts.ContainsKey(host))
        {
            LInfo(cid, $"Host is JS-only → Fetch via WebView2");
            var sw = Stopwatch.StartNew();
            var htmlWV = await WebView2HtmlFetcher.FetchHtmlAsync(url, TimeSpan.FromSeconds(45), _logger, cid);
            sw.Stop();
            if (!string.IsNullOrEmpty(htmlWV))
            {
                LInfo(cid, $"WV2 fetch OK in {sw.ElapsedMilliseconds} ms");
                LInfo(cid, $"DONE in {swAll.ElapsedMilliseconds} ms");
                return htmlWV;
            }
            LWarn(cid, $"WV2 fetch returned null; will try HTTP path");
        }

        string MakeReferer() => referer != null ? NormalizeUrl(referer) : OriginOf(uri);

        const int maxTry = 3;
        bool warmed = false;

        for (int attempt = 1; attempt <= maxTry; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            var attemptSw = Stopwatch.StartNew();

            using var req = new HttpRequestMessage(HttpMethod.Get, uri)
            {
                Version = HttpVersion.Version20,
                VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher
            };

            var ua = UserAgents[_rng.Next(UserAgents.Length)];
            req.Headers.UserAgent.Clear();
            req.Headers.UserAgent.ParseAdd(ua);

            try
            { req.Headers.Referrer = new Uri(MakeReferer()); }
            catch { }

            LInfo(cid, $"HTTP attempt {attempt}/{maxTry} – UA='{ua}', Referrer='{req.Headers.Referrer}'");

            HttpResponseMessage resp;
            try
            {
                resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            }
            catch (InvalidOperationException ex)
            {
                LWarn(cid, $"InvalidOperationException during SendAsync → try WV2 fallback");
                var sw = Stopwatch.StartNew();
                var htmlIo = await WebView2HtmlFetcher.FetchHtmlAsync(url, TimeSpan.FromSeconds(45), _logger, cid);
                sw.Stop();
                if (!string.IsNullOrEmpty(htmlIo))
                {
                    _jsFallbackHosts[host] = 1;
                    LInfo(cid, $"WV2 fallback succeeded in {sw.ElapsedMilliseconds} ms");
                    LInfo(cid, $"DONE in {swAll.ElapsedMilliseconds} ms");
                    return htmlIo;
                }
                LError(cid, "WV2 fallback failed (null HTML).", ex);
                throw;
            }

            using (resp)
            {
                var code = (int)resp.StatusCode;
                LInfo(cid, $"HTTP {code} in {attemptSw.ElapsedMilliseconds} ms (server='{string.Join(" ", resp.Headers.Server.Select(v => v.ToString()))}')");

                if (code == 403 || code == 429)
                {
                    if (LooksLikeJsChallenge(resp))
                    {
                        // Interaktives Solve anbieten
                        LWarn(cid, "Looks like JS challenge (headers). Offer interactive solve.");
                        var solved = await WebView2HtmlFetcher.SolveCloudflareInteractivelyAsync(url);
                        if (solved)
                        {
                            var warm = await WebView2HtmlFetcher.WarmUpCookiesAsync(url, _cookies, TimeSpan.FromSeconds(45), _logger, cid);
                            LInfo(cid, $"Interactive solve finished; cookies imported={warm}. Retrying HTTP.");
                            await Task.Delay(600, ct);
                            attempt--;
                            continue;
                        }

                        // Harter WV2-Fall
                        LWarn(cid, "Interactive solve not completed → try WV2 capture.");
                        var htmlWV = await WebView2HtmlFetcher.FetchHtmlAsync(url, TimeSpan.FromSeconds(45), _logger, cid);
                        if (!string.IsNullOrEmpty(htmlWV))
                        {
                            _jsFallbackHosts[host] = 1;
                            LInfo(cid, $"WV2 success");
                            LInfo(cid, $"DONE in {swAll.ElapsedMilliseconds} ms");
                            return htmlWV;
                        }
                    }

                    if (!warmed)
                    {
                        LInfo(cid, "Trying cookie warm-up via WV2…");
                        var swWU = Stopwatch.StartNew();
                        try
                        {
                            warmed = await WebView2HtmlFetcher.WarmUpCookiesAsync(url, _cookies, TimeSpan.FromSeconds(45), _logger, cid);
                        }
                        catch (Exception ex)
                        {
                            LError(cid, "WarmUpCookiesAsync threw.", ex);
                            warmed = false;
                        }
                        swWU.Stop();
                        LInfo(cid, $"Cookie warm-up result: {warmed} ({swWU.ElapsedMilliseconds} ms)");

                        if (warmed)
                        {
                            await Task.Delay(600, ct);
                            LInfo(cid, "Retry HTTP after warm-up");
                            attempt--;
                            continue;
                        }
                    }

                    LWarn(cid, "HTTP 403/429 persists → WV2 fallback");
                    var sw2 = Stopwatch.StartNew();
                    var htmlWV2 = await WebView2HtmlFetcher.FetchHtmlAsync(url, TimeSpan.FromSeconds(45), _logger, cid);
                    sw2.Stop();
                    if (!string.IsNullOrEmpty(htmlWV2))
                    {
                        _jsFallbackHosts[host] = 1;
                        LInfo(cid, $"WV2 success in {sw2.ElapsedMilliseconds} ms");
                        LInfo(cid, $"DONE in {swAll.ElapsedMilliseconds} ms");
                        return htmlWV2;
                    }

                    if (attempt == maxTry)
                    {
                        LWarn(cid, "Max attempts reached after 403/429.");
                        break;
                    }

                    var backoff = TimeSpan.FromMilliseconds(400 * Math.Pow(2, attempt - 1) + _rng.Next(0, 200));
                    LInfo(cid, $"Backoff {backoff.TotalMilliseconds:F0} ms before retry");
                    await Task.Delay(backoff, ct);
                    continue;
                }

                // ---- Erfolgreich (200er): Body lesen ----
                try
                { resp.EnsureSuccessStatusCode(); }
                catch (Exception ex)
                {
                    LError(cid, $"EnsureSuccessStatusCode failed ({code}).", ex);
                    throw;
                }

                var bytes = await resp.Content.ReadAsByteArrayAsync(ct);
                var enc = Encoding.UTF8;
                var charset = resp.Content.Headers.ContentType?.CharSet;
                if (!string.IsNullOrWhiteSpace(charset))
                {
                    try
                    { enc = Encoding.GetEncoding(charset); }
                    catch { }
                }
                var result = enc.GetString(bytes);

                // NEU: Body-Heuristik – Turnstile/Challenge erkannt?
                if (BodyLooksLikeChallenge(result))
                {
                    LWarn(cid, "Body indicates Cloudflare challenge → open interactive solve.");
                    var solved = await WebView2HtmlFetcher.SolveCloudflareInteractivelyAsync(url);
                    if (solved)
                    {
                        var warm = await WebView2HtmlFetcher.WarmUpCookiesAsync(url, _cookies, TimeSpan.FromSeconds(45), _logger, cid);
                        LInfo(cid, $"Interactive solve finished from body-scan; cookies imported={warm}. Retrying HTTP.");
                        await Task.Delay(600, ct);
                        attempt--;
                        continue;
                    }

                    // Wenn nicht gelöst → versuche WV2 capture
                    LWarn(cid, "Interactive solve not completed → WV2 capture after body-scan.");
                    var htmlWV = await WebView2HtmlFetcher.FetchHtmlAsync(url, TimeSpan.FromSeconds(45), _logger, cid);
                    if (!string.IsNullOrEmpty(htmlWV))
                    {
                        _jsFallbackHosts[host] = 1;
                        LInfo(cid, $"WV2 success after body-scan");
                        LInfo(cid, $"DONE in {swAll.ElapsedMilliseconds} ms");
                        return htmlWV;
                    }
                }

                LInfo(cid, $"HTTP success; payload {result.Length} chars, total {swAll.ElapsedMilliseconds} ms");
                return result;
            }
        }

        // Letzte Chance – nur einmal!
        LWarn(cid, "Exhausted HTTP attempts; try final WV2 fallback.");
        var swFinal = Stopwatch.StartNew();
        var html = await WebView2HtmlFetcher.FetchHtmlAsync(url, TimeSpan.FromSeconds(45), _logger, cid);
        swFinal.Stop();
        if (!string.IsNullOrEmpty(html))
        {
            _jsFallbackHosts[host] = 1;
            LInfo(cid, $"Final WV2 success in {swFinal.ElapsedMilliseconds} ms; total {swAll.ElapsedMilliseconds} ms");
            return html;
        }

        var msg = "HTTP 403/429/5xx and WebView2 fallback failed";
        LError(cid, msg);
        throw new HttpRequestException(msg);
    }

    public void Dispose() => _http?.Dispose();

    /// <summary>Fallback-Logger</summary>
    private sealed class DummyLogger : ILogger
    {
        public static readonly DummyLogger Instance = new();
        public IDisposable BeginScope<TState>(TState state) => NullDisp.Instance;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            try
            {
                var msg = formatter(state, exception);
                var ex = exception != null ? " " + exception : "";
                var line = $"[{logLevel}] {msg}{ex}";
                System.Diagnostics.Debug.WriteLine($"{DateTime.Now:HH:mm:ss.fff} {line}");
                LogFile.WriteFetcher(line);
            }
            catch { }
        }

        private sealed class NullDisp : IDisposable { public static readonly NullDisp Instance = new(); public void Dispose() { } }
    }
}
