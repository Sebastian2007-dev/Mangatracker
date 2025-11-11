using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Extensions.Logging;
using System;
using System.Diagnostics;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;

namespace MangaTracker.Services.ChapterTracking
{
    public static class WebView2HtmlFetcher
    {
        private const string DefaultUserAgent =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

        private static Task<T> RunOnUIThreadAsync<T>(Func<Task<T>> func)
        {
            var app = Application.Current ?? throw new InvalidOperationException("No WPF Application available.");
            var dispatcher = app.Dispatcher ?? throw new InvalidOperationException("No Dispatcher available.");

            if (dispatcher.CheckAccess())
                return func();

            return dispatcher.InvokeAsync(func).Task.Unwrap();
        }

        private static string GetUserDataDir()
        {
            var baseDir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MangaTracker", "WebView2Profile");
            System.IO.Directory.CreateDirectory(baseDir);
            return baseDir;
        }

        public static Task<string?> FetchHtmlAsync
            (
            string url,
            TimeSpan? timeout = null,
            Microsoft.Extensions.Logging.ILogger? logger = null,
            string? cid = null,
            bool warmupOriginFirst = false,
            string? overrideUserAgent = null,
            int retryOnFail = 1,
            bool allowInteractive = false)
        {
            return RunOnUIThreadAsync(() =>
                FetchHtmlCoreAsync(url, timeout, logger, cid, warmupOriginFirst, overrideUserAgent, retryOnFail, allowInteractive));
        }



        private static async Task<string?> FetchHtmlCoreAsync(
    string url,
    TimeSpan? timeout,
    Microsoft.Extensions.Logging.ILogger? logger,
    string? cid,
    bool warmupOriginFirst,
    string? overrideUserAgent,
    int retryOnFail,
    bool allowInteractive)
        {
            string LogPrefix() => string.IsNullOrEmpty(cid) ? "" : $"[{cid}] ";
            void L(Microsoft.Extensions.Logging.LogLevel level, string msg, Exception? ex = null)
                => logger?.Log(level, ex, $"{LogPrefix()}{msg}");

            // Unsichtbares, aber "echtes" Fenster – manche Sites initialisieren sonst CoreWebView2 nicht sauber.
            var win = new System.Windows.Window
            {
                Width = 800,
                Height = 600,
                ShowInTaskbar = false,
                WindowStyle = System.Windows.WindowStyle.None,
                AllowsTransparency = true,
                Opacity = 0.0,
                Background = System.Windows.Media.Brushes.Transparent
            };
            var web = new Microsoft.Web.WebView2.Wpf.WebView2();
            win.Content = web;

            var dispatcher = win.Dispatcher;

            try
            {
                // Fenster anzeigen, dann Core erstellen
                await dispatcher.InvokeAsync(() => { try { win.Show(); } catch { } });

                await dispatcher.InvokeAsync(async () =>
                {
                    var env = await Microsoft.Web.WebView2.Core.CoreWebView2Environment.CreateAsync(
                        browserExecutableFolder: null,
                        userDataFolder: GetUserDataDir(),
                        options: null);

                    await web.EnsureCoreWebView2Async(env);
                    if (web.CoreWebView2 == null)
                        throw new InvalidOperationException("CoreWebView2 could not be initialized.");

                    var core = web.CoreWebView2;
                    core.Settings.IsScriptEnabled = true;
                    core.Settings.IsWebMessageEnabled = true;
                    core.Settings.UserAgent = overrideUserAgent ?? DefaultUserAgent;

                    // Popups im selben WebView öffnen
                    core.NewWindowRequested += (s, e) =>
                    {
                        try
                        { e.Handled = true; if (!string.IsNullOrEmpty(e.Uri)) core.Navigate(e.Uri); }
                        catch { }
                    };

                    // Logging
                    core.FrameNavigationCompleted += (s, e) =>
                        L(Microsoft.Extensions.Logging.LogLevel.Debug, $"FrameNavCompleted success={e.IsSuccess} status={e.WebErrorStatus}");
                    core.ProcessFailed += (s, e) =>
                        L(Microsoft.Extensions.Logging.LogLevel.Warning, $"ProcessFailed kind={e.ProcessFailedKind}");
                });

                // === Helper (UI-thread safe) ===
                async Task<bool> WaitForChallengeClearAsync(TimeSpan max)
                {
                    var stopAt = DateTime.UtcNow + max;
                    while (DateTime.UtcNow < stopAt)
                    {
                        // kein JSON.stringify im JS – Objekt direkt zurückgeben!
                        string raw = await dispatcher
                            .InvokeAsync(() =>
                            {
                                var core = web.CoreWebView2;
                                if (core == null)
                                    return Task.FromResult("{}");
                                return core.ExecuteScriptAsync(@"
                            (() => {
                              try {
                                const hasClearance = document.cookie.includes('cf_clearance=');
                                const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
                                const isChallenge = /checking your browser|just a moment|ddos|cloudflare|confirm you are human/.test(bodyText);
                                const ready = document.readyState;
                                const chapterLinks = document.querySelectorAll(
                                  'li.wp-manga-chapter a, ul.chapter-list a, .chapter-list a, .eplist a, .chapters a, a[href*=""chapter""]'
                                ).length;
                                return { hasClearance, isChallenge, ready, chapterLinks };
                              } catch(e) {
                                return { error: true };
                              }
                            })();");
                            })
                            .Task.Unwrap();

                        try
                        {
                            var root = System.Text.Json.JsonDocument.Parse(raw).RootElement;
                            if (root.ValueKind == System.Text.Json.JsonValueKind.String)
                            {
                                var inner = root.GetString() ?? "{}";
                                root = System.Text.Json.JsonDocument.Parse(inner).RootElement;
                            }

                            bool hasClearance = root.TryGetProperty("hasClearance", out var hc) && hc.GetBoolean();
                            bool isChallenge = root.TryGetProperty("isChallenge", out var ic) && ic.GetBoolean();
                            string ready = root.TryGetProperty("ready", out var rd) ? (rd.GetString() ?? "") : "";
                            int chapterLinks = root.TryGetProperty("chapterLinks", out var cl) ? cl.GetInt32() : 0;

                            if (!isChallenge && (hasClearance || ready == "complete") && chapterLinks >= 3)
                                return true;
                        }
                        catch
                        {
                            // ignore parse issues, erneut versuchen
                        }

                        await Task.Delay(600);
                    }
                    return false;
                }

                async Task ScrollNudgeAsync()
                {
                    await dispatcher.InvokeAsync(async () =>
                    {
                        var core = web.CoreWebView2;
                        if (core == null)
                            return;
                        try
                        {
                            await core.ExecuteScriptAsync("window.scrollTo(0, document.body.scrollHeight/3);");
                            await Task.Delay(200);
                            await core.ExecuteScriptAsync("window.scrollTo(0, document.body.scrollHeight*2/3);");
                            await Task.Delay(200);
                            await core.ExecuteScriptAsync("window.scrollTo(0, document.body.scrollHeight);");
                        }
                        catch { }
                    });
                }

                async Task<string?> TryOnceAsync(string firstUrl, bool doWarmup, bool mobileUA)
                {
                    // ggf. Mobile UA setzen
                    if (mobileUA)
                    {
                        await dispatcher.InvokeAsync(() =>
                        {
                            var core = web.CoreWebView2;
                            if (core == null)
                                return;
                            core.Settings.UserAgent =
                                "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36";
                        });
                    }
                    else
                    {
                        await dispatcher.InvokeAsync(() =>
                        {
                            var core = web.CoreWebView2;
                            if (core == null)
                                return;
                            core.Settings.UserAgent = overrideUserAgent ?? DefaultUserAgent;
                        });
                    }

                    // optionaler Warmup-Hop
                    if (doWarmup)
                    {
                        await dispatcher.InvokeAsync(() =>
                        {
                            var core = web.CoreWebView2;
                            if (core == null)
                                return;
                            var origin = new Uri(firstUrl).GetLeftPart(UriPartial.Authority) + "/";
                            L(Microsoft.Extensions.Logging.LogLevel.Information, $"Warmup origin {origin}");
                            core.Navigate(origin);
                        });
                        await Task.Delay(1800);
                    }

                    // Ziel ansurfen
                    await dispatcher.InvokeAsync(() =>
                    {
                        var core = web.CoreWebView2;
                        if (core == null)
                            return;
                        L(Microsoft.Extensions.Logging.LogLevel.Information, $"Navigate {firstUrl}");
                        core.Navigate(firstUrl);
                    });

                    var waited = await WaitForChallengeClearAsync(TimeSpan.FromSeconds(30));
                    if (!waited)
                        L(Microsoft.Extensions.Logging.LogLevel.Warning, "Challenge not cleared within wait window – capturing anyway");

                    await ScrollNudgeAsync();
                    await Task.Delay(600);

                    // HTML holen
                    string htmlJson = await dispatcher
                        .InvokeAsync(() =>
                        {
                            var core = web.CoreWebView2;
                            if (core == null)
                                return Task.FromResult("\"\"");
                            return core.ExecuteScriptAsync("document.documentElement.outerHTML");
                        })
                        .Task.Unwrap();

                    string? html = null;
                    try
                    {
                        var root = System.Text.Json.JsonDocument.Parse(htmlJson).RootElement;
                        if (root.ValueKind == System.Text.Json.JsonValueKind.String)
                        {
                            html = root.GetString();
                        }
                        else
                        {
                            html = root.GetRawText();
                        }
                    }
                    catch { /* ignore */ }

                    return string.IsNullOrWhiteSpace(html) ? null : html;
                }

                // === Versuche: Desktop + optional Warmup, dann Mobile; bei Fehlschlag interaktives Solve ===
                int tries = Math.Max(0, retryOnFail) + 1;
                bool mobile = false;
                while (tries-- > 0)
                {
                    var html = await TryOnceAsync(url, doWarmup: warmupOriginFirst, mobileUA: mobile);
                    if (!string.IsNullOrEmpty(html))
                    {
                        L(Microsoft.Extensions.Logging.LogLevel.Information, $"HTML captured (len={html.Length})");
                        return html;
                    }

                    // NEU: Wenn’s nach dem Versuch immer noch nach Challenge riecht → interaktives Solve anbieten
                    L(Microsoft.Extensions.Logging.LogLevel.Warning, "Challenge scheint nicht geklärt – öffne interaktives Solve-Fenster.");
                    if (allowInteractive)
                    {
                        var solved = await SolveCloudflareInteractivelyAsync(url);
                    if (solved)
                    {
                        // Clearance-Cookie befindet sich im gleichen userDataFolder → kurzer Retry reicht
                        var htmlAfter = await TryOnceAsync(url, doWarmup: false, mobileUA: false);
                        if (!string.IsNullOrEmpty(htmlAfter))
                        {
                            L(Microsoft.Extensions.Logging.LogLevel.Information, "HTML captured after interactive solve.");
                            return htmlAfter;
                        }
                    }
                    }

                    if (tries <= 0)
                        break;

                    mobile = true; // nächster Versuch mit Mobile-UA
                    await Task.Delay(800);
                }

                return null;
            }
            finally
            {
                await dispatcher.InvokeAsync(() => { try { if (win.IsVisible) win.Close(); } catch { } });
            }
        }






        public static Task<bool> WarmUpCookiesAsync(string url, CookieContainer targetCookies, TimeSpan? timeout = null, ILogger? logger = null, string? cid = null) =>
            RunOnUIThreadAsync(() => WarmUpCookiesCoreAsync(url, targetCookies, timeout, logger, cid));

        private static async Task<bool> WarmUpCookiesCoreAsync(string url, CookieContainer targetCookies, TimeSpan? timeout, ILogger? logger, string? cid)
        {
            static string OriginOf(string u)
            {
                var uu = new Uri(u);
                return uu.GetLeftPart(UriPartial.Authority) + "/";
            }

            cid ??= Guid.NewGuid().ToString("N").Substring(0, 8);
            void L(LogLevel lvl, string msg, Exception? ex = null) =>
                (logger ?? DummyLogger.Instance).Log(lvl, default, $"[{cid}] WV2-Warmup {msg}", ex, (s, e) => s);

            var tcs = new TaskCompletionSource<bool>();
            var swAll = Stopwatch.StartNew();

            var win = new Window
            {
                Width = 0,
                Height = 0,
                ShowInTaskbar = false,
                WindowStyle = WindowStyle.None,
                Visibility = Visibility.Hidden
            };
            var web = new WebView2();
            win.Content = web;

            win.Loaded += async (_, __) =>
            {
                try
                {
                    L(LogLevel.Information, "Create WV2 env…");
                    var env = await CoreWebView2Environment.CreateAsync(
                        browserExecutableFolder: null,
                        userDataFolder: GetUserDataDir(),
                        options: null);

                    await web.EnsureCoreWebView2Async(env);

                    web.CoreWebView2.Settings.IsScriptEnabled = true;
                    web.CoreWebView2.Settings.UserAgent = DefaultUserAgent;

                    web.CoreWebView2.NewWindowRequested += (s, e) =>
                    {
                        try
                        {
                            L(LogLevel.Debug, $"NewWindowRequested uri={e.Uri}");
                            e.Handled = true;
                            if (!string.IsNullOrEmpty(e.Uri))
                                web.CoreWebView2.Navigate(e.Uri);
                        }
                        catch (Exception ex)
                        {
                            L(LogLevel.Warning, "NewWindowRequested handler failed", ex);
                        }
                    };

                    string origin = OriginOf(url);
                    bool wentToTarget = false;

                    web.CoreWebView2.NavigationCompleted += async (s, e) =>
                    {
                        try
                        {
                            L(LogLevel.Debug, $"NavCompleted success={e.IsSuccess} status={e.WebErrorStatus}");
                            await Task.Delay(1500);

                            if (!wentToTarget)
                            {
                                wentToTarget = true;
                                L(LogLevel.Information, $"Navigate to target {url}");
                                web.CoreWebView2.Navigate(url);
                                return;
                            }

                            var mgr = web.CoreWebView2.CookieManager;
                            var list = await mgr.GetCookiesAsync(url);
                            var uri = new Uri(url);

                            int added = 0;
                            foreach (var c in list)
                            {
                                var domain = string.IsNullOrEmpty(c.Domain) ? uri.Host : c.Domain;

                                var cookie = new Cookie(c.Name, c.Value, c.Path ?? "/", domain)
                                {
                                    Secure = c.IsSecure,
                                    HttpOnly = c.IsHttpOnly
                                };

                                if (!c.IsSession)
                                {
                                    var exp = c.Expires;
                                    if (exp.Kind == DateTimeKind.Unspecified)
                                        exp = DateTime.SpecifyKind(exp, DateTimeKind.Utc);
                                    cookie.Expires = exp;
                                }

                                try
                                { targetCookies.Add(uri, cookie); added++; }
                                catch { }
                            }

                            L(LogLevel.Information, $"Imported {added}/{list.Count} cookies; total {swAll.ElapsedMilliseconds} ms");
                            tcs.TrySetResult(true);
                        }
                        catch (Exception ex)
                        {
                            L(LogLevel.Error, "Warm-up failed in NavCompleted", ex);
                            tcs.TrySetResult(false);
                        }
                    };

                    L(LogLevel.Information, $"Navigate to origin {origin}");
                    web.Source = new Uri(origin);
                }
                catch (Exception ex)
                {
                    L(LogLevel.Error, "Init WV2 warm-up failed", ex);
                    tcs.TrySetResult(false);
                }
            };

            win.Show();
            var cts = new CancellationTokenSource(timeout ?? TimeSpan.FromSeconds(25));
            try
            {
                using (cts.Token.Register(() => tcs.TrySetResult(false)))
                {
                    var ok = await tcs.Task;
                    win.Close();
                    return ok;
                }
            }
            finally
            {
                if (win.IsVisible)
                    win.Close();
            }
        }

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
                    LogFile.WriteWv2(line);
                }
                catch
                {
                    // never throw from logger
                }
            }

            private sealed class NullDisp : IDisposable { public static readonly NullDisp Instance = new(); public void Dispose() { } }
        }

        // irgendwo zentral (z.B. in WebView2HtmlFetcher)
        public static async Task<bool> SolveCloudflareInteractivelyAsync(string url)
        {
            // immer dasselbe Profil nutzen, damit das cf_clearance im gleichen Store landet
            string profileDir = GetUserDataDir();

            var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            // --- sichtbares, normales Fenster (NICHT transparent!) ---
            var win = new System.Windows.Window
            {
                Title = "Cloudflare-Verifikation",
                Width = 980,
                Height = 760,
                WindowStartupLocation = System.Windows.WindowStartupLocation.CenterScreen,
                Topmost = true,
                ResizeMode = System.Windows.ResizeMode.CanResize,
                WindowStyle = System.Windows.WindowStyle.SingleBorderWindow,
                Background = System.Windows.Media.Brushes.White,
                ShowInTaskbar = true
            };

            // Layout: Hinweisleiste + WebView + Fußleiste mit „Fertig“-Button
            var root = new System.Windows.Controls.DockPanel();

            var infoBar = new System.Windows.Controls.Border
            {
                Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(255, 248, 210)),
                BorderBrush = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 200, 120)),
                BorderThickness = new System.Windows.Thickness(0, 0, 0, 1),
                Padding = new System.Windows.Thickness(10)
            };
            var infoText = new System.Windows.Controls.TextBlock
            {
                Text = "Bitte die Checkbox „Bestätigen Sie, dass Sie ein Mensch sind“ anklicken. " +
                       "Sobald die Prüfung abgeschlossen ist, schließt sich dieses Fenster automatisch.\n" +
                       "Hinweis: Adblocker darf 'challenges.cloudflare.com' NICHT blockieren.",
                TextWrapping = System.Windows.TextWrapping.Wrap,
                Foreground = System.Windows.Media.Brushes.Black
            };
            infoBar.Child = infoText;
            System.Windows.Controls.DockPanel.SetDock(infoBar, System.Windows.Controls.Dock.Top);
            root.Children.Add(infoBar);

            var footer = new System.Windows.Controls.StackPanel
            {
                Orientation = System.Windows.Controls.Orientation.Horizontal,
                HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
                Margin = new System.Windows.Thickness(8)
            };
            var btnDone = new System.Windows.Controls.Button
            {
                Content = "Fertig – Prüfen",
                Padding = new System.Windows.Thickness(12, 6, 12, 6),
                Margin = new System.Windows.Thickness(8, 0, 0, 0)
            };
            System.Windows.Controls.DockPanel.SetDock(footer, System.Windows.Controls.Dock.Bottom);
            footer.Children.Add(btnDone);
            root.Children.Add(footer);

            var web = new Microsoft.Web.WebView2.Wpf.WebView2();
            root.Children.Add(web);

            win.Content = root;

            // Hilfsfunktion: prüft, ob ein gültiges cf_clearance-Cookie existiert
            async Task<bool> HasClearanceAsync()
            {
                if (web?.CoreWebView2 == null)
                    return false;
                try
                {
                    var mgr = web.CoreWebView2.CookieManager;
                    var list = await mgr.GetCookiesAsync(url);
                    var ok = list.Any(c =>
                        c.Name.Equals("cf_clearance", StringComparison.OrdinalIgnoreCase) &&
                        (c.Expires == DateTime.MinValue || c.Expires > DateTime.UtcNow.AddMinutes(1)));
                    return ok;
                }
                catch { return false; }
            }

            // bei Fenster-Schließen: wenn noch nicht erfüllt, false
            win.Closed += (_, __) => tcs.TrySetResult(false);

            win.Loaded += async (_, __) =>
            {
                try
                {
                    var env = await Microsoft.Web.WebView2.Core.CoreWebView2Environment.CreateAsync(
                        browserExecutableFolder: null,
                        userDataFolder: profileDir,
                        options: null);

                    await web.EnsureCoreWebView2Async(env);
                    var core = web.CoreWebView2;

                    core.Settings.IsScriptEnabled = true;
                    core.Settings.IsWebMessageEnabled = true;
                    core.Settings.UserAgent = DefaultUserAgent; // Desktop-UA

                    // neue Fenster im selben WebView öffnen
                    core.NewWindowRequested += (s, e) =>
                    {
                        e.Handled = true;
                        if (!string.IsNullOrEmpty(e.Uri))
                            core.Navigate(e.Uri);
                    };

                    // kleine Helfer: automatisch zum Turnstile-iFrame scrollen und fokus setzen
                    string assistScript = @"
                        (() => {
                          try {
                            // etwas warten, falls CF Ressourcen nachlädt
                            setTimeout(() => {
                              const iframe = document.querySelector('iframe[src*=""challenges.cloudflare.com""]');
                              if (iframe) {
                                iframe.scrollIntoView({behavior:'smooth', block:'center'});
                                try { iframe.contentWindow?.focus(); } catch(e){}
                              }
                            }, 700);
                          } catch(e) { }
                        })();";
                    core.DOMContentLoaded += async (_, __) =>
                    {
                        try
                        { await core.ExecuteScriptAsync(assistScript); }
                        catch { }
                    };

                    // Cookie-Polling: alle 800ms prüfen
                    var pollTimer = new System.Windows.Threading.DispatcherTimer
                    {
                        Interval = TimeSpan.FromMilliseconds(800)
                    };
                    pollTimer.Tick += async (_, __) =>
                    {
                        try
                        {
                            if (await HasClearanceAsync())
                            {
                                pollTimer.Stop();
                                tcs.TrySetResult(true);
                                win.Close();
                            }
                        }
                        catch { }
                    };
                    pollTimer.Start();

                    // Sobald eine Navigation abgeschlossen ist, nochmal kurz prüfen
                    core.NavigationCompleted += async (_, __) =>
                    {
                        await Task.Delay(600);
                        if (await HasClearanceAsync())
                        {
                            tcs.TrySetResult(true);
                            win.Close();
                        }
                    };

                    // „Fertig“-Button prüft manuell
                    btnDone.Click += async (_, __) =>
                    {
                        if (await HasClearanceAsync())
                        {
                            tcs.TrySetResult(true);
                            win.Close();
                        }
                        else
                        {
                            // Fokus erzwingen & Hinweis
                            try
                            { await core.ExecuteScriptAsync(assistScript); }
                            catch { }
                            infoText.Text = "Noch kein 'cf_clearance' gefunden. Bitte Checkbox anklicken und ggf. Bild-/Puzzle lösen.";
                        }
                    };

                    // Erst zur Origin, dann zur Ziel-URL (CF mag das)
                    var origin = new Uri(url).GetLeftPart(UriPartial.Authority) + "/";
                    core.Navigate(origin);
                    core.NavigationCompleted += (s, e2) =>
                    {
                        try
                        {
                            if (web.Source?.ToString() == origin && e2.IsSuccess)
                                core.Navigate(url);
                        }
                        catch { }
                    };
                }
                catch
                {
                    // Falls irgendwas beim Init schiefgeht, gib Chance auf manuelles Retry
                }
            };

            win.Show();

            // Timeout (Sicherheitsnetz): 2,5 Minuten
            using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(2.5));
            using (cts.Token.Register(() => tcs.TrySetResult(false)))
            {
                return await tcs.Task.ConfigureAwait(false);
            }
        }



    }
}
