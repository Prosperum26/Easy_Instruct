using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace WinHelper
{
    /// <summary>Turns samples of the primary button into clicks, reported where the button is released.</summary>
    public class ClickDetector
    {
        private bool _armed;
        private bool _down;

        /// <summary>Returns [x, y] when a click completes. A press already held when watching started is ignored.</summary>
        public int[] Sample(bool down, int x, int y)
        {
            if (!_armed)
            {
                if (!down) _armed = true;
                return null;
            }
            if (down)
            {
                _down = true;
                return null;
            }
            if (!_down) return null;
            _down = false;
            return new[] { x, y };
        }
    }

    /// <summary>
    /// Reports primary-button clicks anywhere on screen while a "click" step is shown, as
    /// {"event": "click", "x", "y"} lines (physical pixels). It polls the button state instead of
    /// installing a low-level mouse hook: a hook makes every mouse event wait for this process, so a
    /// pause here (e.g. garbage collection in PowerShell) would freeze the user's mouse. No keyboard input
    /// is read.
    /// </summary>
    public static class ClickWatcher
    {
        private const int PollMs = 15;
        private const int VK_LBUTTON = 0x01;
        private const int VK_RBUTTON = 0x02;
        private const int SM_SWAPBUTTON = 23;

        private static readonly object Gate = new object();
        private static Thread _thread;
        private static volatile bool _running;

        /// <summary>Where events go; Host sets it to its output.</summary>
        public static Action<Dictionary<string, object>> Emit;

        public static bool IsWatching
        {
            get { lock (Gate) return _thread != null; }
        }

        public static void Register(Dispatcher dispatcher)
        {
            dispatcher.Register("watch_clicks", Watch);
        }

        /// <summary>Args: enabled (bool). Enabling again restarts, so a press in progress is not counted.</summary>
        public static object Watch(Dictionary<string, object> args)
        {
            object value;
            if (args == null || !args.TryGetValue("enabled", out value) || !(value is bool))
                throw new HelperException("BAD_ARGS", "\"enabled\" must be true or false.");
            Stop();
            if ((bool)value) Start();
            return new Dictionary<string, object> { { "watching", (bool)value } };
        }

        private static void Start()
        {
            lock (Gate)
            {
                _running = true;
                _thread = new Thread(Poll);
                _thread.IsBackground = true;
                _thread.Start();
            }
        }

        public static void Stop()
        {
            Thread thread;
            lock (Gate)
            {
                thread = _thread;
                _thread = null;
                _running = false;
            }
            if (thread != null) thread.Join(500);
        }

        private static void Poll()
        {
            var detector = new ClickDetector();
            while (_running)
            {
                // Left-handed setups swap the buttons; the primary button is then the right one.
                var button = GetSystemMetrics(SM_SWAPBUTTON) != 0 ? VK_RBUTTON : VK_LBUTTON;
                var down = (GetAsyncKeyState(button) & 0x8000) != 0;
                POINT point;
                if (GetCursorPos(out point))
                {
                    var click = detector.Sample(down, point.X, point.Y);
                    var emit = Emit;
                    if (click != null && emit != null && _running)
                        emit(new Dictionary<string, object> { { "event", "click" }, { "x", click[0] }, { "y", click[1] } });
                }
                Thread.Sleep(PollMs);
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X, Y;
        }

        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT point);
        [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    }

    /// <summary>Serialises responses and events onto one output, since events come from another thread.</summary>
    public class HostOutput
    {
        private readonly System.IO.TextWriter _writer;
        private readonly object _gate = new object();

        public HostOutput(System.IO.TextWriter writer) { _writer = writer; }

        public void Response(string line)
        {
            lock (_gate) _writer.WriteLine(line);
        }

        public void Event(Dictionary<string, object> payload)
        {
            var line = Json.Serialize(payload);
            lock (_gate) _writer.WriteLine(line);
        }
    }
}
