using System;
using System.Diagnostics;
using System.IO;
using System.Windows;
using MangaTracker.Services.Logging;

namespace MangaTracker
{
    public partial class HelpWindow : Window
    {
        public HelpWindow()
        {
            InitializeComponent();
        }

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private void Rescan_Click(object sender, RoutedEventArgs e)
        {
            if (this.Owner is MainWindow mw)
            {
                try { mw.RescanAll(); } catch { }
            }
        }

        private void ClearLog_Click(object sender, RoutedEventArgs e)
        {
            try { DebugLog.Clear(); } catch { }
        }

        private void OpenLogFolder_Click(object sender, RoutedEventArgs e)
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

