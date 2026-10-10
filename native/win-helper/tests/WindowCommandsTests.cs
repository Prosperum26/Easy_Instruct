using WinHelper;
using static TestJson;

public class WindowCommandsTests
{
    [Fact]
    public void Lists_visible_windows_with_physical_bounds()
    {
        foreach (var item in (List<object>)WindowCommands.ListWindows(null))
        {
            var window = Obj(item);
            Assert.NotEqual(0, Num(window["hwnd"]));
            Assert.True(Num(Obj(window["bounds"])["w"]) > 0);
            Assert.True(Num(Obj(window["bounds"])["h"]) > 0);
            Assert.False(string.IsNullOrEmpty((string)window["title"]));
        }
    }

    [Fact]
    public void Filters_windows_by_process_name()
    {
        Assert.Empty((List<object>)WindowCommands.ListWindows(Args(("process", "definitely-not-running-xyz"))));
    }

    [Fact]
    public void Reports_unknown_windows_for_bounds()
    {
        var error = Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(Args(("hwnd", 123456789.0))));
        Assert.Equal("WINDOW_NOT_FOUND", error.Code);
    }

    [Fact]
    public void Reports_unknown_windows_for_focus()
    {
        var error = Assert.Throws<HelperException>(() => WindowCommands.FocusWindow(Args(("hwnd", 123456789.0))));
        Assert.Equal("WINDOW_NOT_FOUND", error.Code);
    }

    [Fact]
    public void Requires_an_integer_hwnd()
    {
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(null!)).Code);
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(Args(("hwnd", "abc")))).Code);
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => WindowCommands.WindowBounds(Args(("hwnd", 1.5)))).Code);
    }

    [Fact]
    public void Describes_the_foreground_window_or_null()
    {
        var foreground = WindowCommands.ForegroundWindow(null);
        if (foreground is not null) Assert.NotEqual(0, Num(Obj(foreground)["hwnd"]));
    }

    [Fact]
    public void Reports_the_primary_display_in_physical_pixels()
    {
        var bounds = Obj(Obj(WindowCommands.DisplayInfo(null))["bounds"]);
        Assert.Equal(0, Num(bounds["x"]));
        Assert.Equal(0, Num(bounds["y"]));
        Assert.True(Num(bounds["w"]) > 0);
        Assert.True(Num(bounds["h"]) > 0);
    }
}
