// Services/Logging/DebugTraceListener.cs
namespace MangaTracker.Services.Logging
{
    public sealed class DebugTraceListener : System.Diagnostics.TraceListener
    {
        public override void Write(string? message)
        {
            if (!string.IsNullOrEmpty(message))
                DebugLog.Raw(message);   // <- Raw MUST NOT call Trace.WriteLine
        }

        public override void WriteLine(string? message)
        {
            if (!string.IsNullOrEmpty(message))
                DebugLog.Raw(message);
        }
    }
}
