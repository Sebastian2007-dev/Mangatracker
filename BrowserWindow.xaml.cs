using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Input;
using MangaTracker.Services.Adblock;

namespace MangaTracker
{
    public partial class BrowserWindow : Window
    {
        private readonly MangaEntry _trackedManga;
        private AdblockService? _adblock;
        private readonly CosmeticRuleStore _ruleStore = new();
        private bool _pickerOn;

        // Startdomain + Reentrancy-Guard
        private string? _startHost;
        private bool _confirmingNavigation;

        public BrowserWindow(MangaEntry mangaToTrack, string startUrl)
        {
            InitializeComponent();
            _trackedManga = mangaToTrack;
            InitAsync(startUrl);
        }

        /// <summary>
        /// Initialisiert WebView2, verdrahtet Events, aktiviert Adblock nach AppSettings und setzt die Start-URL.
        /// </summary>
        private async void InitAsync(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                throw new ArgumentNullException(nameof(url));

            var normalizedUrl = NormalizeUrl(url);

            // Use the same persistent WebView2 user data dir as our HTML fetcher,
            // so Cloudflare clearance cookies are shared across windows.
            var profileDir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MangaTracker", "WebView2Profile");
            System.IO.Directory.CreateDirectory(profileDir);
            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: profileDir,
                options: null);
            await Web.EnsureCoreWebView2Async(env);

            // WebMessages & JS aktivieren
            Web.CoreWebView2.Settings.IsWebMessageEnabled = true;
            Web.CoreWebView2.Settings.IsScriptEnabled = true;

            // Start-Host bestimmen
            if (!TryGetHost(normalizedUrl, out _startHost))
                _startHost = null;

            // ===== Kapitel-Erkennung per DOM/Meta/LD+JSON (früh injizieren) =====
            var chapterDetectScript = @"
                (() => {
                  function post(data){ try{ window.chrome?.webview?.postMessage(JSON.stringify(data)); }catch(e){} }

                  const RX_WORD_NUM = /(?:^|[\s:_\-|])(?:chapter|chap|ch|episode|ep|kapitel|cap(?:i|í)tulo)\s*([0-9]+(?:\.[0-9]+)?)(?!\d)/i;

                  function extractWordNumber(s){
                    if(!s) return null;
                    const m = RX_WORD_NUM.exec(String(s));
                    if(!m) return null;
                    const n = parseFloat(m[1]);
                    if(!isFinite(n) || n <= 0 || n > 10000) return null;
                    return n;
                  }

                  function tryMeta(){
                    const cands = [
                      ['og:title', document.querySelector('meta[property=""og:title""]')?.content],
                      ['meta:title', document.querySelector('meta[name=""title""]')?.content],
                      ['document.title', document.title]
                    ];
                    for(const [src,txt] of cands){
                      const n = extractWordNumber(txt);
                      if(n!=null) return {n, title: txt || document.title, source: 'meta:' + src};
                    }
                    return null;
                  }

                  function tryHeadings(){
                    const nodes = document.querySelectorAll('h1,h2,.chapter-title,.entry-title,.post-title,.reader-header,.wp-manga-chapter,.cha-title');
                    for(const el of nodes){
                      const s = el.textContent?.trim();
                      const n = extractWordNumber(s);
                      if(n!=null) return {n, title: s || document.title, source: 'heading'};
                    }
                    return null;
                  }

                  function tryLdJson(){
                    const scripts = document.querySelectorAll('script[type=""application/ld+json""]');
                    for(const s of scripts){
                      try{
                        const j = JSON.parse(s.textContent);
                        const arr = Array.isArray(j) ? j : [j];
                        for(const obj of arr){
                          const t = (obj['@type']||'').toString().toLowerCase();
                          const name = obj.name || obj.headline || '';
                          let v = obj.chapterNumber ?? obj.episodeNumber;
                          if(v==null && (t.includes('chapter') || t.includes('episode') || RX_WORD_NUM.test(name))){
                            v = obj.position;
                          }
                          if(v!=null){
                            const n = parseFloat(v);
                            if(isFinite(n) && n>0 && n<=10000) return {n, title: String(name||document.title), source:'ld+json'};
                          }
                          const n2 = extractWordNumber(name);
                          if(n2!=null) return {n:n2, title:String(name||document.title), source:'ld+json:name'};
                        }
                      }catch{}
                    }
                    return null;
                  }

                  function tryCanonicalOrUrl(){
                    const href = document.querySelector('link[rel=""canonical""]')?.href || location.href;
                    try{
                      const u = new URL(href, location.href);
                      const s = (u.pathname + ' ' + (document.title||''));
                      const n = extractWordNumber(s);
                      if(n!=null) return {n, title: document.title, source:'url'};
                    }catch{}
                    return null;
                  }

                  function detect(){
                    const res = tryLdJson() || tryMeta() || tryHeadings() || tryCanonicalOrUrl();
                    if(res && typeof res.n === 'number' && !isNaN(res.n)){
                      post({ type:'nyx-chapter', chapter: res.n, title: String(res.title||document.title), href: location.href, source: res.source });
                    }
                  }

                  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', detect, {once:true}); }
                  else { detect(); }

                  try{
                    const mo = new MutationObserver(() => { detect(); });
                    mo.observe(document.querySelector('title')||document.documentElement, {subtree:true, childList:true, characterData:true});
                  }catch{}

                  try{
                    const wrap = fn => function(){ const r=fn.apply(this, arguments); try{ detect(); }catch{} return r; };
                    history.pushState = wrap(history.pushState);
                    history.replaceState = wrap(history.replaceState);
                    window.addEventListener('popstate', detect);
                  }catch{}
                })();";

            await Web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(chapterDetectScript);

            // ============================
            // Navigation-Schutz mit 4 Optionen
            // ============================
            Web.CoreWebView2.NavigationStarting += (s, e) =>
            {
                try
                {
                    if (_confirmingNavigation)
                        return;

                    var eUri = e.Uri;
                    if (string.IsNullOrWhiteSpace(eUri) ||
                        eUri.StartsWith("about:", StringComparison.OrdinalIgnoreCase) ||
                        eUri.StartsWith("edge://", StringComparison.OrdinalIgnoreCase) ||
                        eUri.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                    {
                        return; // technische URIs ignorieren
                    }

                    if (_startHost == null)
                        return;

                    if (!TryGetHost(eUri, out var targetHost))
                    {
                        e.Cancel = true; // kaputte URI -> blocken
                        return;
                    }

                    // 1) Gleich/Subdomain der Startdomain -> erlauben
                    if (IsSameBaseOrSubdomain(targetHost, _startHost))
                        return;

                    // 2) Harte, persistente Entscheidungen aus Settings
                    if (ContainsHost(AppSettings.ExternalBlockedHosts, targetHost))
                    {
                        e.Cancel = true;
                        Debug.WriteLine($"[DomainGuard] Blockiert (Settings): {targetHost}");
                        return;
                    }
                    if (ContainsHost(AppSettings.ExternalAllowedHosts, targetHost))
                    {
                        return; // erlaubt
                    }

                    // 3) Fragen (4 Optionen)
                    e.Cancel = true; // ursprüngliche Navigation stoppen
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        var dlg = new ConfirmNavigateWindow(_startHost!, targetHost) { Owner = this };
                        var ok = dlg.ShowDialog() == true;
                        if (!ok)
                            return;

                        switch (dlg.Result)
                        {
                            case ConfirmNavigateResult.Yes:
                                _confirmingNavigation = true;
                                try
                                { Web.CoreWebView2.Navigate(eUri); }
                                finally { _confirmingNavigation = false; }
                                break;

                            case ConfirmNavigateResult.No:
                                // nichts tun (bleibt blockiert)
                                break;

                            case ConfirmNavigateResult.Block:
                                AddHostUnique(AppSettings.ExternalBlockedHosts, targetHost);
                                RemoveHost(AppSettings.ExternalAllowedHosts, targetHost);
                                AppSettings.Save();
                                break;

                            case ConfirmNavigateResult.Allow:
                                AddHostUnique(AppSettings.ExternalAllowedHosts, targetHost);
                                RemoveHost(AppSettings.ExternalBlockedHosts, targetHost);
                                AppSettings.Save();
                                _confirmingNavigation = true;
                                try
                                { Web.CoreWebView2.Navigate(eUri); }
                                finally { _confirmingNavigation = false; }
                                break;
                        }
                    }));
                }
                catch (Exception ex)
                {
                    e.Cancel = true;
                    Debug.WriteLine("NavigationStarting error: " + ex);
                }
            };

            // ============================
            // Standard-Events
            // ============================
            Web.CoreWebView2.SourceChanged += CoreWebView2_SourceChanged;
            Web.CoreWebView2.WebResourceRequested += CoreWebView2_WebResourceRequested;
            Web.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;

            // Host-spezifische CSS-Regeln bei jeder Navigation injizieren (früh)
            Web.CoreWebView2.NavigationStarting += async (s, e) =>
            {
                try
                {
                    if (!TryGetHost(e.Uri, out var host) || string.IsNullOrWhiteSpace(host))
                        return;

                    var hostCss = _ruleStore.BuildCssForHost(host);
                    if (!string.IsNullOrWhiteSpace(hostCss))
                    {
                        var cssEsc = hostCss.Replace("`", "\\`");
                        await Web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
(() => {
  try {
    const s = document.createElement('style');
    s.textContent = `" + cssEsc + @"`;
    document.documentElement.appendChild(s);
  } catch (e) {}
})();");
                    }
                }
                catch { /* ignore */ }
            };

            // Nachrichten: Picker + Kapitel-Events verarbeiten
            Web.CoreWebView2.WebMessageReceived += async (s, e) =>
            {
                try
                {
                    // JSON-Objekt (Kapitel-Detector)?
                    var json = e.WebMessageAsJson;
                    if (!string.IsNullOrWhiteSpace(json) && json.StartsWith("{"))
                    {
                        using var doc = JsonDocument.Parse(json);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("type", out var t) && t.GetString() == "nyx-chapter")
                        {
                            var chapterNum = root.TryGetProperty("chapter", out var cEl) && cEl.ValueKind == JsonValueKind.Number
                                ? cEl.GetDouble()
                                : double.NaN;

                            var title = root.TryGetProperty("title", out var titleEl) && titleEl.ValueKind == JsonValueKind.String
                                ? titleEl.GetString()
                                : null;

                            if (!double.IsNaN(chapterNum))
                            {
                                int found = (int)Math.Floor(chapterNum + 1e-9);
                                TryUpdateChapter(found, title);
                            }
                            return;
                        }
                    }

                    // String-Protokoll (Element-Picker)
                    var msg = e.TryGetWebMessageAsString();
                    if (string.IsNullOrWhiteSpace(msg))
                        return;

                    if (msg.StartsWith("nyx-cosmetic|", StringComparison.Ordinal))
                    {
                        var parts = msg.Split('|', 3);
                        if (parts.Length == 3)
                        {
                            var host = parts[1];
                            var selector = parts[2];
                            _ruleStore.AddRule(host, selector);

                            var jsSelector = System.Text.Json.JsonSerializer.Serialize(selector);
                            var result = await Web.CoreWebView2.ExecuteScriptAsync(
                                $"try{{document.querySelectorAll({jsSelector}).forEach(n=>n.style.setProperty('display','none','important')); 'OK';}}catch(e){{'ERR:'+e}}");
                            Debug.WriteLine("Picker apply result: " + result);

                            Debug.WriteLine($"[NYX] Cosmetic rule saved for {host}: {selector}");
                        }
                    }
                    else if (msg.StartsWith("nyx-net|", StringComparison.Ordinal))
                    {
                        var parts = msg.Split('|', 3);
                        if (parts.Length == 3)
                        {
                            var host = parts[1];
                            var rawUrl = parts[2];

                            try
                            {
                                var u = new Uri(rawUrl);
                                var path = u.AbsolutePath;
                                path = Regex.Replace(path, @"\d+", "*"); // Zahlen generalisieren
                                var pattern = $"{u.Scheme}://{u.Host}{path}*";
                                _ruleStore.AddUrlRule(host, pattern);
                                Debug.WriteLine($"[NYX] URL rule saved for {host}: {pattern}");
                            }
                            catch
                            {
                                var noQuery = rawUrl.Split('?', '#')[0];
                                _ruleStore.AddUrlRule(host, noQuery + "*");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("WebMessageReceived error: " + ex);
                }
            };

            // Tastatur-Shortcut für Picker (F2)
            this.PreviewKeyDown += BrowserWindow_PreviewKeyDown;

            // Entfernt: kein Pre-Warm mehr, um Zusatzfenster und Verzögerungen zu vermeiden

            // Start-URL setzen
            Web.Source = new Uri(normalizedUrl);

            // ============================
            // Adblock-Service anhängen
            // ============================
            _adblock = new AdblockService(new[]
            {
                System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "Filters", "easylist.txt"),
                System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "Filters", "uBO-unbreak.txt"),
                // optional: easyprivacy.txt
            });

            if (AppSettings.AdblockEnabled)
            {
                var opts = new MangaTracker.Services.Adblock.WebView2Adblock.Options
                {
                    DryRun = AppSettings.AdblockDryRun,
                    BlockNewWindows = AppSettings.AdblockBlockNewWindows,
                    PopupOpenInSameTab = AppSettings.AdblockPopupOpenInSameTab,
                    BlockInPageOverlays = AppSettings.AdblockBlockInPageOverlays,
                    SiteAllowlist = new HashSet<string>(AppSettings.AdblockSiteAllowlist ?? new(), StringComparer.OrdinalIgnoreCase),
                    HardBlockDomainPatterns = AppSettings.AdblockHardBlockDomainPatterns ?? new()
                };

                MangaTracker.Services.Adblock.WebView2Adblock.Attach(Web, _adblock, opts, ruleStore: _ruleStore);
            }
        }

        // ---------- Tastenkürzel: F2 toggelt den Element-Picker ----------
        private async void BrowserWindow_PreviewKeyDown(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.F2)
            {
                e.Handled = true;
                _pickerOn = !_pickerOn;
                try
                {
                    if (_pickerOn)
                    {
                        await WebView2Adblock.EnableElementPickerAsync(Web);
                        Debug.WriteLine("NYX: Element-Picker aktiviert (F2). ESC bricht ab, Klick speichert Regel.");
                    }
                    else
                    {
                        await WebView2Adblock.DisableElementPickerAsync(Web);
                        Debug.WriteLine("NYX: Element-Picker deaktiviert.");
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("NYX Picker error: " + ex);
                }
            }
        }

        // ---------- Fenster-Popups nativ blocken ----------
        private void CoreWebView2_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            if (!AppSettings.AdblockEnabled || !AppSettings.AdblockBlockNewWindows)
                return;

            // Allow Cloudflare challenge popups if any
            var uri = e.Uri ?? string.Empty;
            if (uri.Contains("challenges.cloudflare.com", StringComparison.OrdinalIgnoreCase) ||
                uri.Contains("/turnstile/", StringComparison.OrdinalIgnoreCase))
            {
                e.Handled = false;
                return;
            }

            e.Handled = true; // blocken
            Debug.WriteLine($"Blocked popup (native handler): {e.Uri}");
        }

        // ---------- (optional) Fallback-Heuristik-Blocker ----------
        private void CoreWebView2_WebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            // leer – Hauptlogik steckt in WebView2Adblock.Attach(...)
        }

        // ---------- Kapitelnummer aus URL erkennen (Fallback) ----------
        private void CoreWebView2_SourceChanged(object? sender, CoreWebView2SourceChangedEventArgs e)
        {
            Dispatcher.Invoke(() =>
            {
                try
                {
                    string newUrl = Web.Source.ToString();
                    Debug.WriteLine($"URL geändert zu: {newUrl}");

                    string template = _trackedManga.ChapterUrlTemplate;

                    if (!string.IsNullOrWhiteSpace(template) && template.Contains("$chapter"))
                    {
                        string escapedTemplate = Regex.Escape(template);
                        string pattern = escapedTemplate.Replace(Regex.Escape("$chapter"), @"(\d+(?:\.\d+)?)");
                        var match = Regex.Match(newUrl, pattern);

                        if (match.Success && match.Groups.Count > 1)
                        {
                            string numberPart = match.Groups[1].Value;
                            if (double.TryParse(numberPart, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double foundDouble))
                            {
                                int foundChapter = (int)Math.Floor(foundDouble + 1e-9);
                                TryUpdateChapter(foundChapter, null);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("URL pattern chapter parse error: " + ex);
                }
            });
        }

        // ===== Helper =====

        private void TryUpdateChapter(int foundChapter, string? title)
        {
            if (foundChapter > _trackedManga.Chapter)
            {
                Debug.WriteLine($"[ChapterDetect] Neues Kapitel erkannt: {foundChapter} (alt: {_trackedManga.Chapter})"
                    + (string.IsNullOrWhiteSpace(title) ? "" : $" – {title}"));
                _trackedManga.Chapter = foundChapter;
            }
        }

        private static string NormalizeUrl(string url)
        {
            url = (url ?? "").Trim();
            if (Uri.TryCreate(url, UriKind.Absolute, out _))
                return url;
            if (Uri.TryCreate("https://" + url, UriKind.Absolute, out var abs) && !string.IsNullOrEmpty(abs.Host))
                return abs.ToString();
            return url;
        }

        private static bool TryGetHost(string uriString, out string host)
        {
            host = string.Empty;
            if (Uri.TryCreate(uriString, UriKind.Absolute, out var uri) && !string.IsNullOrEmpty(uri.Host))
            {
                host = uri.Host;
                return true;
            }
            return false;
        }

        // Locker: erlaubt gleiche Domain oder echte Subdomain (Punkt-Grenze)
        private static bool IsSameBaseOrSubdomain(string targetHost, string baseHost)
        {
            if (targetHost.Equals(baseHost, StringComparison.OrdinalIgnoreCase))
                return true;
            return targetHost.EndsWith("." + baseHost, StringComparison.OrdinalIgnoreCase);
        }

        private static void AddHostUnique(List<string> list, string host)
        {
            if (!ContainsHost(list, host))
                list.Add(host);
        }

        private static void RemoveHost(List<string> list, string host)
        {
            list.RemoveAll(h => string.Equals(h, host, StringComparison.OrdinalIgnoreCase));
        }

        private static bool ContainsHost(List<string> list, string host)
        {
            foreach (var h in list)
                if (string.Equals(h, host, StringComparison.OrdinalIgnoreCase))
                    return true;
            return false;
        }
    }
}
