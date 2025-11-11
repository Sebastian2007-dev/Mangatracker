// SettingsWindow.xaml.cs
using System;
using System.Diagnostics;
using System.Collections.Specialized;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using MangaTracker.Services.Logging;

namespace MangaTracker
{
    public partial class SettingsWindow : Window
    {
        private ListBox? _debugList;
        public SettingsWindow()
        {
            InitializeComponent();

            // Allgemein
            LinkBehaviorBox.SelectedIndex = AppSettings.LinkOpenBehavior switch
            {
                LinkOpenMode.Ask => 0,
                LinkOpenMode.OpenChapter => 1,
                LinkOpenMode.OpenMain => 2,
                _ => 0
            };
            UseSystemBrowserCheckBox.IsChecked = AppSettings.UseSystemBrowser;
            LanguageBox.SelectedIndex = (AppSettings.Language == LanguageMode.German) ? 0 : 1;

            // Adblock
            AdblockEnabledCheckBox.IsChecked = AppSettings.AdblockEnabled;
            AdblockDryRunCheckBox.IsChecked = AppSettings.AdblockDryRun;
            AdblockBlockNewWindowsCheckBox.IsChecked = AppSettings.AdblockBlockNewWindows;
            AdblockPopupSameTabCheckBox.IsChecked = AppSettings.AdblockPopupOpenInSameTab;
            AdblockBlockOverlaysCheckBox.IsChecked = AppSettings.AdblockBlockInPageOverlays;

            AllowlistText.Text = string.Join(Environment.NewLine, AppSettings.AdblockSiteAllowlist ?? new());
            DenylistText.Text = string.Join(Environment.NewLine, AppSettings.AdblockHardBlockDomainPatterns ?? new());

            UpdateAdblockChildrenEnabled();
            AdblockEnabledCheckBox.Checked += (_, __) => UpdateAdblockChildrenEnabled();
            AdblockEnabledCheckBox.Unchecked += (_, __) => UpdateAdblockChildrenEnabled();

            // Domainverwaltung
            AllowedHostsList.ItemsSource = null;
            AllowedHostsList.ItemsSource = AppSettings.ExternalAllowedHosts;
            BlockedHostsList.ItemsSource = null;
            BlockedHostsList.ItemsSource = AppSettings.ExternalBlockedHosts;

            // Debug: Auto-Scroll der Log-ListBox
            try
            {
                _debugList = this.FindName("DebugLogList") as ListBox;
                DebugLog.Entries.CollectionChanged += DebugEntries_CollectionChanged;
            }
            catch { }
        }

        private void DebugEntries_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            try
            {
                if (_debugList == null) return;
                if (!IsLoaded) return;
                // Scroll sanft ans Ende
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (_debugList!.Items.Count > 0)
                        _debugList.ScrollIntoView(_debugList.Items[_debugList.Items.Count - 1]);
                }));
            }
            catch { }
        }

        private void UpdateAdblockChildrenEnabled()
        {
            bool on = AdblockEnabledCheckBox.IsChecked == true;
            AdblockDryRunCheckBox.IsEnabled = on;
            AdblockBlockNewWindowsCheckBox.IsEnabled = on;
            AdblockPopupSameTabCheckBox.IsEnabled = on && (AdblockBlockNewWindowsCheckBox.IsChecked == true);
            AdblockBlockOverlaysCheckBox.IsEnabled = on;
            AllowlistText.IsEnabled = on;
            DenylistText.IsEnabled = on;

            AdblockBlockNewWindowsCheckBox.Checked += (_, __) =>
                AdblockPopupSameTabCheckBox.IsEnabled = AdblockEnabledCheckBox.IsChecked == true;
            AdblockBlockNewWindowsCheckBox.Unchecked += (_, __) =>
            {
                AdblockPopupSameTabCheckBox.IsChecked = false;
                AdblockPopupSameTabCheckBox.IsEnabled = false;
            };
        }

        private void Save_Click(object sender, RoutedEventArgs e)
        {
            // Allgemein
            AppSettings.LinkOpenBehavior = LinkBehaviorBox.SelectedIndex switch
            {
                1 => LinkOpenMode.OpenChapter,
                2 => LinkOpenMode.OpenMain,
                _ => LinkOpenMode.Ask
            };
            AppSettings.UseSystemBrowser = UseSystemBrowserCheckBox.IsChecked == true;
            AppSettings.Language = (LanguageBox.SelectedIndex == 0) ? LanguageMode.German : LanguageMode.English;

            // Adblock
            AppSettings.AdblockEnabled = AdblockEnabledCheckBox.IsChecked == true;
            AppSettings.AdblockDryRun = AdblockDryRunCheckBox.IsChecked == true;
            AppSettings.AdblockBlockNewWindows = AdblockBlockNewWindowsCheckBox.IsChecked == true;
            AppSettings.AdblockPopupOpenInSameTab = AdblockPopupSameTabCheckBox.IsChecked == true;
            AppSettings.AdblockBlockInPageOverlays = AdblockBlockOverlaysCheckBox.IsChecked == true;

            AppSettings.AdblockSiteAllowlist = AllowlistText.Text
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            AppSettings.AdblockHardBlockDomainPatterns = DenylistText.Text
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // Domainverwaltung – Listen sind via ItemsSource direkt gebunden; nur persistieren
            AppSettings.Save();
            Close();
        }

        private void Cancel_Click(object sender, RoutedEventArgs e) => Close();

        // --- Domainverwaltung Buttons ---
        private void AddAllowed_Click(object sender, RoutedEventArgs e)
        {
            var host = (HostInputBox.Text ?? "").Trim();
            if (string.IsNullOrEmpty(host))
                return;
            if (!AppSettings.ExternalAllowedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
                AppSettings.ExternalAllowedHosts.Add(host);
            // sicherstellen, dass nicht gleichzeitig blockiert
            AppSettings.ExternalBlockedHosts.RemoveAll(h => string.Equals(h, host, StringComparison.OrdinalIgnoreCase));
            AllowedHostsList.Items.Refresh();
            BlockedHostsList.Items.Refresh();
            HostInputBox.Clear();
        }

        private void AddBlocked_Click(object sender, RoutedEventArgs e)
        {
            var host = (HostInputBox.Text ?? "").Trim();
            if (string.IsNullOrEmpty(host))
                return;
            if (!AppSettings.ExternalBlockedHosts.Contains(host, StringComparer.OrdinalIgnoreCase))
                AppSettings.ExternalBlockedHosts.Add(host);
            // nicht gleichzeitig erlaubt
            AppSettings.ExternalAllowedHosts.RemoveAll(h => string.Equals(h, host, StringComparison.OrdinalIgnoreCase));
            BlockedHostsList.Items.Refresh();
            AllowedHostsList.Items.Refresh();
            HostInputBox.Clear();
        }

        private void RemoveAllowed_Click(object sender, RoutedEventArgs e)
        {
            var sel = AllowedHostsList.SelectedItem as string;
            if (sel == null)
                return;
            AppSettings.ExternalAllowedHosts.RemoveAll(h => string.Equals(h, sel, StringComparison.OrdinalIgnoreCase));
            AllowedHostsList.Items.Refresh();
        }

        private void RemoveBlocked_Click(object sender, RoutedEventArgs e)
        {
            var sel = BlockedHostsList.SelectedItem as string;
            if (sel == null)
                return;
            AppSettings.ExternalBlockedHosts.RemoveAll(h => string.Equals(h, sel, StringComparison.OrdinalIgnoreCase));
            BlockedHostsList.Items.Refresh();
        }

        // --- Debug Tab ---
        private void Debug_Rescan_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (this.Owner is MainWindow mw)
                    mw.RescanAll();
            }
            catch { }
        }

        private void Debug_ClearLog_Click(object sender, RoutedEventArgs e)
        {
            try { DebugLog.Clear(); } catch { }
        }

        private void Debug_OpenLogFolder_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "MangaTracker", "Logs");
                Directory.CreateDirectory(dir);
                Process.Start(new ProcessStartInfo
                {
                    FileName = dir,
                    UseShellExecute = true,
                    Verb = "open"
                });
            }
            catch { }
        }
    }
}
