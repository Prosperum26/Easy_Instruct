using WinHelper;
using static TestJson;

public class DispatcherTests
{
    private static Dispatcher CreateDispatcher()
    {
        var dispatcher = new Dispatcher();
        dispatcher.Register("ping", _ => new Dictionary<string, object> { ["pong"] = true });
        dispatcher.Register("echo", args => new Dictionary<string, object> { ["value"] = args["value"] });
        dispatcher.Register("fail", _ => throw new HelperException("WINDOW_NOT_FOUND", "no such window"));
        dispatcher.Register("crash", _ => throw new InvalidOperationException("boom"));
        return dispatcher;
    }

    private static Dictionary<string, object> Handle(string line) => Response(CreateDispatcher().HandleLine(line));

    [Fact]
    public void Returns_the_handler_result_with_the_request_id()
    {
        var response = Handle("""{"id":7,"cmd":"ping"}""");
        Assert.Equal(7, Num(response["id"]));
        Assert.Equal(true, response["ok"]);
        Assert.Equal(true, Obj(response["result"])["pong"]);
    }

    [Fact]
    public void Passes_args_to_the_handler()
    {
        var response = Handle("""{"id":1,"cmd":"echo","args":{"value":"xin chào"}}""");
        Assert.Equal("xin chào", Obj(response["result"])["value"]);
    }

    [Fact]
    public void Reports_unknown_commands()
    {
        var response = Handle("""{"id":2,"cmd":"teleport"}""");
        Assert.Equal(false, response["ok"]);
        Assert.Equal(2, Num(response["id"]));
        Assert.Equal("UNKNOWN_COMMAND", Obj(response["error"])["code"]);
    }

    [Fact]
    public void Reports_invalid_json_without_an_id()
    {
        var response = Handle("{not json");
        Assert.Null(response["id"]);
        Assert.Equal("BAD_REQUEST", Obj(response["error"])["code"]);
    }

    [Fact]
    public void Accepts_a_leading_byte_order_mark()
    {
        Assert.Equal(true, Handle("﻿{\"id\":1,\"cmd\":\"ping\"}")["ok"]);
    }

    [Fact]
    public void Reports_a_missing_command_name()
    {
        var response = Handle("""{"id":3}""");
        Assert.Equal(3, Num(response["id"]));
        Assert.Equal("BAD_REQUEST", Obj(response["error"])["code"]);
    }

    [Fact]
    public void Passes_through_helper_error_codes()
    {
        var error = Obj(Handle("""{"id":4,"cmd":"fail"}""")["error"]);
        Assert.Equal("WINDOW_NOT_FOUND", error["code"]);
        Assert.Equal("no such window", error["message"]);
    }

    [Fact]
    public void Wraps_unexpected_exceptions_as_internal_errors()
    {
        var error = Obj(Handle("""{"id":5,"cmd":"crash"}""")["error"]);
        Assert.Equal("INTERNAL", error["code"]);
        Assert.Contains("boom", (string)error["message"]);
    }

    [Fact]
    public void Writes_each_response_on_a_single_line()
    {
        var line = CreateDispatcher().HandleLine("""{"id":6,"cmd":"echo","args":{"value":"a\nb"}}""");
        Assert.DoesNotContain('\n', line);
    }

    [Fact]
    public void Host_answers_each_request_line_until_input_ends()
    {
        var output = new StringWriter();
        Host.Run(new StringReader("{\"id\":1,\"cmd\":\"ping\"}\n\n{\"id\":2,\"cmd\":\"nope\"}\n"), output);
        var lines = output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(2, lines.Length);
        Assert.Equal(true, Response(lines[0])["ok"]);
        Assert.Equal("UNKNOWN_COMMAND", Obj(Response(lines[1])["error"])["code"]);
    }
}
