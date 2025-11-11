using System.Windows;
using System.Windows.Media;

namespace MangaTracker
{
    public partial class OpenLinkDialog : Window
    {
        public enum LinkChoice
        {
            None,
            Main,
            Chapter
        }

        public LinkChoice Result { get; private set; } = LinkChoice.None;

        public OpenLinkDialog(MangaEntry manga)
        {
            InitializeComponent();

            // Dark-Theme übernehmen
            this.Resources.MergedDictionaries.Clear();
            foreach (var dict in Application.Current.Resources.MergedDictionaries)
                this.Resources.MergedDictionaries.Add(dict);

            // Farben anwenden
            this.Background = (Brush)Application.Current.Resources["WindowBackgroundBrush"];
            this.Foreground = (Brush)Application.Current.Resources["TextBrush"];

            this.DataContext = manga;
        }


        private void OpenChapter_Click(object sender, RoutedEventArgs e)
        {
            Result = LinkChoice.Chapter;
            Close();
        }

        private void OpenMain_Click(object sender, RoutedEventArgs e)
        {
            Result = LinkChoice.Main;
            Close();
        }

        private void Cancel_Click(object sender, RoutedEventArgs e)
        {
            Result = LinkChoice.None;
            Close();
        }
    }
}
