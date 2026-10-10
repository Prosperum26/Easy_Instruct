using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Windows.Automation;

namespace WinHelper
{
    /// <summary>
    /// A flat snapshot of a window's UI Automation tree. App-specific meaning (which node is VS Code's
    /// editor, sidebar, ...) is worked out on the Node side; the helper stays generic.
    /// </summary>
    public static class UiaCommands
    {
        // Chromium (VS Code, Electron) only builds its accessibility tree once a UIA client asks, so the
        // first look can see just the window frame. Callers pass minNodes to retry while the tree is smaller.
        private const int WarmupAttempts = 4;
        private const int WarmupDelayMs = 400;
        private const int MaxNameLength = 300;

        public static void Register(Dispatcher dispatcher)
        {
            dispatcher.Register("uia_snapshot", Snapshot);
        }

        /// <summary>
        /// Args: hwnd, maxDepth (default 60), maxNodes (default 5000), minNodes (default 0: no warm-up
        /// retries). Nodes are in depth-first order:
        /// {p: parent index (-1 for the window), d: depth, t: control type, n: name, id: AutomationId,
        /// c: class name, r: [x, y, w, h] in physical pixels or null}. Subtrees lying entirely outside the
        /// window (e.g. scrolled-away webview content) are skipped.
        /// </summary>
        public static object Snapshot(Dictionary<string, object> args)
        {
            var hwnd = new IntPtr(Args.RequireLong(args, "hwnd"));
            if (!Win32.IsWindow(hwnd)) throw new HelperException("WINDOW_NOT_FOUND", "No window with handle " + hwnd + ".");
            var maxDepth = Args.OptionalInt(args, "maxDepth", 60);
            var maxNodes = Args.OptionalInt(args, "maxNodes", 5000);
            var minNodes = Args.OptionalInt(args, "minNodes", 0);
            if (maxDepth < 1 || maxNodes < 1) throw new HelperException("BAD_ARGS", "maxDepth and maxNodes must be positive.");

            var frame = Win32.WindowFrame(hwnd);
            var window = new int[] { frame.Left, frame.Top, frame.Right - frame.Left, frame.Bottom - frame.Top };
            var watch = Stopwatch.StartNew();

            Walk walk = null;
            var attempts = 0;
            while (attempts < WarmupAttempts)
            {
                attempts++;
                walk = new Walk(window, maxDepth, maxNodes);
                walk.Run(hwnd);
                if (walk.Nodes.Count >= minNodes || walk.Truncated) break;
                Thread.Sleep(WarmupDelayMs);
            }

            return new Dictionary<string, object>
            {
                { "window", ToList(window) },
                { "nodes", walk.Nodes },
                { "truncated", walk.Truncated },
                { "attempts", attempts },
                { "ms", (int)watch.ElapsedMilliseconds },
            };
        }

        public static string ShortTypeName(string programmaticName)
        {
            var dot = programmaticName.LastIndexOf('.');
            return dot >= 0 ? programmaticName.Substring(dot + 1) : programmaticName;
        }

        /// <summary>Whether a subtree with this rect can contain anything visible in the window. Null rect: unknown, keep.</summary>
        public static bool Overlaps(int[] rect, int[] window)
        {
            if (rect == null) return true;
            return rect[0] < window[0] + window[2] && window[0] < rect[0] + rect[2] &&
                   rect[1] < window[1] + window[3] && window[1] < rect[1] + rect[3];
        }

        private static List<object> ToList(int[] values)
        {
            var list = new List<object>();
            foreach (var v in values) list.Add(v);
            return list;
        }

        private class Walk
        {
            private readonly int[] _window;
            private readonly int _maxDepth;
            private readonly int _maxNodes;
            private readonly CacheRequest _cache;

            public readonly List<object> Nodes = new List<object>();
            public bool Truncated;

            public Walk(int[] window, int maxDepth, int maxNodes)
            {
                _window = window;
                _maxDepth = maxDepth;
                _maxNodes = maxNodes;
                _cache = new CacheRequest();
                _cache.Add(AutomationElement.NameProperty);
                _cache.Add(AutomationElement.AutomationIdProperty);
                _cache.Add(AutomationElement.ClassNameProperty);
                _cache.Add(AutomationElement.ControlTypeProperty);
                _cache.Add(AutomationElement.BoundingRectangleProperty);
                _cache.TreeScope = TreeScope.Element;
            }

            public void Run(IntPtr hwnd)
            {
                AutomationElement root;
                using (_cache.Activate()) root = AutomationElement.FromHandle(hwnd);
                Visit(root, -1, 0);
            }

            private void Visit(AutomationElement element, int parent, int depth)
            {
                if (Nodes.Count >= _maxNodes)
                {
                    Truncated = true;
                    return;
                }

                int[] rect;
                Dictionary<string, object> node;
                try
                {
                    rect = Rect(element.Cached.BoundingRectangle);
                    if (parent >= 0 && !Overlaps(rect, _window)) return;
                    var name = element.Cached.Name ?? "";
                    node = new Dictionary<string, object>
                    {
                        { "p", parent },
                        { "d", depth },
                        { "t", ShortTypeName(element.Cached.ControlType.ProgrammaticName) },
                        { "n", name.Length > MaxNameLength ? name.Substring(0, MaxNameLength) : name },
                        { "id", element.Cached.AutomationId ?? "" },
                        { "c", element.Cached.ClassName ?? "" },
                        { "r", rect == null ? null : ToList(rect) },
                    };
                }
                catch (ElementNotAvailableException)
                {
                    return; // The UI changed while we were walking it.
                }

                var index = Nodes.Count;
                Nodes.Add(node);
                if (depth >= _maxDepth) return;

                var walker = TreeWalker.ControlViewWalker;
                AutomationElement child;
                try
                {
                    child = walker.GetFirstChild(element, _cache);
                }
                catch (ElementNotAvailableException)
                {
                    return;
                }
                while (child != null)
                {
                    Visit(child, index, depth + 1);
                    if (Truncated) return;
                    try
                    {
                        child = walker.GetNextSibling(child, _cache);
                    }
                    catch (ElementNotAvailableException)
                    {
                        return;
                    }
                }
            }

            private static int[] Rect(System.Windows.Rect r)
            {
                if (r.IsEmpty || double.IsInfinity(r.X) || double.IsNaN(r.X) || r.Width <= 0 || r.Height <= 0) return null;
                // Chromium reports int.MinValue rects for nodes it hides from assistive technology.
                if (r.X <= int.MinValue || r.Y <= int.MinValue) return null;
                return new int[] { (int)Math.Round(r.X), (int)Math.Round(r.Y), (int)Math.Round(r.Width), (int)Math.Round(r.Height) };
            }
        }
    }
}
