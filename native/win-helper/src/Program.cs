namespace WinHelper
{
    /// <summary>Entry point of the .NET exe host; PowerShell uses host.ps1 instead.</summary>
    public static class Program
    {
        /// <summary>Optional argument: --parent-pid=N (exit when that process dies).</summary>
        public static void Main(string[] args)
        {
            var parentPid = 0;
            foreach (var arg in args)
            {
                if (arg.StartsWith("--parent-pid=")) int.TryParse(arg.Substring("--parent-pid=".Length), out parentPid);
            }
            Host.RunStdio(parentPid);
        }
    }
}
