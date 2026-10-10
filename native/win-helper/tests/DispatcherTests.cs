using System.Text.Json.Nodes;
using WinHelper;

public class DispatcherTests
{
    private static Dispatcher CreateDispatcher()
    {
        var dispatcher = new Dispatcher();
        dispatcher.Register("ping", _ => new JsonObject { ["pong"] = true });
        dispatcher.Register("echo", args => new JsonObject { ["value"] = args?["value"]?.DeepClone() });
        dispatcher.Register("fail", _ => throw new HelperException("WINDOW_NOT_FOUND", "no such window"));
        dispatcher.Register("crash", _ => throw new InvalidOperationException("boom"));
        return dispatcher;
    }

    private static JsonObject Handle(string line) => JsonNode.Parse(CreateDispatcher().HandleLine(line))!.AsObject();

    [Fact]
    public void Returns_the_handler_result_with_the_request_id()
    {
        var response = Handle("""{"id":7,"cmd":"ping"}""");
        Assert.Equal(7, (int)response["id"]!);
        Assert.True((bool)response["ok"]!);
        Assert.True((bool)response["result"]!["pong"]!);
    }

    [Fact]
    public void Passes_args_to_the_handler()
    {
        var response = Handle("""{"id":1,"cmd":"echo","args":{"value":"xin chào"}}""");
        Assert.Equal("xin chào", (string)response["result"]!["value"]!);
    }

    [Fact]
    public void Reports_unknown_commands()
    {
        var response = Handle("""{"id":2,"cmd":"teleport"}""");
        Assert.False((bool)response["ok"]!);
        Assert.Equal(2, (int)response["id"]!);
        Assert.Equal("UNKNOWN_COMMAND", (string)response["error"]!["code"]!);
    }

    [Fact]
    public void Reports_invalid_json_without_an_id()
    {
        var response = Handle("{not json");
        Assert.Null(response["id"]);
        Assert.Equal("BAD_REQUEST", (string)response["error"]!["code"]!);
    }

    [Fact]
    public void Reports_a_missing_command_name()
    {
        var response = Handle("""{"id":3}""");
        Assert.Equal(3, (int)response["id"]!);
        Assert.Equal("BAD_REQUEST", (string)response["error"]!["code"]!);
    }

    [Fact]
    public void Passes_through_helper_error_codes()
    {
        var response = Handle("""{"id":4,"cmd":"fail"}""");
        Assert.Equal("WINDOW_NOT_FOUND", (string)response["error"]!["code"]!);
        Assert.Equal("no such window", (string)response["error"]!["message"]!);
    }

    [Fact]
    public void Wraps_unexpected_exceptions_as_internal_errors()
    {
        var response = Handle("""{"id":5,"cmd":"crash"}""");
        Assert.Equal("INTERNAL", (string)response["error"]!["code"]!);
        Assert.Contains("boom", (string)response["error"]!["message"]!);
    }

    [Fact]
    public void Writes_each_response_on_a_single_line()
    {
        var line = CreateDispatcher().HandleLine("""{"id":6,"cmd":"echo","args":{"value":"a\nb"}}""");
        Assert.DoesNotContain('\n', line);
    }
}
