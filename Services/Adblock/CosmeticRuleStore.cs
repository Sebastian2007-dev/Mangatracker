using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace MangaTracker.Services.Adblock
{
    /// <summary>
    /// Speichert kosmetische Regeln (CSS-Selektoren) und Netzwerk-Regeln (URL-Wildcards) pro Host.
    /// Persistiert nach %LocalAppData%\MangaTracker\adblock-custom.json
    /// </summary>
    public sealed class CosmeticRuleStore
    {
        private readonly object _gate = new();
        private readonly string _filePath;

        // kosmetische Regeln: host -> set(cssSelector)
        private Dictionary<string, HashSet<string>> _cosmetic = new(StringComparer.OrdinalIgnoreCase);
        // netz-regeln: host -> set(wildcardPattern)
        private Dictionary<string, HashSet<string>> _urlRules = new(StringComparer.OrdinalIgnoreCase);

        private sealed class PersistModel
        {
            public Dictionary<string, HashSet<string>>? cosmetic { get; set; }
            public Dictionary<string, HashSet<string>>? urlRules { get; set; }
        }

        public CosmeticRuleStore(string? filePath = null)
        {
            var baseDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MangaTracker");
            Directory.CreateDirectory(baseDir);
            _filePath = filePath ?? Path.Combine(baseDir, "adblock-custom.json");
            Load();
        }

        // ---- kosmetisch (CSS) ----
        public void AddRule(string host, string cssSelector)
        {
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(cssSelector))
                return;

            lock (_gate)
            {
                if (!_cosmetic.TryGetValue(host, out var set))
                    _cosmetic[host] = set = new HashSet<string>(StringComparer.Ordinal);

                set.Add(cssSelector.Trim());
                Save();
            }
        }

        public IReadOnlyCollection<string> GetRules(string host)
        {
            lock (_gate)
            {
                if (_cosmetic.TryGetValue(host, out var set))
                    return set;
                return Array.Empty<string>();
            }
        }

        public string BuildCssForHost(string host)
        {
            var rules = GetRules(host);
            if (rules.Count == 0)
                return string.Empty;

            using var sw = new StringWriter();
            foreach (var sel in rules)
                sw.WriteLine($"{sel}{{display:none !important;visibility:hidden !important;}}");
            return sw.ToString();
        }

        // ---- netz (URL-Wildcards) ----
        public void AddUrlRule(string host, string pattern)
        {
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(pattern))
                return;
            lock (_gate)
            {
                if (!_urlRules.TryGetValue(host, out var set))
                    _urlRules[host] = set = new HashSet<string>(StringComparer.Ordinal);
                set.Add(pattern.Trim());
                Save();
            }
        }

        public IReadOnlyCollection<string> GetUrlRules(string host)
        {
            lock (_gate)
            {
                if (_urlRules.TryGetValue(host, out var set))
                    return set;
                return Array.Empty<string>();
            }
        }

        // ---- Persistenz ----
        private void Load()
        {
            try
            {
                if (!File.Exists(_filePath))
                    return;
                var json = File.ReadAllText(_filePath);
                var pm = JsonSerializer.Deserialize<PersistModel>(json) ?? new PersistModel();

                _cosmetic = pm.cosmetic != null
                    ? new Dictionary<string, HashSet<string>>(pm.cosmetic, StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

                _urlRules = pm.urlRules != null
                    ? new Dictionary<string, HashSet<string>>(pm.urlRules, StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            }
            catch { /* ignore */ }
        }

        private void Save()
        {
            try
            {
                var pm = new PersistModel { cosmetic = _cosmetic, urlRules = _urlRules };
                var json = JsonSerializer.Serialize(pm, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch { /* ignore */ }
        }
    }
}
