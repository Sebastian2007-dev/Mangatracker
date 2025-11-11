using System;
using System.Collections.Generic;
using System.Linq;
using MangaTracker.Services.Logging;

namespace MangaTracker.Services.ChapterTracking
{
    /// <summary>
    /// Verwaltet per-Host-Strategien (z. B. JS-only) – inkl. Persistenz in AppSettings.
    /// </summary>
    public static class HostStrategy
    {
        private static readonly HashSet<string> _jsOnly = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>Beim Programmstart einmalig aufrufen.</summary>
        public static void InitializeFromSettings()
        {
            var list = AppSettings.JsOnlyHosts ?? new List<string>();
            _jsOnly.Clear();
            foreach (var h in list.Where(s => !string.IsNullOrWhiteSpace(s)))
                _jsOnly.Add(Norm(h));
            AppSettings.JsOnlyHosts = _jsOnly.ToList();
        }

        public static bool IsJsOnly(string host)
        {
            if (string.IsNullOrWhiteSpace(host))
                return false;
            return _jsOnly.Contains(Norm(host));
        }

        /// <summary>Markiert Host als JS-only (fügt zu Settings hinzu und speichert).</summary>
        public static void MarkJsOnly(string host)
        {
            if (string.IsNullOrWhiteSpace(host))
                return;
            host = Norm(host);
            if (_jsOnly.Add(host))
            {
                AppSettings.JsOnlyHosts ??= new List<string>();
                if (!AppSettings.JsOnlyHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
                    AppSettings.JsOnlyHosts.Add(host);
                AppSettings.Save(); // dauerhaft merken
                DebugLog.Info($"Host als JS-only gespeichert: {host}");
            }
        }

        private static string Norm(string host) => host.Trim().TrimEnd('.').ToLowerInvariant();
    }

}