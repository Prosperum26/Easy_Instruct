using System.Text.Json.Nodes;
using WinHelper;

public class WindowCommandsTests
{
    private static JsonObject Args(object hwnd) => new() { ["hwnd"] = JsonValue.Create(hwnd) };

    [Fact]
    public void Lists_visible_windows_with_physical_bounds()
    {
        var windows = WindowCommands.ListWindows(null)!.AsArray();
        foreach (var window in windows)
        {
            Assert.True((long)window!["hwnd"]! != 0);
            Assert.True((int)window["bounds"]!["w"]! > 0);
            Assert.True((int)window["bounds"]!["h"]! > 0);
            Assert.False(string.IsNullOrEmpty((string)window["title"]!));
        }
    }

    [Fact]
    public void Filters_windows_by_process_name()
    {
        var windows = WindowCommands.ListWindows(new JsonObject { ["process"] = "definitely-not-running-xyz" })!.AsArray();
        Assert.Empty(windows);
    }

    [Fact]
    public void Reports_unknown_windows_for_bounds()
    {
        var error = Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(Args(123456789L)));
        Assert.Equal("WINDOW_NOT_FOUND", error.Code);
    }

    [Fact]
    public void Reports_unknown_windows_for_focus()
    {
        var error = Assert.Throws<HelperException>(() => WindowCommands.FocusWindow(Args(123456789L)));
        Assert.Equal("WINDOW_NOT_FOUND", error.Code);
    }

    [Fact]
    public void Requires_a_numeric_hwnd()
    {
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(null)).Code);
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(Args("abc"))).Code);
    }

    [Fact]
    public void Describes_the_foreground_window_or_null()
    {
        var foreground = WindowCommands.ForegroundWindow(null);
        if (foreground is not null) Assert.True((long)foreground["hwnd"]! != 0);
    }
}

public class DisplayCommandTests
{
    [Fact]
    public void Reports_the_primary_display_in_physical_pixels()
    {
        var info = WindowCommands.DisplayInfo(null)!;
        Assert.Equal(0, (int)info["bounds"]!["x"]!);
        Assert.Equal(0, (int)info["bounds"]!["y"]!);
        Assert.True((int)info["bounds"]!["w"]! > 0);
        Assert.True((int)info["bounds"]!["h"]! > 0);
    }
}
