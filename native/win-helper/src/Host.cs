using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
using System.Text;

namespace WinHelper
{
    /// <summary>
    /// The request loop shared by both hosts: the .NET exe (Program.cs) and Windows PowerShell
    /// (host.ps1). Reads one JSON request per line and answers one JSON line; returns when stdin
    /// closes, so the helper never outlives the MCP server that started it.
    /// </summary>
    public static class Host
    {
        private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        public static Dispatcher CreateDispatcher()
        {
            var dispatcher = new Dispatcher();
            dispatcher.Register("ping", delegate { return new Dictionary<string, object> { { "pong", true } }; });
            WindowCommands.Register(dispatcher);
            CaptureCommands.Register(dispatcher);
            UiaCommands.Register(dispatcher);
            OcrCommands.Register(dispatcher);
            return dispatcher;
        }

        /// <summary>
        /// Runs the request loop on stdin/stdout. When <paramref name="parentPid"/> is given, also exits as
        /// soon as that process dies: stdin EOF alone is not enough, because a killed MCP server's pipe can
        /// stay open when another process inherited the handle.
        /// </summary>
        public static void RunStdio(int parentPid)
        {
            WatchParent(parentPid, delegate { Environment.Exit(0); });
            // The exe already declares this in its manifest; PowerShell needs it at runtime so all
            // coordinates are physical pixels. Fails harmlessly when already set.
            SetProcessDpiAwarenessContext(PerMonitorAwareV2);

            var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), true);
            var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            Run(input, output);
        }

        /// <summary>Calls <paramref name="onExit"/> once the process with <paramref name="pid"/> has exited (pid 0: never).</summary>
        public static void WatchParent(int pid, Action onExit)
        {
            if (pid <= 0) return;
            Process parent;
            try
            {
                parent = Process.GetProcessById(pid);
            }
            catch (ArgumentException)
            {
                onExit();
                return;
            }

            var watcher = new Thread(delegate()
            {
                try
                {
                    while (!parent.WaitForExit(1000)) { }
                }
                catch (InvalidOperationException) { }
                catch (System.ComponentModel.Win32Exception) { }
                onExit();
            });
            watcher.IsBackground = true;
            watcher.Start();
        }

        public static void Run(TextReader input, TextWriter output)
        {
            var dispatcher = CreateDispatcher();
            string line;
            while ((line = input.ReadLine()) != null)
            {
                if (line.Trim().Length == 0) continue;
                output.WriteLine(dispatcher.HandleLine(line));
            }
        }
    }
}
