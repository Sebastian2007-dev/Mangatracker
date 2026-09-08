package com.mangaTracker.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * In-App-Reader auf Basis eines nativen WebView.
 *
 * Ersetzt @capacitor/browser (Custom Tabs) fuer das Lesen von Kapiteln. Custom Tabs
 * geben weder die navigierte URL heraus noch erlauben sie JS-Injection oder
 * Request-Interception — genau das braucht die App aber fuer Kapitelerkennung,
 * Scroll-Gedaechtnis und Werbeblocken.
 *
 * Der WebView liegt als Overlay ueber der Capacitor-Activity, damit die Bridge
 * aktiv bleibt und Events sofort im JS ankommen.
 *
 * Rueckkanal aus der Seite ist console.log mit Praefix — dieselbe Mechanik wie im
 * Desktop-Reader, wodurch beide Plattformen die Skripte aus
 * src/shared/reader-scripts.ts teilen.
 */
@CapacitorPlugin(name = "ReaderWebView")
public class ReaderPlugin extends Plugin {

    private static final String TAG = "MangaReader";

    /** Praefix, mit dem das injizierte Skript Nachrichten meldet. */
    private static final String MESSAGE_PREFIX = "__MANGA_";

    private FrameLayout overlay;
    private WebView webView;
    private TextView urlLabel;
    private LinearLayout toolbar;
    private int toolbarPadding;
    private String currentMangaId;
    private String lastReportedUrl;

    /**
     * Wird aus shouldInterceptRequest gelesen (Hintergrund-Thread) und aus dem
     * UI-Thread geschrieben — daher synchronisiert.
     */
    private final Set<String> blockedHosts = Collections.synchronizedSet(new HashSet<String>());

    private boolean blockPopups = true;
    /**
     * Fremde Skripte/iframes blocken, ausser die Domain steht in allowedThirdParty.
     * Wirkt gegen rotierende Werbedomains, deren Namen man nicht kennen kann.
     */
    private volatile boolean strictThirdParty = true;
    private final Set<String> allowedThirdParty =
            Collections.synchronizedSet(new HashSet<String>());
    /** Pro Seitenladung mitgezaehlt und beim Laden-Ende gemeldet. */
    private final java.util.concurrent.atomic.AtomicInteger blockedCount =
            new java.util.concurrent.atomic.AtomicInteger(0);

    /**
     * Fremde Hosts der aktuellen Seitenladung — beim Laden-Ende einmal ausgegeben.
     * Ohne diese Messung liesse sich die Blockliste nur raten.
     */
    private final Set<String> thirdPartyHosts =
            Collections.synchronizedSet(new java.util.LinkedHashSet<String>());
    private volatile String pageHost = "";

    // ── Domain Guard ─────────────────────────────────────────────────
    /** Registrierbare Domain der geoeffneten Seite; alles andere gilt als fremd. */
    private volatile String originDomain = "";
    /** Vom Nutzer dauerhaft erlaubte bzw. gesperrte Domains (aus den Settings). */
    private final Set<String> guardAllowed = Collections.synchronizedSet(new HashSet<String>());
    private final Set<String> guardBlocked = Collections.synchronizedSet(new HashSet<String>());
    /** "ask" | "block" | "off" */
    private volatile String guardMode = "ask";
    /** Einmal-Freigabe fuer genau diese URL (Antwort "ja" auf den Guard-Dialog). */
    private volatile String allowOnceUrl = null;

    // ── Oeffentliche Plugin-API ───────────────────────────────────────────

    @PluginMethod
    public void open(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        currentMangaId = call.getString("mangaId");
        blockPopups = call.getBoolean("blockPopups", Boolean.TRUE);

        final JSArray hosts = call.getArray("blockedHosts", new JSArray());
        applyBlockedHosts(hosts);

        strictThirdParty = call.getBoolean("strictThirdParty", Boolean.TRUE);
        fillDomainSet(allowedThirdParty, call.getArray("allowedThirdParty", new JSArray()));
        guardMode = call.getString("guardMode", "ask");
        fillDomainSet(guardAllowed, call.getArray("allowedDomains", new JSArray()));
        fillDomainSet(guardBlocked, call.getArray("blockedDomains", new JSArray()));

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    ensureOverlay();
                    lastReportedUrl = null;
                    blockedCount.set(0);
                    thirdPartyHosts.clear();
                    pageHost = hostOf(url);
                    originDomain = baseDomain(pageHost);
                    webView.loadUrl(url);
                    overlay.setVisibility(View.VISIBLE);
                    applyInsets();
                    Log.i(TAG, "open url=" + url + " mangaId=" + currentMangaId
                            + " blockedHosts=" + blockedHosts.size());
                    call.resolve();
                } catch (Exception e) {
                    Log.e(TAG, "open failed", e);
                    call.reject("open failed: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void close(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                closeReader();
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void isOpen(PluginCall call) {
        JSObject result = new JSObject();
        result.put("open", overlay != null && overlay.getVisibility() == View.VISIBLE);
        call.resolve(result);
    }

    @PluginMethod
    public void executeScript(final PluginCall call) {
        final String code = call.getString("code");
        if (code == null) {
            call.reject("code is required");
            return;
        }
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView == null) {
                    call.reject("reader is not open");
                    return;
                }
                webView.evaluateJavascript(code, null);
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void setBlockedHosts(final PluginCall call) {
        applyBlockedHosts(call.getArray("blockedHosts", new JSArray()));
        call.resolve();
    }

    /**
     * Navigiert den Reader gezielt auf eine URL.
     * Wird gebraucht, wenn der Nutzer eine geblockte Navigation doch erlaubt —
     * shouldOverrideUrlLoading hat sie zu diesem Zeitpunkt schon abgelehnt.
     */
    @PluginMethod
    public void setUrl(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView == null) {
                    call.reject("reader is not open");
                    return;
                }
                // Einmalige Freigabe: sonst faengt der Guard dieselbe URL sofort wieder ab
                allowOnceUrl = url;
                webView.loadUrl(url);
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void updateGuardLists(final PluginCall call) {
        guardMode = call.getString("guardMode", guardMode);
        fillDomainSet(guardAllowed, call.getArray("allowedDomains", new JSArray()));
        fillDomainSet(guardBlocked, call.getArray("blockedDomains", new JSArray()));
        call.resolve();
    }

    @PluginMethod
    public void reload(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView != null) webView.reload();
                call.resolve();
            }
        });
    }

    // ── Von MainActivity: Zurueck-Taste ──────────────────────────────────

    /** true, wenn der Reader offen war und die Taste verbraucht wurde. */
    public boolean handleBackPressed() {
        if (overlay == null || overlay.getVisibility() != View.VISIBLE) return false;
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        closeReader();
        return true;
    }

    // ── Interna ──────────────────────────────────────────────────────────

    private void applyBlockedHosts(JSArray hosts) {
        Set<String> next = new HashSet<>();
        try {
            List<String> list = hosts.toList();
            for (String host : list) {
                if (host != null && !host.isEmpty()) {
                    next.add(host.toLowerCase(Locale.ROOT));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "blockedHosts unreadable", e);
        }
        synchronized (blockedHosts) {
            blockedHosts.clear();
            blockedHosts.addAll(next);
        }
    }


    /** Letzte zwei Labels eines Hosts — grobe, ausreichende Annaeherung an die Registrable Domain. */
    private static String baseDomain(String host) {
        if (host == null || host.isEmpty()) return "";
        // Ohne Regex: die letzten beiden Labels per lastIndexOf abschneiden.
        int last = host.lastIndexOf('.');
        if (last <= 0) return host;
        int secondLast = host.lastIndexOf('.', last - 1);
        return secondLast < 0 ? host : host.substring(secondLast + 1);
    }


    /**
     * Ressourcentyp der Anfrage.
     *
     * Chromium sendet Sec-Fetch-Dest (script, iframe, image, style, document...).
     * Darauf laesst sich unterscheiden, was Inhalt ist und was Ausliefermechanik
     * fuer Werbung — Bilder duerfen fremd sein, Skripte und iframes nicht.
     */

    private static WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "utf-8",
                new ByteArrayInputStream(new byte[0]));
    }

    /**
     * True, wenn die Anfrage aktiven Inhalt (Skript, iframe, Plugin) von einer
     * fremden, nicht freigegebenen Domain holt.
     *
     * Bilder, Styles und Fonts sind bewusst ausgenommen — dort steckt der
     * Kapitelinhalt, und ein Fehlschluss wuerde die Seite unlesbar machen.
     */
    private boolean isForeignActiveContent(WebResourceRequest request, String urlString) {
        String dest = destinationOf(request);
        boolean active = "script".equals(dest) || "iframe".equals(dest)
                || "frame".equals(dest) || "object".equals(dest) || "embed".equals(dest);
        if (!active) return false;

        String domain = baseDomain(hostOf(urlString));
        if (domain.isEmpty()) return false;
        if (domain.equals(baseDomain(pageHost))) return false;

        synchronized (allowedThirdParty) {
            if (allowedThirdParty.contains(domain)) return false;
        }
        synchronized (guardAllowed) {
            // Was der Nutzer im Guard erlaubt hat, gilt hier auch
            if (guardAllowed.contains(domain)) return false;
        }
        return true;
    }

    private static String destinationOf(WebResourceRequest request) {
        java.util.Map<String, String> headers = null;
        try {
            headers = request.getRequestHeaders();
        } catch (Exception ignored) {
            // Header nicht verfuegbar
        }

        if (headers != null) {
            // Bevorzugt Sec-Fetch-Dest — in diesem WebView aber messbar nicht gesetzt
            String dest = headers.get("Sec-Fetch-Dest");
            if (dest == null) dest = headers.get("sec-fetch-dest");
            if (dest != null && !dest.isEmpty()) return dest;

            // Rueckfall auf Accept: Chromium sendet je Ressourcentyp eigene Werte.
            // image/... fuer Bilder, text/css fuer Styles, text/html fuer Dokumente
            // und iframes, */* fuer Skripte, Fonts und fetch/XHR.
            String accept = headers.get("Accept");
            if (accept == null) accept = headers.get("accept");
            if (accept != null && !accept.isEmpty()) {
                String value = accept.toLowerCase(Locale.ROOT);
                if (value.startsWith("image/")) return "image";
                if (value.startsWith("text/css")) return "style";
                if (value.contains("text/html")) {
                    return request.isForMainFrame() ? "document" : "iframe";
                }
                // Alles Uebrige ist aktiver Inhalt: Skript, Font oder fetch/XHR
                return "script";
            }
        }
        return request.isForMainFrame() ? "document" : "unknown";
    }

    private static String hostOf(String urlString) {
        try {
            String host = new URI(urlString).getHost();
            return host == null ? "" : host.toLowerCase(Locale.ROOT);
        } catch (Exception e) {
            return "";
        }
    }

    private void fillDomainSet(Set<String> target, JSArray source) {
        Set<String> next = new HashSet<>();
        try {
            for (String entry : source.<String>toList()) {
                if (entry != null && !entry.isEmpty()) next.add(entry.toLowerCase(Locale.ROOT));
            }
        } catch (Exception e) {
            Log.w(TAG, "domain list unreadable", e);
        }
        synchronized (target) {
            target.clear();
            target.addAll(next);
        }
    }

    /** Prueft Host und alle Elterndomains gegen die Blockliste. */
    private boolean isBlocked(String urlString) {
        String host;
        try {
            host = new URI(urlString).getHost();
        } catch (Exception e) {
            return false;
        }
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);

        synchronized (blockedHosts) {
            if (blockedHosts.isEmpty()) return false;
            if (blockedHosts.contains(host)) return true;
            // ads.example.com trifft auch, wenn example.com gelistet ist
            int dot = host.indexOf('.');
            while (dot != -1 && dot + 1 < host.length()) {
                String parent = host.substring(dot + 1);
                if (blockedHosts.contains(parent)) return true;
                dot = host.indexOf('.', dot + 1);
            }
        }
        return false;
    }

    private void closeReader() {
        if (overlay == null) return;
        overlay.setVisibility(View.GONE);
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
        }
        Log.d(TAG, "closed mangaId=" + currentMangaId);
        JSObject data = new JSObject();
        data.put("mangaId", currentMangaId == null ? "" : currentMangaId);
        notifyListeners("readerClosed", data);
        currentMangaId = null;
    }

    /**
     * Meldet eine abgewiesene Navigation ans JS.
     *
     * `reason` steuert dort die Reaktion: "ask" zeigt den Dialog, alles andere
     * wird nur protokolliert — der Nutzer soll bei automatischen Umleitungen
     * gerade nicht gefragt werden.
     */
    private void notifyBlocked(String url, String domain, String reason, boolean hasGesture) {
        // Automatische Umleitungen und Werbe-Hosts feuern haeufig — nur die
        // Faelle mit Rueckfrage sind einzeln interessant.
        String line = "navBlocked reason=" + reason + " gesture=" + hasGesture
                + " domain=" + domain + " url=" + url;
        if ("ask".equals(reason)) {
            Log.i(TAG, line);
        } else {
            Log.d(TAG, line);
        }
        JSObject data = new JSObject();
        data.put("url", url);
        data.put("domain", domain);
        data.put("reason", reason);
        data.put("hasGesture", hasGesture);
        data.put("mangaId", currentMangaId == null ? "" : currentMangaId);
        notifyListeners("readerNavigationBlocked", data);
    }

    private void emitUrlChanged(String url) {
        if (url == null || url.isEmpty() || "about:blank".equals(url)) return;
        if (url.equals(lastReportedUrl)) return;
        lastReportedUrl = url;
        if (urlLabel != null) urlLabel.setText(url);
        Log.d(TAG, "urlChanged " + url);
        JSObject data = new JSObject();
        data.put("url", url);
        data.put("mangaId", currentMangaId == null ? "" : currentMangaId);
        notifyListeners("readerUrlChanged", data);
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void ensureOverlay() {
        if (overlay != null) return;

        overlay = new FrameLayout(getActivity());
        overlay.setBackgroundColor(Color.BLACK);
        overlay.setVisibility(View.GONE);

        LinearLayout column = new LinearLayout(getActivity());
        column.setOrientation(LinearLayout.VERTICAL);

        // Schlanke Kopfzeile: Schliessen + aktuelle URL
        final LinearLayout bar = new LinearLayout(getActivity());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.parseColor("#101014"));
        bar.setGravity(Gravity.CENTER_VERTICAL);
        final int pad = dp(8);
        bar.setPadding(pad, pad, pad, pad);


        TextView closeButton = new TextView(getActivity());
        closeButton.setText("✕");
        closeButton.setTextColor(Color.WHITE);
        closeButton.setTextSize(18);
        closeButton.setPadding(dp(12), 0, dp(16), 0);
        closeButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                closeReader();
            }
        });
        bar.addView(closeButton);

        urlLabel = new TextView(getActivity());
        urlLabel.setTextColor(Color.parseColor("#9CA3AF"));
        urlLabel.setTextSize(11);
        urlLabel.setSingleLine(true);
        urlLabel.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
        bar.addView(urlLabel, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        column.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        webView = new WebView(getActivity());
        configureWebView(webView);
        column.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        overlay.addView(column, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Ein Listener fuer beide Kanten. Das Overlay liegt ueber dem gesamten
        // DecorView, also auch unter Statusleiste und Navigationsleiste — ohne
        // Insets sass die Kopfzeile hinter der Uhrzeit und das eingeblendete
        // Angebot hinter den Navigations-Tasten.
        toolbar = bar;
        toolbarPadding = pad;

        overlay.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public android.view.WindowInsets onApplyWindowInsets(View v, android.view.WindowInsets insets) {
                applyInsets();
                return insets;
            }
        });

        ViewGroup root = (ViewGroup) getActivity().getWindow().getDecorView();
        root.addView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.requestApplyInsets();
    }


    /**
     * Setzt die System-Insets als Padding.
     *
     * Direkt abgefragt statt auf onApplyWindowInsets zu warten: das Overlay haengt
     * unmittelbar im DecorView, und dorthin werden Insets nicht zuverlaessig
     * weitergereicht — die eingeblendete Leiste lag dadurch weiter hinter den
     * Navigations-Tasten.
     */
    private void applyInsets() {
        if (overlay == null) return;
        int top = 0;
        int bottom = 0;
        try {
            android.view.WindowInsets insets = getActivity().getWindow()
                    .getDecorView().getRootWindowInsets();
            if (insets != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets bars =
                            insets.getInsets(android.view.WindowInsets.Type.systemBars());
                    top = bars.top;
                    bottom = bars.bottom;
                } else {
                    top = insets.getSystemWindowInsetTop();
                    bottom = insets.getSystemWindowInsetBottom();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "insets unavailable", e);
        }
        // Fallback: Samsung meldet bei Gestensteuerung teils 0 — eine kleine
        // Reserve verhindert, dass die Leiste am Rand klebt.
        if (bottom <= 0) bottom = dp(24);
        if (toolbar != null) {
            toolbar.setPadding(toolbarPadding, toolbarPadding + top, toolbarPadding, toolbarPadding);
        }
        overlay.setPadding(0, 0, 0, bottom);
        Log.d(TAG, "insets top=" + top + " bottom=" + bottom);
    }

    private int dp(int value) {
        float density = getActivity().getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(true);
        // Popups werden in onCreateWindow abgelehnt; ohne setSupportMultipleWindows
        // wuerde der WebView sie stattdessen im gleichen Fenster oeffnen.
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                String requestUrl = request.getUrl() == null ? null : request.getUrl().toString();
                if (requestUrl != null) {
                    String host = hostOf(requestUrl);
                    if (!host.isEmpty() && !baseDomain(host).equals(baseDomain(pageHost))) {
                        if (thirdPartyHosts.size() < 80) {
                            thirdPartyHosts.add(host + "|" + destinationOf(request));
                        }
                    }
                }
                if (requestUrl != null && isBlocked(requestUrl)) {
                    blockedCount.incrementAndGet();
                    Log.d(TAG, "blocked host " + requestUrl);
                    return emptyResponse();
                }

                if (requestUrl != null && strictThirdParty && isForeignActiveContent(request, requestUrl)) {
                    blockedCount.incrementAndGet();
                    Log.d(TAG, "blocked 3p " + destinationOf(request) + " " + requestUrl);
                    return emptyResponse();
                }

                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                String target = request.getUrl() == null ? "" : request.getUrl().toString();

                // Externe Schemata sind auf Leseseiten praktisch immer Werbung
                if (!target.startsWith("http://") && !target.startsWith("https://")) {
                    notifyBlocked(target, "", "scheme", false);
                    return true;
                }

                // Einmal-Freigabe aus dem Guard-Dialog
                String pendingAllow = allowOnceUrl;
                if (pendingAllow != null && pendingAllow.equals(target)) {
                    allowOnceUrl = null;
                    return false;
                }

                if (isBlocked(target)) {
                    notifyBlocked(target, hostOf(target), "adhost", request.hasGesture());
                    return true;
                }

                String targetDomain = baseDomain(hostOf(target));
                // Gleiche Seite: immer durchlassen
                if (targetDomain.isEmpty() || targetDomain.equals(originDomain)) return false;
                if ("off".equals(guardMode)) return false;

                synchronized (guardBlocked) {
                    if (guardBlocked.contains(targetDomain)) {
                        notifyBlocked(target, targetDomain, "blocklist", request.hasGesture());
                        return true;
                    }
                }
                synchronized (guardAllowed) {
                    if (guardAllowed.contains(targetDomain)) return false;
                }

                // Der Kern: eine Navigation auf eine fremde Domain *ohne* Nutzergeste
                // ist die ungefragte Umleitung, die beim Scrollen die Seite wegreisst.
                // Die wird stumm verworfen, ohne zu fragen.
                if (!request.hasGesture()) {
                    notifyBlocked(target, targetDomain, "auto", false);
                    return true;
                }

                // Mit Geste: je nach Modus blocken oder nachfragen. In beiden Faellen
                // wird die Navigation erst verworfen; ein "ja" navigiert per setUrl.
                notifyBlocked(target, targetDomain, "block".equals(guardMode) ? "mode" : "ask", true);
                return true;
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean isReload) {
                emitUrlChanged(url);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                emitUrlChanged(url);
                Log.i(TAG, "pageFinished blockedRequests=" + blockedCount.get() + " url=" + url);
                // Bis zu 80 Hostnamen pro Seitenladung — nur auf Debug-Ebene,
                // sonst flutet es das Log. Zum Pflegen der Werbeliste:
                // adb logcat -s MangaReader:D | grep thirdPartyHosts
                synchronized (thirdPartyHosts) {
                    Log.d(TAG, "thirdPartyHosts(" + thirdPartyHosts.size() + ")="
                            + android.text.TextUtils.join(",", thirdPartyHosts));
                }
                JSObject data = new JSObject();
                data.put("url", url == null ? "" : url);
                notifyListeners("readerPageFinished", data);
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView v, boolean isDialog, boolean isUserGesture,
                                          android.os.Message resultMsg) {
                // Popup-Fenster ablehnen — das Pendant zu setWindowOpenHandler auf Desktop
                Log.d(TAG, "popup denied (userGesture=" + isUserGesture + ")");
                return blockPopups ? false : super.onCreateWindow(v, isDialog, isUserGesture, resultMsg);
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                String text = message.message();
                if (text != null && text.startsWith(MESSAGE_PREFIX)) {
                    Log.d(TAG, "message " + (text.length() > 160 ? text.substring(0, 160) : text));
                    JSObject data = new JSObject();
                    data.put("message", text);
                    data.put("mangaId", currentMangaId == null ? "" : currentMangaId);
                    notifyListeners("readerMessage", data);
                    return true;
                }
                return super.onConsoleMessage(message);
            }
        });
    }
}
