using System;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Threading.Tasks;
using MangaTracker.Services.Logging;

namespace MangaTracker
{
    internal static class GlobalExceptionLogger
    {
        [ModuleInitializer]
        public static void Init()
        {
            try
            {
                AppDomain.CurrentDomain.FirstChanceException += OnFirstChance;
                AppDomain.CurrentDomain.UnhandledException += OnUnhandled;
                TaskScheduler.UnobservedTaskException += OnUnobservedTask;
            }
            catch { }
        }

        private static void OnFirstChance(object? sender, FirstChanceExceptionEventArgs e)
        {
            try
            {
                if (e.Exception is ArgumentOutOfRangeException)
                    DebugLog.Warn($"FirstChance AOOE: {e.Exception.Message}\n{e.Exception.StackTrace}");
            }
            catch { }
        }

        private static void OnUnhandled(object? sender, UnhandledExceptionEventArgs e)
        {
            try { DebugLog.Error("UnhandledException: " + e.ExceptionObject); } catch { }
        }

        private static void OnUnobservedTask(object? sender, UnobservedTaskExceptionEventArgs e)
        {
            try { DebugLog.Error("UnobservedTaskException: " + e.Exception); } catch { }
        }
    }
}

