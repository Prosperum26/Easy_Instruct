using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace WinHelper
{
    /// <summary>Finding, measuring and focusing top-level windows. All coordinates are physical pixels.</summary>
    public static class WindowCommands
    {
        public static void Register(Dispatcher dispatcher)
        {
            dispatcher.Register("list_windows", ListWindows);
            dispatcher.Register("window_bounds", WindowBounds);
            dispatcher.Register("foreground_window", ForegroundWindow);
            dispatcher.Register("focus_window", FocusWindow);
            dispatcher.Register("display_info", DisplayInfo);
        }

        /// <summary>The primary display; with per-monitor DPI awareness the metrics are physical pixels.</summary>
        public static object DisplayInfo(Dictionary<string, object> args)
        {
            return new Dictionary<string, object>
            {
                { "bounds", Bounds(0, 0, Win32.GetSystemMetrics(Win32.SM_CXSCREEN), Win32.GetSystemMetrics(Win32.SM_CYSCREEN)) },
            };
        }

        /// <summary>Visible, titled, unowned windows in z-order (topmost first), optionally of one process.</summary>
        public static object ListWindows(Dictionary<string, object> args)
        {
            var process = Args.OptionalString(args, "process");
            var foreground = Win32.GetForegroundWindow();
            var result = new List<object>();
            Win32.EnumWindowsProc callback = delegate(IntPtr hwnd, IntPtr unused)
            {
                if (!Win32.IsWindowVisible(hwnd) || Win32.IsCloaked(hwnd) || Win32.GetWindow(hwnd, Win32.GW_OWNER) != IntPtr.Zero) return true;
                var title = Win32.WindowTitle(hwnd);
                if (title.Length == 0) return true;
                var processName = ProcessName(hwnd);
                if (process != null && !string.Equals(processName, process, StringComparison.OrdinalIgnoreCase)) return true;
                var frame = Win32.WindowFrame(hwnd);
                if (frame.Right - frame.Left <= 0 || frame.Bottom - frame.Top <= 0) return true;

                result.Add(new Dictionary<string, object>
                {
                    { "hwnd", hwnd.ToInt64() },
                    { "title", title },
                    { "process", processName },
                    { "bounds", Bounds(frame) },
                    { "minimized", Win32.IsIconic(hwnd) },
                    { "foreground", hwnd == foreground },
                });
                return true;
            };
            Win32.EnumWindows(callback, IntPtr.Zero);
            GC.KeepAlive(callback);
            return result;
        }

        public static object WindowBounds(Dictionary<string, object> args)
        {
            var hwnd = RequireWindow(args);
            return new Dictionary<string, object>
            {
                { "bounds", Bounds(Win32.WindowFrame(hwnd)) },
                { "minimized", Win32.IsIconic(hwnd) },
                { "foreground", Win32.GetForegroundWindow() == hwnd },
            };
        }

        public static object ForegroundWindow(Dictionary<string, object> args)
        {
            var hwnd = Win32.GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return null;
            return new Dictionary<string, object>
            {
                { "hwnd", hwnd.ToInt64() },
                { "title", Win32.WindowTitle(hwnd) },
                { "process", ProcessName(hwnd) },
            };
        }

        /// <summary>
        /// Brings a window to the foreground. Windows only lets the foreground thread do that, so this
        /// briefly attaches to the current foreground thread's input (no synthetic key presses, which
        /// would open VS Code's menu bar).
        /// </summary>
        public static object FocusWindow(Dictionary<string, object> args)
        {
            var hwnd = RequireWindow(args);
            if (Win32.IsIconic(hwnd)) Win32.ShowWindow(hwnd, Win32.SW_RESTORE);

            uint unused;
            var foregroundThread = Win32.GetWindowThreadProcessId(Win32.GetForegroundWindow(), out unused);
            var ownThread = Win32.GetCurrentThreadId();
            var attached = foregroundThread != 0 && foregroundThread != ownThread &&
                           Win32.AttachThreadInput(ownThread, foregroundThread, true);
            try
            {
                Win32.BringWindowToTop(hwnd);
                Win32.SetForegroundWindow(hwnd);
            }
            finally
            {
                if (attached) Win32.AttachThreadInput(ownThread, foregroundThread, false);
            }
            return new Dictionary<string, object> { { "focused", Win32.GetForegroundWindow() == hwnd } };
        }

        private static IntPtr RequireWindow(Dictionary<string, object> args)
        {
            var hwnd = new IntPtr(Args.RequireLong(args, "hwnd"));
            if (!Win32.IsWindow(hwnd)) throw new HelperException("WINDOW_NOT_FOUND", "No window with handle " + hwnd + ".");
            return hwnd;
        }

        public static Dictionary<string, object> Bounds(int x, int y, int w, int h)
        {
            return new Dictionary<string, object> { { "x", x }, { "y", y }, { "w", w }, { "h", h } };
        }

        private static Dictionary<string, object> Bounds(RECT r)
        {
            return Bounds(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
        }

        private static string ProcessName(IntPtr hwnd)
        {
            uint pid;
            Win32.GetWindowThreadProcessId(hwnd, out pid);
            try
            {
                using (var process = Process.GetProcessById((int)pid)) return process.ProcessName;
            }
            catch (ArgumentException)
            {
                return "";
            }
        }
    }
}
