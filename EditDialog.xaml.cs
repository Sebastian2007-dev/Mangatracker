using System.Windows;

namespace MangaTracker
{
    public partial class EditDialog : Window
    {
        private MangaEntry _entry;

        public EditDialog(MangaEntry entry)
        {
            InitializeComponent();
            _entry = entry;

            TitleBox.Text = _entry.Title;
            UrlBox.Text = _entry.Url;
            ChapterUrlBox.Text = _entry.ChapterUrlTemplate; // NEU
        }

        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            _entry.Title = TitleBox.Text;
            _entry.Url = UrlBox.Text;
            _entry.ChapterUrlTemplate = ChapterUrlBox.Text; // NEU
            DialogResult = true;
            Close();
        }

    }
}
