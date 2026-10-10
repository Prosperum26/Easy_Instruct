using WinHelper;

/// <summary>Small helpers to read the helper's Dictionary/List JSON values in assertions.</summary>
internal static class TestJson
{
    public static Dictionary<string, object> Obj(object? value) => (Dictionary<string, object>)value!;

    public static Dictionary<string, object> Args(params (string Key, object Value)[] pairs)
    {
        var args = new Dictionary<string, object>();
        foreach (var (key, value) in pairs) args[key] = value;
        return args;
    }

    /// <summary>Numbers arrive as double when parsed and as int/long when built in code.</summary>
    public static long Num(object? value) => Convert.ToInt64(value);

    public static Dictionary<string, object> Response(string line) => Obj(Json.Parse(line));
}
