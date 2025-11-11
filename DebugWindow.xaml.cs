using System;
using System.Collections.Specialized;
using System.Linq;
using System.Text;
using System.Windows;
using MangaTracker.Services.Logging;

namespace MangaTracker
{
    public partial class DebugWindow : Window
    {
        public DebugWindow()
        {
            InitializeComponent();
            DataContext = DebugLog.Entries;

            // Auto-Scroll
            DebugLog.Entries.CollectionChanged += Entries_CollectionChanged;
        }

        protected override void OnClosed(EventArgs e)
        {
            DebugLog.Entries.CollectionChanged -= Entries_CollectionChanged;
            base.OnClosed(e);
        }

        private void Entries_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            // ans Ende scrollen
            Scroller?.ScrollToEnd();
        }

        private void Rescan_Click(object sender, RoutedEventArgs e)
        {
            if (Owner is MainWindow mw)
            {
                DebugLog.Info("Rescan via Debug-Fenster gestartet …");
                mw.RescanAll();
            }
        }

        private void Clear_Click(object sender, RoutedEventArgs e)
        {
            DebugLog.Clear();
        }

        private void Copy_Click(object sender, RoutedEventArgs e)
        {
            var text = string.Join(Environment.NewLine, DebugLog.Entries.ToArray());
            Clipboard.SetText(text);
        }
    }
}
