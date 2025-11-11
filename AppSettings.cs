// AppSettings.cs
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

public enum LinkOpenMode { Ask, OpenMain, OpenChapter }
public enum LanguageMode { German, English }

public static class AppSettings
{
    public static LinkOpenMode LinkOpenBehavior { get; set; } = LinkOpenMode.Ask;
    public static bool UseSystemBrowser { get; set; } = false;

    public static LanguageMode Language { get; set; } = LanguageMode.German;

    // Adblock
    public static bool AdblockEnabled { get; set; } = true;
    public static bool AdblockDryRun { get; set; } = false;
    public static bool AdblockBlockNewWindows { get; set; } = true;
    public static bool AdblockPopupOpenInSameTab { get; set; } = false;
    public static bool AdblockBlockInPageOverlays { get; set; } = true;

    public static List<string> AdblockSiteAllowlist { get; set; } = new();
    public static List<string> AdblockHardBlockDomainPatterns { get; set; } = new();
    public static List<string> JsOnlyHosts { get; set; } = new();


    // NEU: persistente Domainverwaltung für Navigationsschutz
    public static List<string> ExternalAllowedHosts { get; set; } = new(); // explizit immer erlauben
    public static List<string> ExternalBlockedHosts { get; set; } = new(); // explizit immer blockieren

    // Store settings under LocalAppData to avoid write issues in install dirs
    private static string GetSettingsDirectory()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MangaTracker");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string SettingsFilePath => Path.Combine(GetSettingsDirectory(), "settings.json");
    private static string LegacySettingsFileName => "settings.json"; // fallback in working directory

    public static void Save()
    {
        var obj = new PersistedSettings
        {
            LinkOpenBehavior = LinkOpenBehavior,
            UseSystemBrowser = UseSystemBrowser,
            Language = Language,
            AdblockEnabled = AdblockEnabled,
            AdblockDryRun = AdblockDryRun,
            AdblockBlockNewWindows = AdblockBlockNewWindows,
            AdblockPopupOpenInSameTab = AdblockPopupOpenInSameTab,
            AdblockBlockInPageOverlays = AdblockBlockInPageOverlays,
            AdblockSiteAllowlist = AdblockSiteAllowlist,
            AdblockHardBlockDomainPatterns = AdblockHardBlockDomainPatterns,
            ExternalAllowedHosts = ExternalAllowedHosts,
            ExternalBlockedHosts = ExternalBlockedHosts,
            JsOnlyHosts = JsOnlyHosts,
        };

        var json = JsonSerializer.Serialize(
            obj,
            new JsonSerializerOptions { WriteIndented = true, Converters = { new JsonStringEnumConverter() } }
        );
        try
        {
            File.WriteAllText(SettingsFilePath, json);
        }
        catch
        {
            // Fallback: try legacy path if LocalAppData write fails
            try { File.WriteAllText(LegacySettingsFileName, json); } catch { }
        }
    }

    public static void Load()
    {
        string? pathToLoad = null;
        // Prefer new location
        if (File.Exists(SettingsFilePath))
            pathToLoad = SettingsFilePath;
        // Backward-compat: load from legacy working directory
        else if (File.Exists(LegacySettingsFileName))
            pathToLoad = LegacySettingsFileName;

        if (pathToLoad is null)
            return;

        try
        {
            var opts = new JsonSerializerOptions { Converters = { new JsonStringEnumConverter() } };
            var s = JsonSerializer.Deserialize<PersistedSettings>(File.ReadAllText(pathToLoad), opts);
            if (s != null)
            {
                LinkOpenBehavior = s.LinkOpenBehavior;
                UseSystemBrowser = s.UseSystemBrowser;
                Language = s.Language;
                AdblockEnabled = s.AdblockEnabled;
                AdblockDryRun = s.AdblockDryRun;
                AdblockBlockNewWindows = s.AdblockBlockNewWindows;
                AdblockPopupOpenInSameTab = s.AdblockPopupOpenInSameTab;
                AdblockBlockInPageOverlays = s.AdblockBlockInPageOverlays;
                AdblockSiteAllowlist = s.AdblockSiteAllowlist ?? new();
                AdblockHardBlockDomainPatterns = s.AdblockHardBlockDomainPatterns ?? new();
                ExternalAllowedHosts = s.ExternalAllowedHosts ?? new();
                ExternalBlockedHosts = s.ExternalBlockedHosts ?? new();
                JsOnlyHosts = s.JsOnlyHosts ?? new();
                return;
            }
            // Ensure non-null lists even if deserialize returned null
            JsOnlyHosts ??= new List<string>();

        }
        catch { /* optional Logging */ }

        // robuster Fallback (alt) – hier könntest du deine alte Logik lassen, falls nötig
        // (der Kürze halber weggelassen)
    }

    private sealed class PersistedSettings
    {
        public LinkOpenMode LinkOpenBehavior { get; set; }
        public bool UseSystemBrowser { get; set; }
        public LanguageMode Language { get; set; }

        public bool AdblockEnabled { get; set; }
        public bool AdblockDryRun { get; set; }
        public bool AdblockBlockNewWindows { get; set; }
        public bool AdblockPopupOpenInSameTab { get; set; }
        public bool AdblockBlockInPageOverlays { get; set; }
        public List<string>? AdblockSiteAllowlist { get; set; }
        public List<string>? AdblockHardBlockDomainPatterns { get; set; }

        // NEU
        public List<string>? ExternalAllowedHosts { get; set; }
        public List<string>? ExternalBlockedHosts { get; set; }
        public List<string>? JsOnlyHosts { get; set; }
    }
}
