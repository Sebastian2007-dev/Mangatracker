using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using HtmlAgilityPack;
using Microsoft.Win32;
using System.Windows.Controls.Primitives;
using MangaTracker.Services.Logging; // für ButtonBase
using Debug = System.Diagnostics.Trace;
using System.Net.Http.Headers;
using MangaTracker.Services.ChapterTracking;
using System.Text; // WebView2HtmlFetcher


namespace MangaTracker
{
    public partial class MainWindow : Window
    {
        // Falls du httpClient nicht global nutzt, kannst du ihn löschen. Ich nutze unten einen
        // lokalen Client mit Handler (für GZip + Header). Lasse ihn hier stehen, falls du ihn
        // anderswo verwendest.
        private static readonly HttpClient httpClient = new HttpClient();

        private ObservableCollection<MangaEntry> AllMangas = new();
        private readonly ObservableCollection<MangaEntry> MangaListItems = new();
        private static string GetDataDirectory()
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MangaTracker");
            Directory.CreateDirectory(dir);
            return dir;
        }
        private static readonly string DataFilePath = Path.Combine(GetDataDirectory(), "mangaliste.json");
        private const string LegacyDataFileName = "mangaliste.json"; // working directory fallback
        private MangaEntry? lastDeleted = null;
        private string _currentStatusFilter = "All";
        private readonly Stack<(MangaEntry Item, int Index)> _deletedStack = new();

        public MainWindow()
        {
            InitializeComponent();
            System.Diagnostics.Trace.Listeners.Clear();
            System.Diagnostics.Trace.Listeners.Add(new MangaTracker.Services.Logging.DebugTraceListener());
            DebugLog.Info("MangaTracker gestartet.");
            MangaList.ItemsSource = MangaListItems;

            LoadMangaList();
            AppSettings.Load();
            HostStrategy.InitializeFromSettings();


            // Tabs initial
            StatusTabs.SelectedIndex = 0;
            _currentStatusFilter = "All";
            ApplyFilter();

            this.Closing += MainWindow_Closing;

            // Theme laden
            if (File.Exists("theme.txt"))
            {
                string theme = File.ReadAllText("theme.txt").Trim().ToLowerInvariant();
                string target = theme switch
                {
                    "dark" => "Dark",
                    "system" => "System",
                    _ => "Light"
                };

                var item = ThemeSelector.Items
                    .OfType<ComboBoxItem>()
                    .FirstOrDefault(i => string.Equals(i.Content?.ToString(), target, StringComparison.OrdinalIgnoreCase));
                ThemeSelector.SelectedItem = item
                    ?? ThemeSelector.Items.OfType<ComboBoxItem>().FirstOrDefault()
                    ?? (ThemeSelector.Items.Count > 0 ? ThemeSelector.Items[0] : null);
            }
            else
            {
                var item = ThemeSelector.Items
                    .OfType<ComboBoxItem>()
                    .FirstOrDefault(i => string.Equals(i.Content?.ToString(), "System", StringComparison.OrdinalIgnoreCase));
                ThemeSelector.SelectedItem = item ?? (ThemeSelector.Items.Count > 0 ? ThemeSelector.Items[0] : null);
            }

            // Hintergrundprüfung
            CheckForAllUpdatesAsync();
        }

        public void RescanAll()
        {
            CheckForAllUpdatesAsync();
        }


        private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            foreach (Window win in Application.Current.Windows)
            {
                if (win is BrowserWindow bw)
                    bw.Close();
            }
            SaveMangaList();
        }

        // ---------------------------
        // Update-Scanner (robust)
        // ---------------------------

        private async void CheckForAllUpdatesAsync()
        {
            DebugLog.Info("--- Starte Prüfung auf neue Kapitel für alle Einträge ---");
            var updatedMangaTitles = new List<string>();

            foreach (var manga in AllMangas.ToList())
            {
                try
                {
                    if (manga.HasNewChapter)
                        continue;
                    if (string.IsNullOrWhiteSpace(manga.Url))
                        continue;

                    DebugLog.Info($"Check: '{manga.Title}' @ {manga.Url}");

                    // Unauffälliger Schnell-Check über ChapterUrlTemplate
                    if (!string.IsNullOrWhiteSpace(manga.ChapterUrlTemplate) && manga.ChapterUrlTemplate.Contains("$chapter"))
                    {
                        try
                        {
                            if (await TryProbeNextChapterAsync(manga))
                            {
                                Debug.WriteLine($"Probe-Check: Neues Kapitel für '{manga.Title}' erkannt.");
                                Dispatcher.Invoke(() => { manga.HasNewChapter = true; });
                                updatedMangaTitles.Add(manga.Title);
                                continue;
                            }
                        }
                        catch (Exception ex)
                        {
                            DebugLog.Warn($"Probe-Check für '{manga.Title}' fehlgeschlagen: {ex.Message}");
                        }
                    }

                    var html = await GetHtmlAsync(manga.Url);
                    DebugLog.Info($"OK: HTML geladen ({html.Length} chars) - {manga.Title}");

                    var doc = new HtmlAgilityPack.HtmlDocument();
                    doc.LoadHtml(html);

                    // >>> NEU: pageUrl an ExtractLatestChapter übergeben
                    var latest = ExtractLatestChapter(doc, manga.LatestChapterXPath, manga.ChapterNumberRegex, manga.Url);
                    if (latest.HasValue)
                        DebugLog.Info($"Gefunden: neuestes Kapitel = {latest.Value} – {manga.Title}");

                    if (latest.HasValue && latest.Value > manga.Chapter)
                    {
                        Debug.WriteLine($"Neues Kapitel für '{manga.Title}': {latest} (vorher {manga.Chapter})");
                        Dispatcher.Invoke(() =>
                        {
                            manga.HasNewChapter = true;
                            if (Math.Abs(latest.Value - (manga.Chapter + 1)) < 0.0001)
                                manga.Chapter = (int)Math.Floor(latest.Value);
                        });
                        updatedMangaTitles.Add(manga.Title);
                    }
                }
                catch (HttpRequestException ex)
                {
                    DebugLog.Warn($"HTTP-Fehler bei '{manga.Title}': {ex.Message}");
                }
                catch (Exception ex)
                {
                    DebugLog.Error($"Fehler bei '{manga.Title}': {ex.Message}");
                }
            }

            if (updatedMangaTitles.Any())
            {
                DebugLog.Info($"Neue Kapitel: {string.Join(", ", updatedMangaTitles)}");
                MessageBox.Show(
                    "Neue Kapitel gefunden für:\n\n- " + string.Join("\n- ", updatedMangaTitles),
                    "Updates verfügbar",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
                SaveMangaList();
            }
            else
            {
                DebugLog.Info("Keine neuen Kapitel gefunden.");
            }

            DebugLog.Info("--- Prüfung abgeschlossen ---");
        }



        // HTTP: eigener Client pro Call mit Handler (GZip/Deflate) + Headers
        private static string BuildChapterUrl(string template, double chapter)
        {
            string num = (Math.Abs(chapter % 1.0) < 0.0001)
                ? ((int)Math.Round(chapter)).ToString(System.Globalization.CultureInfo.InvariantCulture)
                : chapter.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
            return template.Replace("$chapter", num);
        }

        // Challenge-Heuristik existiert bereits weiter unten als Methode mit gleicher Signatur

        private async Task<bool> TryProbeNextChapterAsync(MangaEntry manga)
        {
            if (string.IsNullOrWhiteSpace(manga.ChapterUrlTemplate) || !manga.ChapterUrlTemplate.Contains("$chapter"))
                return false;

            double next = Math.Floor((double)manga.Chapter) + 1;
            var url = BuildChapterUrl(manga.ChapterUrlTemplate, next);

            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli
            };
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(10) };
            client.DefaultRequestHeaders.Clear();
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language",
                "de-DE,de;q=0.7,en-US;q=0.6,en;q=0.5");
            client.DefaultRequestHeaders.AcceptEncoding.Add(new System.Net.Http.Headers.StringWithQualityHeaderValue("gzip"));
            client.DefaultRequestHeaders.AcceptEncoding.Add(new System.Net.Http.Headers.StringWithQualityHeaderValue("deflate"));
            client.DefaultRequestHeaders.AcceptEncoding.Add(new System.Net.Http.Headers.StringWithQualityHeaderValue("br"));
            client.DefaultRequestHeaders.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");

            // HEAD
            using (var head = new HttpRequestMessage(HttpMethod.Head, url))
            {
                head.Version = System.Net.HttpVersion.Version20;
                head.VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher;
                try { head.Headers.Referrer = new Uri(new Uri(url).GetLeftPart(UriPartial.Authority) + "/"); } catch { }

                try
                {
                    using var resp = await client.SendAsync(head, HttpCompletionOption.ResponseHeadersRead);
                    if ((int)resp.StatusCode >= 200 && (int)resp.StatusCode < 300)
                        return true;
                    if ((int)resp.StatusCode == 301 || (int)resp.StatusCode == 302 || (int)resp.StatusCode == 303 || (int)resp.StatusCode == 307 || (int)resp.StatusCode == 308)
                        return true;
                    if (LooksLikeJsChallenge(resp))
                        return false;
                    if (resp.StatusCode != HttpStatusCode.MethodNotAllowed && resp.StatusCode != HttpStatusCode.Forbidden && (int)resp.StatusCode != 429)
                        return false;
                }
                catch { }
            }

            // GET mit Range
            using (var get = new HttpRequestMessage(HttpMethod.Get, url))
            {
                get.Version = System.Net.HttpVersion.Version20;
                get.VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher;
                try { get.Headers.Referrer = new Uri(new Uri(url).GetLeftPart(UriPartial.Authority) + "/"); } catch { }
                get.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(0, 1024);

                try
                {
                    using var resp = await client.SendAsync(get, HttpCompletionOption.ResponseHeadersRead);
                    if ((int)resp.StatusCode >= 200 && (int)resp.StatusCode < 300)
                        return true;
                    if ((int)resp.StatusCode == 301 || (int)resp.StatusCode == 302 || (int)resp.StatusCode == 303 || (int)resp.StatusCode == 307 || (int)resp.StatusCode == 308)
                        return true;
                    if (LooksLikeJsChallenge(resp))
                        return false;
                    return false;
                }
                catch { return false; }
            }
        }
        private async Task<string> GetHtmlAsync(string rawUrl)
        {
            string url = NormalizeUrl(rawUrl);
            var uri = new Uri(url);
            string host = uri.Host.ToLowerInvariant();

            // JS-only Hosts im Hintergrund: kein WV2, kein Fenster
            if (HostStrategy.IsJsOnly(host))
            {
                DebugLog.Info($"Host '{host}' ist JS-only – Hintergrund-Fetch wird übersprungen (keine Fenster).");
                throw new HttpRequestException("JS-only host; background fetch disabled");
            }

            #if false
            // 0) Gelernte JS-only Hosts: direkt WV2 mit Warmup + Retry
            if (HostStrategy.IsJsOnly(host))
            {
                DebugLog.Info($"Host '{host}' ist JS-only → direkt WebView2 (Warmup+Retry)");
                var htmlWV0 = await MangaTracker.Services.ChapterTracking.WebView2HtmlFetcher.FetchHtmlAsync(
                    url,
                    timeout: TimeSpan.FromSeconds(60),
                    logger: null,
                    cid: null,
                    warmupOriginFirst: true,
                    overrideUserAgent: null,
                    retryOnFail: 1
                );
                if (!string.IsNullOrEmpty(htmlWV0))
                    return htmlWV0;

                DebugLog.Warn($"WV2 (direkt) gab null zurück – versuche HTTP für {host}");
                // Fällt dann in den normalen HTTP-Flow weiter unten
            }
            #endif

            DebugLog.Info($"HTTP GET {url}");

            var handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli
            };
            using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(25) };

            client.DefaultRequestHeaders.Clear();
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language",
                "de-DE,de;q=0.7,en-US;q=0.6,en;q=0.5");
            client.DefaultRequestHeaders.AcceptEncoding.Add(new System.Net.Http.Headers.StringWithQualityHeaderValue("gzip"));
            client.DefaultRequestHeaders.AcceptEncoding.Add(new System.Net.Http.Headers.StringWithQualityHeaderValue("deflate"));
            client.DefaultRequestHeaders.AcceptEncoding.Add(new System.Net.Http.Headers.StringWithQualityHeaderValue("br"));
            client.DefaultRequestHeaders.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");

            using var req = new HttpRequestMessage(HttpMethod.Get, url)
            {
                Version = System.Net.HttpVersion.Version20,
                VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher
            };
            try
            { req.Headers.Referrer = new Uri(uri.GetLeftPart(UriPartial.Authority) + "/"); }
            catch { }

            HttpResponseMessage resp;
            try
            {
                resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
            }
            catch (HttpRequestException ex)
            {
                DebugLog.Warn($"HTTP-Ausnahme bei {host}: {ex.Message} → WV2-Fallback (Warmup+Retry)");
                // → WV2 (voller Render) mit Warmup zuerst
#if false
                var htmlWV = await MangaTracker.Services.ChapterTracking.WebView2HtmlFetcher.FetchHtmlAsync(
                    url,
                    timeout: TimeSpan.FromSeconds(60),
                    logger: null,
                    cid: null,
                    warmupOriginFirst: true,
                    overrideUserAgent: null,
                    retryOnFail: 1
                );
                if (!string.IsNullOrEmpty(htmlWV))
                {
                    DebugLog.Info($"WV2 OK (len={htmlWV.Length}) - {host}");
                    HostStrategy.MarkJsOnly(host);
                    return htmlWV;
                }
#endif
                throw; // sonst hochreichen
            }

            using (resp)
            {
                DebugLog.Info($"HTTP {(int)resp.StatusCode} {resp.ReasonPhrase} – {url}");

                bool LooksLikeJsChallenge(HttpResponseMessage r)
                {
                    static bool Has(System.Net.Http.Headers.HttpResponseHeaders h, string name) => h.TryGetValues(name, out _);
                    var server = string.Join(" ", r.Headers.Server.Select(v => v.ToString())).ToLowerInvariant();
                    return r.StatusCode == HttpStatusCode.Forbidden ||             // 403
                           (int)r.StatusCode == 429 ||                             // Rate limit
                           server.Contains("cloudflare") ||
                           server.Contains("ddos") ||
                           server.Contains("sucuri") ||
                           Has(r.Headers, "cf-ray") ||
                           Has(r.Headers, "cf-cache-status") ||
                           Has(r.Headers, "x-sucuri-id");
                }

                if (LooksLikeJsChallenge(resp))
                {
                    DebugLog.Warn($"JS/AntiBot erkannt für {host} – Hintergrund-Fetch abgebrochen (kein WV2).");
                    throw new HttpRequestException("AntiBot/Challenge detected; background fetch disabled");
                    DebugLog.Warn($"JS/AntiBot erkannt für {host} → WV2-HTML-Capture (Warmup+Retry) + Persistenz");

                    // 1) WV2 (voller Render) direkt (mit Warmup + optionalem Retry)
                    var htmlWV = await MangaTracker.Services.ChapterTracking.WebView2HtmlFetcher.FetchHtmlAsync(
                        url,
                        timeout: TimeSpan.FromSeconds(60),
                        logger: null,
                        cid: null,
                        warmupOriginFirst: true,
                        overrideUserAgent: null,
                        retryOnFail: 1
                    );
                    if (!string.IsNullOrEmpty(htmlWV))
                    {
                        DebugLog.Info($"WV2 OK (len={htmlWV.Length}) – {host}");
                        HostStrategy.MarkJsOnly(host);
                        return htmlWV;
                    }

                    // 2) Wenn WV2 null (extrem striktes Setup): Cookie-Warmup + HTTP als Zwischenschritt
                    var warmed = await MangaTracker.Services.ChapterTracking.WebView2HtmlFetcher
                        .WarmUpCookiesAsync(url, new System.Net.CookieContainer(), TimeSpan.FromSeconds(60));
                    DebugLog.Info($"WarmUpCookies result: {warmed}");

                    // HTTP nach Warmup nochmal probieren
                    using var req2 = new HttpRequestMessage(HttpMethod.Get, url)
                    {
                        Version = System.Net.HttpVersion.Version20,
                        VersionPolicy = HttpVersionPolicy.RequestVersionOrHigher
                    };
                    try
                    { req2.Headers.Referrer = new Uri(uri.GetLeftPart(UriPartial.Authority) + "/"); }
                    catch { }

                    using var resp2 = await client.SendAsync(req2, HttpCompletionOption.ResponseHeadersRead);
                    DebugLog.Info($"HTTP (nach Warmup) {(int)resp2.StatusCode} {resp2.ReasonPhrase} – {url}");
                    if (resp2.IsSuccessStatusCode)
                    {
                        var bytes2 = await resp2.Content.ReadAsByteArrayAsync();
                        var enc2 = Encoding.UTF8;
                        var charset2 = resp2.Content.Headers.ContentType?.CharSet;
                        if (!string.IsNullOrWhiteSpace(charset2))
                        {
                            try
                            { enc2 = Encoding.GetEncoding(charset2); }
                            catch { }
                        }
                        var html2 = enc2.GetString(bytes2);
                        DebugLog.Info($"OK: HTML geladen ({html2.Length} chars) – {host}");
                        HostStrategy.MarkJsOnly(host); // beim nächsten Mal direkt WV2
                        return html2;
                    }

                    // 3) Letzter Versuch: noch einmal WV2, diesmal mit Mobile-UA + längerem Timeout
                    DebugLog.Warn("HTTP nach Warmup weiterhin blockiert → WV2 mit Mobile-UA als letzter Versuch");
                    var htmlWV2 = await MangaTracker.Services.ChapterTracking.WebView2HtmlFetcher.FetchHtmlAsync(
                        url,
                        timeout: TimeSpan.FromSeconds(75),
                        logger: null,
                        cid: null,
                        warmupOriginFirst: true,
                        overrideUserAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
                        retryOnFail: 1
                    );
                    if (!string.IsNullOrEmpty(htmlWV2))
                    {
                        DebugLog.Info($"WV2 OK (Mobile-UA) (len={htmlWV2.Length}) – {host}");
                        HostStrategy.MarkJsOnly(host);
                        return htmlWV2;
                    }

                    // alles gescheitert → klare Exception
                    resp.EnsureSuccessStatusCode();
                }

                // Kein Challenge-Fall → normal lesen
                resp.EnsureSuccessStatusCode();
                var bytes = await resp.Content.ReadAsByteArrayAsync();
                var enc = Encoding.UTF8;
                var charset = resp.Content.Headers.ContentType?.CharSet;
                if (!string.IsNullOrWhiteSpace(charset))
                {
                    try
                    { enc = Encoding.GetEncoding(charset); }
                    catch { }
                }
                var html = enc.GetString(bytes);
                DebugLog.Info($"OK: HTML geladen ({html.Length} chars) – {host}");
                return html;
            }
        }





        // mögliche Strukturen (inkl. Madara)
        private static readonly string[] ChapterLinkXPaths =
        {
            // Madara (häufig)
            "//li[contains(@class,'wp-manga-chapter')][1]//a",
            "//ul[contains(@class,'main') or contains(@class,'version-chap')]/li[1]//a",
            "//div[contains(@class,'list-update') or contains(@class,'chapter')][1]//a",

            // generisch
            "//ul[contains(@class,'chap') or contains(@class,'chapter') or contains(@class,'episode')]/li[1]//a",
            "//div[contains(@class,'chapter') or contains(@class,'eplist')]//a[1]",
            "//div[contains(@class,'chapters') or contains(@class,'list')]//li[1]//a",
            "(//a[contains(translate(@href,'CHAPTER','chapter'),'chapter')])[1]",
            "(//a[contains(translate(normalize-space(.),'CHAPTER','chapter'),'chapter')])[1]"
        };

        // Signatur erweitert um pageUrl (optional für Backwards-Compat)
        // Overload für alte Aufrufe (Backwards-Compat)
        // Backwards-Compat: alte 3-Parameter-Signatur ruft neue auf
        private static double? ExtractLatestChapter(HtmlAgilityPack.HtmlDocument doc, string? customXPath, string? customRegex)
            => ExtractLatestChapter(doc, customXPath, customRegex, pageUrl: null);

        // Neue Signatur mit pageUrl, sauber abgeschlossen
        private static double? ExtractLatestChapter(HtmlAgilityPack.HtmlDocument doc, string? customXPath, string? customRegex, string? pageUrl)
        {
            var candidates = new System.Collections.Generic.List<(double val, string src)>();

            bool IsSameSeriesChapterLink(string href)
            {
                if (string.IsNullOrWhiteSpace(pageUrl) || string.IsNullOrWhiteSpace(href))
                    return true; // ohne pageUrl nicht filtern (Kompatibilität)

                try
                {
                    var page = new Uri(pageUrl);
                    var abs = new Uri(page, href);

                    if (!string.Equals(abs.Host, page.Host, StringComparison.OrdinalIgnoreCase))
                        return false;

                    // gleicher Serienpfad?
                    var seriesPrefix = page.AbsolutePath.TrimEnd('/') + "/";
                    var path = abs.AbsolutePath;

                    bool sameSeries = path.StartsWith(seriesPrefix, StringComparison.OrdinalIgnoreCase);
                    bool looksLikeChapterPath =
                        path.IndexOf("/chapter", seriesPrefix.Length, StringComparison.OrdinalIgnoreCase) >= 0 ||
                        System.Text.RegularExpressions.Regex.IsMatch(path, @"[\/\-_](?:ch|chap|chapter)[\-_]?\d", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                    return sameSeries && looksLikeChapterPath;
                }
                catch { return false; }
            }

            void AddFromNodes(HtmlAgilityPack.HtmlNodeCollection? nodes, string srcTag)
            {
                if (nodes == null || nodes.Count == 0)
                    return;

                foreach (var n in nodes)
                {
                    var href = n.GetAttributeValue("href", string.Empty);
                    if (!IsSameSeriesChapterLink(href))
                    {
                        DebugLog.Trace($"[chap-skip] fremde/inkonsistente URL: {href}");
                        continue;
                    }

                    var txt = n.InnerText ?? string.Empty;

                    // streng keyword-gebunden (verhindert nackte Zahlen wie „2025“)
                    var v = ParseChapterNumber(txt, customRegex, strictOnly: true)
                         ?? ParseChapterNumber(href, customRegex, strictOnly: true);

                    if (v is double d && d > 0 && d <= 20000)
                    {
                        candidates.Add((d, srcTag));
                        // optional: kürzen für Log
                        string shortHref = href.Length <= 120 ? href : href.Substring(0, 120) + "…";
                        DebugLog.Trace($"[chap-cand] {d} src={srcTag} href={shortHref}");
                    }
                }
            }

            // 0) Benutzerdefinierter XPath zuerst
            if (!string.IsNullOrWhiteSpace(customXPath))
                AddFromNodes(doc.DocumentNode.SelectNodes(customXPath), "custom");

            // 1) Häufige Kapitelcontainer (Madara & Co.)
            string[] xps =
            {
        "//li[contains(@class,'wp-manga-chapter')]//a",
        "//div[contains(@class,'chapter-list')]//a",
        "//div[contains(@class,'listing-chapters_wrap')]//a",
        "//div[contains(@class,'eplist')]//a",
        "//div[contains(@class,'chapters') or contains(@class,'list')]//a",
        "//a[contains(translate(@href,'CHAPTER','chapter'),'chapter') or contains(translate(normalize-space(.),'CHAPTER','chapter'),'chapter')]"
    };
            foreach (var xp in xps)
                AddFromNodes(doc.DocumentNode.SelectNodes(xp), xp);

            // Kein globaler //a-Fallback mehr → verhindert „756“/„2025“ durch Fremd-Widgets

            if (candidates.Count == 0)
                return null;

            var max = candidates.Max(c => c.val);
            DebugLog.Trace($"[chap-best] gewählt={max}");
            return max;
        }





        private static double? ParseChapterNumber(string input, string? customRegex = null, bool strictOnly = false)
        {
            if (string.IsNullOrWhiteSpace(input))
                return null;

            if (!string.IsNullOrWhiteSpace(customRegex))
            {
                var mm = System.Text.RegularExpressions.Regex.Matches(input, customRegex, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                double best = -1;
                foreach (System.Text.RegularExpressions.Match m in mm)
                {
                    for (int i = m.Groups.Count - 1; i >= 1; i--)
                    {
                        var g = m.Groups[i].Value;
                        if (!string.IsNullOrWhiteSpace(g) &&
                            double.TryParse(g, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var dd))
                            best = Math.Max(best, dd);
                    }
                }
                if (best > 0)
                    return best;
                if (strictOnly && mm.Count == 0)
                    return null;
            }

            static bool TryNum(string s, out double d) =>
                double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d) && d > 0 && d <= 20000;

            // a) keyword vor Zahl
            {
                var m = System.Text.RegularExpressions.Regex.Matches(input,
                    @"(?:(?:^|[\s\-_\/\[\(]))(?:chapter|chap|ch|episode|ep|kapitel)\s*[:#\-]?\s*(\d+(?:\.\d+)?)\b",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                double best = -1;
                foreach (System.Text.RegularExpressions.Match x in m)
                    if (TryNum(x.Groups[1].Value, out var d))
                        best = Math.Max(best, d);
                if (best > 0)
                    return best;
            }

            // b) Zahl vor keyword
            {
                var m = System.Text.RegularExpressions.Regex.Matches(input,
                    @"\b(\d+(?:\.\d+)?)\s*[:#\-]?\s*(?:chapter|chap|ch|episode|ep|kapitel)\b",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                double best = -1;
                foreach (System.Text.RegularExpressions.Match x in m)
                    if (TryNum(x.Groups[1].Value, out var d))
                        best = Math.Max(best, d);
                if (best > 0)
                    return best;
            }

            // c) URL-typisch: /chapter-123/ usw.
            {
                var m = System.Text.RegularExpressions.Regex.Matches(input,
                    @"(?:^|[\/\-_])(?:chapter|chap|ch)(?:[\/\-_]*)(\d+(?:\.\d+)?)(?:[\/\-_]|$)",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                double best = -1;
                foreach (System.Text.RegularExpressions.Match x in m)
                    if (TryNum(x.Groups[1].Value, out var d))
                        best = Math.Max(best, d);
                if (best > 0)
                    return best;
            }

            // d) Query-Param
            {
                var m = System.Text.RegularExpressions.Regex.Match(input, @"[?&](?:chapter|ch|ep)=(\d+(?:\.\d+)?)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (m.Success && TryNum(m.Groups[1].Value, out var d))
                    return d;
            }

            // Kein nacktes Zahl-Fallback!
            return null;
        }





        // ---------------------------
        // UI-Hanlder & Liste
        // ---------------------------

        private void AddManga_Click(object sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrWhiteSpace(TitleBox.Text))
            {
                string selectedStatus = (StatusBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Reading";
                AllMangas.Add(new MangaEntry
                {
                    Title = TitleBox.Text,
                    Url = UrlBox.Text,
                    Chapter = 1,
                    Status = selectedStatus,
                    ChapterUrlTemplate = ChapterUrlBox.Text,
                });
                ChapterUrlBox.Clear();
                TitleBox.Clear();
                UrlBox.Clear();
                StatusBox.SelectedIndex = 0;
                ApplyFilter();
                SaveMangaList();
            }
        }

        private void SettingsButton_Click(object sender, RoutedEventArgs e)
        {
            var settingsWindow = new SettingsWindow
            {

                Owner = this
            };
            settingsWindow.ShowDialog();
        }

        private void EditInline_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is MangaEntry manga)
            {
                var dialog = new EditDialog(manga) { Owner = this };
                dialog.ShowDialog();
                ApplyFilter();
                SaveMangaList();
            }
        }

        private void OpenLink_Inline_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is MangaEntry manga)
            {
                switch (AppSettings.LinkOpenBehavior)
                {
                    case LinkOpenMode.OpenChapter:
                        OpenChapterLink(manga);
                        return;
                    case LinkOpenMode.OpenMain:
                        OpenMainLink(manga);
                        return;
                    case LinkOpenMode.Ask:
                    default:
                        var dialog = new OpenLinkDialog(manga) { Owner = this };
                        dialog.ShowDialog();
                        switch (dialog.Result)
                        {
                            case OpenLinkDialog.LinkChoice.Chapter:
                                OpenChapterLink(manga);
                                break;
                            case OpenLinkDialog.LinkChoice.Main:
                                OpenMainLink(manga);
                                break;
                        }
                        break;
                }
            }
        }

        private async void OpenChapterLink(MangaEntry manga)
        {
            manga.HasNewChapter = false; // Reset beim Öffnen

            string? url = null;

            // 1) Versuche exakten Link live von der Serienseite
            try
            { url = await TryResolveChapterUrlAsync(manga); }
            catch { /* ignoriere */ }

            // 2) Fallback: Template mit $chapter
            if (url == null && !string.IsNullOrWhiteSpace(manga.ChapterUrlTemplate))
            {
                url = manga.ChapterUrlTemplate.Replace(
                    "$chapter",
                    manga.Chapter.ToString(CultureInfo.InvariantCulture)
                );
            }

            // 3) Wenn immer noch nichts: klar sagen statt das neueste Kapitel zu öffnen
            if (string.IsNullOrWhiteSpace(url))
            {
                MessageBox.Show(
                    $"Kapitel {manga.Chapter} konnte auf der Serienseite nicht gefunden werden und es ist kein gültiges Template hinterlegt.",
                    "Kapitel nicht gefunden",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning
                );
                return;
            }

            if (AppSettings.UseSystemBrowser)
            {
                try
                { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
                catch (Exception ex) { MessageBox.Show($"Fehler beim Öffnen des Links: {ex.Message}"); }
            }
            else
            {
                var browser = new BrowserWindow(manga, url);
                browser.Closed += (_, __) => SaveMangaList();
                browser.Show();
            }
        }



        private void OpenMainLink(MangaEntry manga)
        {
            manga.HasNewChapter = false; // Reset beim Öffnen
            if (!string.IsNullOrWhiteSpace(manga.Url))
            {
                if (AppSettings.UseSystemBrowser)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo(manga.Url) { UseShellExecute = true });
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Fehler beim Öffnen des Links: {ex.Message}");
                    }
                }
                else
                {
                    var browser = new BrowserWindow(manga, manga.Url);
                    browser.Closed += (_, __) => SaveMangaList();
                    browser.Show();
                }
            }
            else
            {
                MessageBox.Show("Keine Haupt-URL hinterlegt.");
            }
        }

        private void DeleteInline_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is MangaEntry manga)
            {
                int index = AllMangas.IndexOf(manga);
                if (index >= 0)
                {
                    // vor dem Entfernen auf den Stack
                    _deletedStack.Push((manga, index));
                    AllMangas.RemoveAt(index);
                    ApplyFilter();
                    SaveMangaList();
                    UpdateUndoButton();
                }
            }
        }


        private void UndoDelete_Click(object sender, RoutedEventArgs e)
        {
            if (_deletedStack.Count > 0)
            {
                var (item, index) = _deletedStack.Pop();

                // Index absichern (falls sich die Liste seitdem verkleinert hat)
                if (index < 0 || index > AllMangas.Count)
                    index = AllMangas.Count;

                AllMangas.Insert(index, item);
                ApplyFilter();
                SaveMangaList();
                UpdateUndoButton();
            }
            else
            {
                MessageBox.Show("Nichts zum Rückgängig machen.", "Info",
                    MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void UpdateUndoButton()
        {
            if (UndoButton != null)
            {
                var count = _deletedStack.Count;
                UndoButton.Content = count > 0
                    ? $"Rückgängig ({count})"
                    : "Löschen rückgängig machen";
                UndoButton.IsEnabled = count > 0;
            }
        }


private void ChapterUp_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is MangaEntry manga)
        {
            manga.Chapter++;
            SaveMangaList();
        }
    }

    private void ChapterDown_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is MangaEntry manga)
        {
            if (manga.Chapter > 1)
            {
                manga.Chapter--;
                SaveMangaList();
            }
        }
    }


    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            ApplyFilter();
        }

        private void StatusTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (StatusTabs?.SelectedItem is TabItem ti)
            {
                _currentStatusFilter = ti.Tag?.ToString() ?? "All";
                ApplyFilter();
            }
        }

        private void ApplyFilter()
        {
            string text = (SearchBox.Text ?? string.Empty).ToLowerInvariant();

            IEnumerable<MangaEntry> query = AllMangas;

            // Status-Filter aus Tabs
            if (!string.Equals(_currentStatusFilter, "All", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(m => string.Equals(m.Status, _currentStatusFilter, StringComparison.OrdinalIgnoreCase));
            }

            // Suchtext
            if (!string.IsNullOrWhiteSpace(text))
            {
                query = query.Where(m => (m.Title ?? string.Empty).ToLowerInvariant().Contains(text));
            }

            var filtered = query.ToList();

            MangaListItems.Clear();
            foreach (var item in filtered)
                MangaListItems.Add(item);
        }

        private void SaveMangaList()
        {
            var options = new JsonSerializerOptions { WriteIndented = true };
            try
            {
                File.WriteAllText(DataFilePath, JsonSerializer.Serialize(AllMangas, options));
            }
            catch
            {
                // Fallback to legacy path if LocalAppData fails
                try { File.WriteAllText(LegacyDataFileName, JsonSerializer.Serialize(AllMangas, options)); } catch { }
            }
        }

        private void LoadMangaList()
        {
            string? pathToLoad = null;
            if (File.Exists(DataFilePath))
                pathToLoad = DataFilePath;
            else if (File.Exists(LegacyDataFileName))
                pathToLoad = LegacyDataFileName;

            if (pathToLoad != null)
            {
                try
                {
                    var json = File.ReadAllText(pathToLoad);
                    var list = JsonSerializer.Deserialize<ObservableCollection<MangaEntry>>(json);
                    AllMangas = list ?? new ObservableCollection<MangaEntry>();
                }
                catch
                {
                    MessageBox.Show("Fehler beim Laden der gespeicherten Liste.", "Fehler",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }

        private void ThemeSelector_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (ThemeSelector.SelectedItem is ComboBoxItem item)
            {
                string theme = item.Content?.ToString() ?? "System";
                (Application.Current as App)?.ChangeTheme(theme);

                // Falls Theme-RDs Brushes bereitstellen:
                if (Application.Current.Resources["WindowBackgroundBrush"] is Brush bg)
                    this.Background = bg;
                if (Application.Current.Resources["TextBrush"] is Brush fg)
                    this.Foreground = fg;
            }
        }

        private void ExportButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new SaveFileDialog
            {
                Filter = "JSON-Datei (*.json)|*.json",
                FileName = "mangaliste_export.json"
            };
            if (dialog.ShowDialog() == true)
            {
                var options = new JsonSerializerOptions { WriteIndented = true };
                File.WriteAllText(dialog.FileName, JsonSerializer.Serialize(AllMangas, options));
            }
        }

        private void ImportButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog { Filter = "JSON-Datei (*.json)|*.json" };
            if (dialog.ShowDialog() == true)
            {
                try
                {
                    var json = File.ReadAllText(dialog.FileName);
                    var list = JsonSerializer.Deserialize<ObservableCollection<MangaEntry>>(json);
                    if (list != null)
                    {
                        AllMangas = list;
                        ApplyFilter();
                        SaveMangaList();
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Fehler beim Importieren: {ex.Message}",
                        "Fehler", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private static Uri ToAbsoluteUri(string baseUrl, string href)
        {
            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var b))
                return new Uri(href, UriKind.RelativeOrAbsolute);
            if (Uri.TryCreate(href, UriKind.Absolute, out var abs))
                return abs;
            return new Uri(b, href);
        }

        private async Task<string?> TryResolveChapterUrlAsync(MangaEntry manga)
        {
            if (string.IsNullOrWhiteSpace(manga.Url))
                return null;

            var html = await GetHtmlAsync(manga.Url);
            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            // Kandidaten sammeln (Madara zuerst, sonst alle Links)
            var nodes = doc.DocumentNode.SelectNodes("//li[contains(@class,'wp-manga-chapter')]//a")
                    ?? doc.DocumentNode.SelectNodes("//a");
            if (nodes == null || nodes.Count == 0)
                return null;

            // gewünschte Kapitelnummer als invariant-String
            string want = manga.Chapter.ToString(CultureInfo.InvariantCulture);

            // exakte Treffer: "chapter 123" / "ch-123" / "-chapter-123/" im href ODER im Text
            var exact = new Regex(
                $@"(?<!\d)(?:chapter|ch)[-_/\s]*{Regex.Escape(want)}(?!\d)",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

            foreach (var a in nodes)
            {
                var href = a.GetAttributeValue("href", "");
                var text = a.InnerText ?? "";

                if (exact.IsMatch(href) || exact.IsMatch(text))
                {
                    return ToAbsoluteUri(manga.Url, href).ToString();
                }
            }

            // KEIN Fallback auf höhere Kapitel hier!
            return null;
        }

        // irgendwo in der MainWindow-Klasse:
        private void OpenHelp_Click(object sender, RoutedEventArgs e)
        {
            var win = new HelpWindow { Owner = this };
            win.ShowDialog();
        }

        // Hilfe > Debug-Ausgaben
        private void OpenDebug_Click(object sender, RoutedEventArgs e)
        {
            var win = new DebugWindow { Owner = this };
            win.Show();
        }

        // Falls du Properties-Command (F12) gebunden hast:
        private void OpenDebug_Click(object sender, System.Windows.Input.ExecutedRoutedEventArgs e)
        {
            OpenDebug_Click(sender, (RoutedEventArgs)EventArgs.Empty);
        }

        private static string NormalizeUrl(string url)
        {
            url = (url ?? "").Trim();
            if (Uri.TryCreate(url, UriKind.Absolute, out _))
                return url;
            if (Uri.TryCreate("https://" + url, UriKind.Absolute, out var abs) && !string.IsNullOrEmpty(abs.Host))
                return abs.ToString();
            throw new ArgumentException($"Invalid absolute URL: '{url}'");
        }

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


    }
}
