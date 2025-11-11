using System;
using System.IO;
using System.Text;
using System.Threading;

internal static class LogFile
{
    private static readonly object _lock = new();
    private static string EnsureDir()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MangaTracker", "Logs");
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static void WriteFetcher(string line)
    {
        WriteCore("fetcher", line);
    }

    public static void WriteWv2(string line)
    {
        WriteCore("wv2", line);
    }

    private static void WriteCore(string prefix, string line)
    {
        try
        {
            var dir = EnsureDir();
            var file = Path.Combine(dir, $"{prefix}-{DateTime.UtcNow:yyyyMMdd}.txt");
            var stamp = $"{DateTime.Now:HH:mm:ss.fff} {line}";
            lock (_lock)
            {
                File.AppendAllText(file, stamp + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch
        {
            // Logging darf nie Fehler werfen – still schlucken
        }
    }
}
