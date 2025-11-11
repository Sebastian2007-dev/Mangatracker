// Datei: Services/Logging/DebugLog.cs
using System;
using System.Collections.ObjectModel;
using System.Windows; // für Dispatcher
using System.Threading;

namespace MangaTracker.Services.Logging
{
    public static class DebugLog
    {

        // Rohdurchleitung ohne zusätzliches Präfix/Level – für TraceListener
        // Services/Logging/DebugLog.cs
        public static void Raw(string line)
        {
            if (string.IsNullOrEmpty(line))
                return;

            // NICHT: Trace.WriteLine(line); // verursacht Rekursion!

            // In Datei als RAW/TRACE schreiben
            LogFile.Write(line, "RAW");

            // Optional: in UI übernehmen (falls du so eine Liste hast)
            // try { DebugLogEntries.Add(line); } catch { }
        }



        private static readonly object _gate = new();
        public static ObservableCollection<string> Entries { get; } = new();

        private static void Append(string level, string msg)
        {
            var line = $"{DateTime.Now:HH:mm:ss.fff} [{level}] {msg}";

            // Immer vollständig qualifizieren – vermeidet Konflikt mit unserer Methode Trace(...)
            global::System.Diagnostics.Trace.WriteLine(line);
            LogFile.Write(msg, level);

            try
            {
                // Thread-sicher in die UI-gebundene Collection schreiben
                if (Application.Current?.Dispatcher != null && !Application.Current.Dispatcher.CheckAccess())
                {
                    Application.Current.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        lock (_gate)
                            Entries.Add(line);
                    }));
                }
                else
                {
                    lock (_gate)
                        Entries.Add(line);
                }
            }
            catch { /* niemals werfen */ }
        }

        public static void Info(string msg) => Append("INFO", msg);
        public static void Warn(string msg) => Append("WARN", msg);
        public static void Error(string msg) => Append("ERROR", msg);

        // Fein-granulare Logs
        public static void Trace(string msg) => Append("TRACE", msg);

        public static void Clear()
        {
            try
            {
                if (Application.Current?.Dispatcher != null && !Application.Current.Dispatcher.CheckAccess())
                {
                    Application.Current.Dispatcher.Invoke(() => Entries.Clear());
                }
                else
                {
                    Entries.Clear();
                }
            }
            catch { }
        }
    }

    // Deine bestehende LogFile-Implementierung kannst du weiter benutzen.
    // Dieser Stub ist nur falls noch keiner da ist.
    internal static class LogFile
    {
        public static void Write(string msg, string level)
        {
            try
            {
                var baseDir = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "MangaTracker", "Logs");
                System.IO.Directory.CreateDirectory(baseDir);
                var path = System.IO.Path.Combine(baseDir, $"MangaTracker_{DateTime.Now:yyyyMMdd}.log");
                System.IO.File.AppendAllText(path, $"{DateTime.Now:HH:mm:ss.fff} [{level}] {msg}{Environment.NewLine}");
            }
            catch { }
        }

        public static void WriteWv2(string line) => Write(line, "WV2");
    }



}
