using System.Diagnostics;
using WinHelper;

public class HostTests
{
    [Fact]
    public void Calls_back_when_the_parent_process_exits()
    {
        using var parent = Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 2 127.0.0.1 > nul") { CreateNoWindow = true })!;
        using var fired = new ManualResetEventSlim();
        Host.WatchParent(parent.Id, fired.Set);
        Assert.False(fired.IsSet);
        Assert.True(fired.Wait(TimeSpan.FromSeconds(10)));
    }

    [Fact]
    public void Calls_back_at_once_when_the_parent_is_already_gone()
    {
        using var fired = new ManualResetEventSlim();
        Host.WatchParent(int.MaxValue - 7, fired.Set);
        Assert.True(fired.Wait(TimeSpan.FromSeconds(2)));
    }

    [Fact]
    public void Ignores_a_missing_parent_id()
    {
        using var fired = new ManualResetEventSlim();
        Host.WatchParent(0, fired.Set);
        Assert.False(fired.Wait(TimeSpan.FromMilliseconds(300)));
    }
}
