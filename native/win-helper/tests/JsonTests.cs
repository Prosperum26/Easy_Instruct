using WinHelper;

public class JsonTests
{
    [Fact]
    public void Parses_objects_arrays_and_scalars()
    {
        var value = (Dictionary<string, object>)Json.Parse("""{"a":1,"b":[true,false,null],"c":"x","d":-2.5e1}""");
        Assert.Equal(1.0, value["a"]);
        Assert.Equal(new object?[] { true, false, null }, (List<object>)value["b"]);
        Assert.Equal("x", value["c"]);
        Assert.Equal(-25.0, value["d"]);
    }

    [Fact]
    public void Parses_string_escapes_including_unicode()
    {
        Assert.Equal("a\"b\\c\nà中", Json.Parse("\"a\\\"b\\\\c\\n\\u00e0中\""));
    }

    [Theory]
    [InlineData("{not json")]
    [InlineData("[1,2")]
    [InlineData("\"open")]
    [InlineData("{\"a\":1} trailing")]
    [InlineData("")]
    public void Rejects_invalid_json(string text)
    {
        Assert.Throws<JsonFormatException>(() => Json.Parse(text));
    }

    [Fact]
    public void Serializes_nested_values_on_one_line()
    {
        var value = new Dictionary<string, object>
        {
            ["n"] = 3,
            ["big"] = 4294967296L,
            ["r"] = 0.25,
            ["s"] = "line\nbreak \"quoted\"",
            ["list"] = new List<object> { true, null! },
            ["empty"] = new Dictionary<string, object>(),
        };
        Assert.Equal(
            """{"n":3,"big":4294967296,"r":0.25,"s":"line\nbreak \"quoted\"","list":[true,null],"empty":{}}""",
            Json.Serialize(value));
    }

    [Fact]
    public void Round_trips_unicode_text()
    {
        Assert.Equal("Tiếng Việt ✓", Json.Parse(Json.Serialize("Tiếng Việt ✓")));
    }
}
