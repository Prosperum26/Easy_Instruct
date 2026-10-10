using WinHelper;
using static TestJson;

public class OcrMathTests
{
    [Fact]
    public void Maps_word_rects_from_the_scaled_image_back_to_the_screen()
    {
        Assert.Equal(new[] { 110, 205, 20, 8 }, OcrCommands.ToScreen(20, 10, 40, 16, 100, 200, 2));
    }

    [Fact]
    public void Makes_captured_pixels_opaque()
    {
        byte[] bgra = [1, 2, 3, 0, 4, 5, 6, 0];
        OcrCommands.MakeOpaque(bgra);
        Assert.Equal(new byte[] { 1, 2, 3, 255, 4, 5, 6, 255 }, bgra);
    }
}

public class OcrCommandsTests
{
    [Fact]
    public void Self_test_reads_rendered_digits()
    {
        var result = Obj(OcrCommands.SelfTest(null));
        Assert.Equal(true, result["ok"]);
        Assert.Contains("12345", (string)result["text"]);
        Assert.NotEmpty((List<object>)result["languages"]);
    }

    [Fact]
    public void Reads_a_screen_region_into_lines_and_words_with_screen_rects()
    {
        var result = Obj(OcrCommands.Ocr(Args(("x", 0.0), ("y", 0.0), ("w", 200.0), ("h", 100.0))));
        Assert.IsType<string>(result["language"]);
        foreach (var line in ((List<object>)result["lines"]).Select(Obj))
        {
            Assert.IsType<string>(line["text"]);
            foreach (var word in ((List<object>)line["words"]).Select(Obj))
            {
                var rect = (List<object>)word["rect"];
                Assert.InRange(Num(rect[0]), -1, 200);
                Assert.InRange(Num(rect[1]), -1, 100);
            }
        }
    }

    [Fact]
    public void Rejects_bad_regions_and_scales()
    {
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() =>
            OcrCommands.Ocr(Args(("x", 0.0), ("y", 0.0), ("w", 0.0), ("h", 10.0))).ToString()).Code);
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() =>
            OcrCommands.Ocr(Args(("x", 0.0), ("y", 0.0), ("w", 10.0), ("h", 10.0), ("scale", 9.0))).ToString()).Code);
    }

    [Fact]
    public void Reports_languages_without_an_engine()
    {
        Assert.Equal("OCR_UNAVAILABLE", Assert.Throws<HelperException>(() =>
            OcrCommands.Ocr(Args(("x", 0.0), ("y", 0.0), ("w", 10.0), ("h", 10.0), ("lang", "xx-XX"))).ToString()).Code);
    }
}
