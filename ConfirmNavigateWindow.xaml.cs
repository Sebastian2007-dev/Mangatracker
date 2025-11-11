using System.Windows;

namespace MangaTracker
{
    public enum ConfirmNavigateResult { Yes, No, Block, Allow }

    public partial class ConfirmNavigateWindow : Window
    {
        public ConfirmNavigateResult Result { get; private set; } = ConfirmNavigateResult.No;

        public ConfirmNavigateWindow(string fromHost, string toHost)
        {
            InitializeComponent();
            MessageText.Text =
                $"Sie verlassen '{fromHost}' und wechseln zu '{toHost}'.\n\n" +
                "Wie möchten Sie fortfahren?";
        }

        private void Yes_Click(object sender, RoutedEventArgs e)
        {
            Result = ConfirmNavigateResult.Yes;
            DialogResult = true;
        }

        private void No_Click(object sender, RoutedEventArgs e)
        {
            Result = ConfirmNavigateResult.No;
            DialogResult = false;
        }

        private void Block_Click(object sender, RoutedEventArgs e)
        {
            Result = ConfirmNavigateResult.Block;
            DialogResult = true;
        }

        private void Allow_Click(object sender, RoutedEventArgs e)
        {
            Result = ConfirmNavigateResult.Allow;
            DialogResult = true;
        }
    }
}
