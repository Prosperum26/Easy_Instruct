using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using WinHelper;
using static TestJson;

public class UiaMathTests
{
    [Fact]
    public void Shortens_control_type_names()
    {
        Assert.Equal("TreeItem", UiaCommands.ShortTypeName("ControlType.TreeItem"));
        Assert.Equal("Custom", UiaCommands.ShortTypeName("Custom"));
    }

    [Theory]
    [InlineData(10, 10, 100, 100, true)] // inside
    [InlineData(-50, 10, 100, 100, true)] // overlaps the left edge
    [InlineData(1265, -49035, 7, 226, false)] // webview content scrolled far above
    [InlineData(5000, 10, 100, 100, false)] // right of the window
    public void Keeps_only_subtrees_that_overlap_the_window(int x, int y, int w, int h, bool keep)
    {
        var window = new int[] { 0, 0, 1920, 1080 };
        Assert.Equal(keep, UiaCommands.Overlaps(new int[] { x, y, w, h }, window));
    }

    [Fact]
    public void Descends_into_elements_without_a_rect()
    {
        Assert.True(UiaCommands.Overlaps(null, new int[] { 0, 0, 1920, 1080 }));
    }
}

/// <summary>Snapshots a real WPF window shown on a background UI thread.</summary>
public class UiaSnapshotTests : IDisposable
{
    private readonly Thread _ui;
    private readonly ManualResetEventSlim _ready = new();
    private System.Windows.Threading.Dispatcher? _dispatcher;
    private long _hwnd;

    public UiaSnapshotTests()
    {
        _ui = new Thread(() =>
        {
            var window = new Window
            {
                Title = "Easy Instruct UIA test",
                Width = 300,
                Height = 200,
                Left = 50,
                Top = 50,
                Content = new Button { Content = "Easy Instruct test button" },
            };
            window.Show();
            _hwnd = new WindowInteropHelper(window).Handle.ToInt64();
            _dispatcher = System.Windows.Threading.Dispatcher.CurrentDispatcher;
            _ready.Set();
            System.Windows.Threading.Dispatcher.Run();
        });
        _ui.SetApartmentState(ApartmentState.STA);
        _ui.IsBackground = true;
        _ui.Start();
        Assert.True(_ready.Wait(TimeSpan.FromSeconds(10)));
    }

    public void Dispose() => _dispatcher?.InvokeShutdown();

    private static List<Dictionary<string, object>> Nodes(object snapshot) =>
        ((List<object>)Obj(snapshot)["nodes"]).Select(Obj).ToList();

    [Fact]
    public void Lists_the_window_and_its_controls_with_parents_and_rects()
    {
        var nodes = Nodes(UiaCommands.Snapshot(Args(("hwnd", (double)_hwnd))));
        Assert.Equal(-1, Num(nodes[0]["p"]));
        Assert.Equal("Window", nodes[0]["t"]);

        var button = nodes.Single(n => (string)n["t"] == "Button" && (string)n["n"] == "Easy Instruct test button");
        Assert.True(Num(button["d"]) >= 1);
        Assert.True(Num(button["p"]) >= 0);
        var rect = (List<object>)button["r"];
        Assert.Equal(4, rect.Count);
        Assert.True(Num(rect[2]) > 0 && Num(rect[3]) > 0);
    }

    [Fact]
    public void Does_not_wait_for_a_bigger_tree_unless_asked()
    {
        var snapshot = Obj(UiaCommands.Snapshot(Args(("hwnd", (double)_hwnd))));
        Assert.Equal(1, Num(snapshot["attempts"]));
    }

    [Fact]
    public void Retries_while_the_tree_is_smaller_than_min_nodes()
    {
        var snapshot = Obj(UiaCommands.Snapshot(Args(("hwnd", (double)_hwnd), ("minNodes", 1000.0))));
        Assert.Equal(4, Num(snapshot["attempts"]));
    }

    [Fact]
    public void Stops_at_the_node_limit_and_says_so()
    {
        var snapshot = Obj(UiaCommands.Snapshot(Args(("hwnd", (double)_hwnd), ("maxNodes", 1.0))));
        Assert.Single((List<object>)snapshot["nodes"]);
        Assert.Equal(true, snapshot["truncated"]);
    }

    [Fact]
    public void Reports_unknown_windows()
    {
        Assert.Equal("WINDOW_NOT_FOUND",
            Assert.Throws<HelperException>(() => UiaCommands.Snapshot(Args(("hwnd", 123456789.0)))).Code);
    }
}
