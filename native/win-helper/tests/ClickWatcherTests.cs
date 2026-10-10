using WinHelper;
using static TestJson;

public class ClickDetectorTests
{
    [Fact]
    public void Reports_a_click_when_the_left_button_is_released()
    {
        var detector = new ClickDetector();
        Assert.Null(detector.Sample(false, 10, 10));
        Assert.Null(detector.Sample(true, 10, 10));
        Assert.Null(detector.Sample(true, 12, 11));
        Assert.Equal(new[] { 12, 11 }, detector.Sample(false, 12, 11));
    }

    [Fact]
    public void Ignores_a_button_that_was_already_down_when_watching_started()
    {
        // The press that clicked the overlay's Next button must not count as the step's click.
        var detector = new ClickDetector();
        Assert.Null(detector.Sample(true, 10, 10));
        Assert.Null(detector.Sample(false, 10, 10));
        Assert.Null(detector.Sample(true, 20, 20));
        Assert.Equal(new[] { 20, 20 }, detector.Sample(false, 20, 20));
    }

    [Fact]
    public void Reports_each_click_once()
    {
        var detector = new ClickDetector();
        detector.Sample(false, 0, 0);
        detector.Sample(true, 5, 5);
        Assert.NotNull(detector.Sample(false, 5, 5));
        Assert.Null(detector.Sample(false, 5, 5));
    }
}

public class ClickWatcherCommandTests
{
    [Fact]
    public void Turns_watching_on_and_off()
    {
        var events = new List<Dictionary<string, object>>();
        try
        {
            ClickWatcher.Emit = events.Add;
            Assert.Equal(true, Obj(ClickWatcher.Watch(Args(("enabled", true))))["watching"]);
            Assert.True(ClickWatcher.IsWatching);
            Assert.Equal(false, Obj(ClickWatcher.Watch(Args(("enabled", false))))["watching"]);
            Assert.False(ClickWatcher.IsWatching);
        }
        finally
        {
            ClickWatcher.Watch(Args(("enabled", false)));
            ClickWatcher.Emit = null;
        }
    }

    [Fact]
    public void Requires_the_enabled_flag()
    {
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => ClickWatcher.Watch(Args())).Code);
    }
}

public class HostEventTests
{
    [Fact]
    public void Writes_events_as_lines_without_an_id()
    {
        var output = new StringWriter();
        var host = new HostOutput(output);
        host.Event(new Dictionary<string, object> { { "event", "click" }, { "x", 3 }, { "y", 4 } });
        var line = Response(output.ToString().Trim());
        Assert.False(line.ContainsKey("id"));
        Assert.Equal("click", line["event"]);
    }
}
