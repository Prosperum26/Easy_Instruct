using System;
using System.Collections.Generic;
using System.IO;
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
            return dispatcher;
        }

        public static void RunStdio()
        {
            // The exe already declares this in its manifest; PowerShell needs it at runtime so all
            // coordinates are physical pixels. Fails harmlessly when already set.
            SetProcessDpiAwarenessContext(PerMonitorAwareV2);

            var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false), true);
            var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            Run(input, output);
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
