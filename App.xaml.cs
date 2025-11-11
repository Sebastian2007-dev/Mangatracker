using System;
using System.IO;
using System.Linq;
using System.Windows;

namespace MangaTracker
{
    public partial class App : Application
    {
        // Öffentliche Methode, die du bereits aus MainWindow nutzt
        public void ChangeTheme(string themeName)
        {
            // themeName erwartet: "Light", "Dark" oder "System"
            string effective = themeName;

            if (string.Equals(themeName, "System", StringComparison.OrdinalIgnoreCase))
            {
                // einfache Heuristik: wenn OS dunkel ist, Dark, sonst Light
                // Falls du schon eine eigene Logik hast -> hier ersetzen
                effective = IsOsDark() ? "Dark" : "Light";
            }

            var dicts = Resources.MergedDictionaries;
            dicts.Clear();

            // 1) Palette
            string palettePath = effective.Equals("Dark", StringComparison.OrdinalIgnoreCase)
                                ? "Themes/DarkPalette.xaml"
                                : "Themes/LightPalette.xaml";

            dicts.Add(LoadDictSafe(palettePath, "fallback palette (light)",
                @"<ResourceDictionary xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation""
                                      xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"">
                    <SolidColorBrush x:Key=""WindowBackgroundBrush"" Color=""#FFFFFFFF""/>
                    <SolidColorBrush x:Key=""TextBrush"" Color=""#FF000000""/>
                    <SolidColorBrush x:Key=""ControlBackgroundBrush"" Color=""#FFF7F8FA""/>
                    <SolidColorBrush x:Key=""BorderBrush"" Color=""#FFCDD2DE""/>
                    <SolidColorBrush x:Key=""ButtonBrush"" Color=""#FFF2F3F7""/>
                    <SolidColorBrush x:Key=""ButtonHoverBrush"" Color=""#FFE9EBF2""/>
                    <SolidColorBrush x:Key=""ItemHoverBrush"" Color=""#FFEFF2F7""/>
                    <SolidColorBrush x:Key=""ItemSelectedBrush"" Color=""#FFE3E8F2""/>
                    <SolidColorBrush x:Key=""AccentBrush"" Color=""#FF2F6DFE""/>
                    <SolidColorBrush x:Key=""TabBackgroundBrush"" Color=""#FFF7F8FA""/>
                    <SolidColorBrush x:Key=""TabHoverBrush"" Color=""#FFE9EBF2""/>
                    <SolidColorBrush x:Key=""TabSelectedBrush"" Color=""#FFFFFFFF""/>
                    <SolidColorBrush x:Key=""TabBorderBrush"" Color=""#FFCDD2DE""/>
                    <SolidColorBrush x:Key=""DisabledTextBrush"" Color=""#FF7A7A7A""/>
                    <SolidColorBrush x:Key=""CardBackgroundBrush"" Color=""#FFFFFFFF""/>
                </ResourceDictionary>"));

            // 2) Gemeinsame Styles
            dicts.Add(LoadDictSafe("Themes/BaseStyles.xaml", "fallback base styles",
                @"<ResourceDictionary xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation""
                                      xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"">
                    <BooleanToVisibilityConverter x:Key=""BoolToVis""/>
                    <Style TargetType=""Window"">
                        <Setter Property=""Background"" Value=""{DynamicResource WindowBackgroundBrush}""/>
                        <Setter Property=""Foreground"" Value=""{DynamicResource TextBrush}""/>
                    </Style>
                </ResourceDictionary>"));
        }

        private static bool IsOsDark()
        {
            try
            {
                // einfache Registry-Heuristik für Windows 10/11
                using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                var v = k?.GetValue("AppsUseLightTheme");
                return v is int i && i == 0; // 0 = Dark, 1 = Light
            }
            catch { return false; }
        }

        private ResourceDictionary LoadDictSafe(string relativePackUri, string tag, string? xmlFallback = null)
        {
            try
            {
                // Achtung: Pfade sind case-sensitiv. Build Action muss "Resource" sein.
                return new ResourceDictionary
                {
                    Source = new Uri(relativePackUri, UriKind.Relative)
                };
            }
            catch
            {
                if (!string.IsNullOrEmpty(xmlFallback))
                {
                    using var sr = new StringReader(xmlFallback);
                    return (ResourceDictionary)System.Windows.Markup.XamlReader.Load(sr.ReadToEnd().ToStream());
                }
                // Minimaler leere Dict, damit App nicht abstürzt
                return new ResourceDictionary();
            }
        }

        private void Application_Startup(object sender, StartupEventArgs e)
        {
            string theme = "System";
            try
            {
                if (File.Exists("theme.txt"))
                    theme = File.ReadAllText("theme.txt").Trim();
            }
            catch { /* ignore */ }

            ChangeTheme(theme);

            // >>> WICHTIG: Hauptfenster erzeugen und anzeigen
            var main = new MainWindow();
            this.MainWindow = main;   // sorgt auch für korrektes Shutdown-Verhalten
            main.Show();
        }
    }

        internal static class StringStreamExt
    {
        public static Stream ToStream(this string s)
        {
            var ms = new MemoryStream();
            var sw = new StreamWriter(ms);
            sw.Write(s);
            sw.Flush();
            ms.Position = 0;
            return ms;
        }
    }
}
