using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.Web.WebView2.Core;

namespace MangaTracker.Services.Adblock
{
    // Grobe Ressourcentypen (aus WebView2 gemappt)
    public enum ResType { Script, Image, Media, Stylesheet, Xhr, Fetch, Subdocument, Font, Other }

    /// <summary>
    /// Dünner Wrapper um eine (hier vereinfachte) Filter-Engine.
    /// => Kein First-Party-Bypass mehr! Die Entscheidung trifft die Engine/Heuristik.
    /// </summary>
    public sealed class AdblockService
    {
        private readonly IAdblockEngine _engine;

        public AdblockService(IEnumerable<string> filterFiles)
        {
            // Optional: Einfache Patterns aus externen Listen aufnehmen (ohne ABP-Syntax)
            var patterns = new List<string>();
            foreach (var path in filterFiles)
            {
                if (!File.Exists(path)) continue;
                foreach (var raw in File.ReadAllLines(path))
                {
                    var line = raw.Trim();
                    if (string.IsNullOrEmpty(line)) continue;
                    if (line.StartsWith("!")) continue;          // Kommentar
                    if (line.Contains("##")) continue;           // kosmetische Regel
                    if (line.StartsWith("@@")) continue;         // Ausnahme -> ignorieren wir hier
                    patterns.Add(line);
                }
            }

            _engine = new SimpleEngine(patterns);
        }

        public bool ShouldBlock(string resourceUrl, string documentUrl, ResType type, bool isThirdParty)
        {
            var elType = type switch
            {
                ResType.Script      => ElementType.Script,
                ResType.Image       => ElementType.Image,
                ResType.Media       => ElementType.Media,
                ResType.Stylesheet  => ElementType.Stylesheet,
                ResType.Xhr         => ElementType.XmlHttpRequest,
                ResType.Fetch       => ElementType.XmlHttpRequest,
                ResType.Subdocument => ElementType.Subdocument,
                ResType.Font        => ElementType.Font,
                _                   => ElementType.Other
            };

            return _engine.ShouldBlock(new AdblockRequest
            {
                Url         = resourceUrl,
                DocumentUrl = documentUrl,
                ElementType = elType,
                ThirdParty  = isThirdParty
            });
        }

        public static ResType MapContext(CoreWebView2WebResourceContext ctx) => ctx switch
        {
            CoreWebView2WebResourceContext.Script          => ResType.Script,
            CoreWebView2WebResourceContext.Image           => ResType.Image,
            CoreWebView2WebResourceContext.Media           => ResType.Media,
            CoreWebView2WebResourceContext.Stylesheet      => ResType.Stylesheet,
            CoreWebView2WebResourceContext.XmlHttpRequest  => ResType.Xhr,
            CoreWebView2WebResourceContext.Fetch           => ResType.Fetch,
            CoreWebView2WebResourceContext.Font            => ResType.Font,
            CoreWebView2WebResourceContext.Document        => ResType.Other, // separat behandelt
            _                                              => ResType.Other
        };

        public static bool IsThirdParty(string resourceUrl, string documentUrl)
        {
            try
            {
                var r = new Uri(resourceUrl);
                var d = new Uri(documentUrl);
                return !IsSameSite(r.Host, d.Host);
            }
            catch { return true; }
        }

        private static bool IsSameSite(string a, string b)
        {
            if (a.Equals(b, StringComparison.OrdinalIgnoreCase)) return true;
            return a.EndsWith("." + b, StringComparison.OrdinalIgnoreCase)
                || b.EndsWith("." + a, StringComparison.OrdinalIgnoreCase);
        }
    }

    // --------- einfache Engine (ohne ABP-Syntax, aber mit soliden Heuristiken) ---------

    public enum ElementType { Script, Image, Media, Stylesheet, XmlHttpRequest, Subdocument, Font, Other }

    public sealed class AdblockRequest
    {
        public string Url { get; set; } = "";
        public string DocumentUrl { get; set; } = "";
        public ElementType ElementType { get; set; }
        public bool ThirdParty { get; set; }
    }

    public interface IAdblockEngine
    {
        bool ShouldBlock(AdblockRequest req);
    }

    /// <summary>
    /// Sehr leichte Heuristik-Engine:
    ///  - blockt bekannte Ad-/Tracking-Domains
    ///  - blockt offensichtliche /ad(s)/-Pfade, query ?ad=
    ///  - blockt Subdocument/IFRAME von typischen Ad-Hosts
    /// </summary>
    internal sealed class SimpleEngine : IAdblockEngine
    {
        private readonly string[] _knownHosts =
        {
            "doubleclick.net", "googlesyndication.com", "google-analytics.com",
            "adservice.google", "pubadx.one", "infolinks.com", "monetixads.com",
            "adnxs.com", "advertising.com", "criteo.com", "taboola.com", "outbrain.com"
        };

        private readonly string[] _hostPatterns;

        public SimpleEngine(IEnumerable<string> extraPatterns)
        {
            _hostPatterns = extraPatterns
                .Select(s => s.Trim('*', '|', '^', ' '))
                .Where(s => s.Contains('.'))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public bool ShouldBlock(AdblockRequest req)
        {
            var u = req.Url.ToLowerInvariant();

            // offensichtliche Ad-Pfade & Query
            if (u.Contains("/ads/") || u.Contains("/ad/") || u.Contains("?ad=") || u.Contains("&ad="))
                return true;

            // bekannte Hosts
            if (_knownHosts.Any(h => u.Contains(h)))
                return true;

            if (_hostPatterns.Any(p => u.Contains(p, StringComparison.OrdinalIgnoreCase)))
                return true;

            // Subdocument/IFRAME von verdächtigen Hosts blocken aggressiver
            if (req.ElementType == ElementType.Subdocument &&
                (_knownHosts.Any(u.Contains) || _hostPatterns.Any(p => u.Contains(p, StringComparison.OrdinalIgnoreCase))))
                return true;

            return false;
        }
    }
}
