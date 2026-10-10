namespace WinHelper
{
    /// <summary>Entry point of the .NET exe host; PowerShell uses host.ps1 instead.</summary>
    public static class Program
    {
        public static void Main()
        {
            Host.RunStdio();
        }
    }
}
