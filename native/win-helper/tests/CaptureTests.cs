using System.Buffers.Binary;
using System.IO.Compression;
using WinHelper;
using static TestJson;

public class CaptureMathTests
{
    [Fact]
    public void Shrinks_to_the_max_width_keeping_the_aspect_ratio()
    {
        var size = CaptureMath.Shrink(1920, 1080, 1600);
        Assert.Equal((1600, 900), (size.Width, size.Height));
        Assert.Equal(1600.0 / 1920, size.Scale, 6);
    }

    [Fact]
    public void Never_enlarges_small_captures()
    {
        var size = CaptureMath.Shrink(800, 600, 1600);
        Assert.Equal((800, 600, 1.0), (size.Width, size.Height, size.Scale));
    }

    [Fact]
    public void Places_grid_lines_on_round_screen_coordinates_inside_the_capture()
    {
        Assert.Equal([200, 300, 400, 500, 600], CaptureMath.GridLines(150, 500, 100));
    }

    [Fact]
    public void Skips_grid_lines_on_the_capture_edges()
    {
        Assert.Equal([100, 200], CaptureMath.GridLines(0, 300, 100));
    }

    [Fact]
    public void Maps_screen_boxes_into_the_scaled_image()
    {
        Assert.Equal(new[] { 50, 25, 100, 50 }, CaptureMath.BoxToImage(new[] { 200, 100, 200, 100 }, 100, 50, 0.5));
    }

    [Fact]
    public void Handles_negative_origins_on_secondary_monitors()
    {
        Assert.Equal([-200, -100, 0], CaptureMath.GridLines(-250, 300, 100));
    }
}

public class PngTests
{
    [Fact]
    public void Encodes_a_valid_rgb_png()
    {
        // Two BGRA pixels: pure red, then pure blue.
        byte[] bgra = [0, 0, 255, 255, 255, 0, 0, 255];
        var png = Png.EncodeBgra(bgra, 2, 1);

        Assert.Equal(new byte[] { 0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A }, png[..8]);
        Assert.Equal("IHDR", System.Text.Encoding.ASCII.GetString(png, 12, 4));
        Assert.Equal(2, BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(16)));
        Assert.Equal(1, BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(20)));
        Assert.Equal(8, png[24]); // bit depth
        Assert.Equal(2, png[25]); // colour type RGB

        Assert.Equal(new byte[] { 0, 255, 0, 0, 0, 0, 255 }, DecompressIdat(png));
        Assert.Equal("IEND", System.Text.Encoding.ASCII.GetString(png, png.Length - 8, 4));
    }

    [Fact]
    public void Writes_correct_chunk_checksums()
    {
        var png = Png.EncodeBgra(new byte[4 * 3 * 2], 3, 2);
        // IHDR CRC covers type + 13 data bytes.
        Assert.Equal(Png.Crc32(png, 12, 17), BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(29)));
    }

    [Fact]
    public void Writes_a_valid_zlib_stream_with_adler32()
    {
        var bgra = new byte[4 * 50 * 20];
        new Random(1).NextBytes(bgra);
        // ZLibStream verifies the zlib header and Adler-32 trailer while decompressing.
        Assert.Equal(20 * (1 + 50 * 3), DecompressIdat(Png.EncodeBgra(bgra, 50, 20)).Length);
    }

    private static byte[] DecompressIdat(byte[] png)
    {
        var offset = 8;
        while (offset < png.Length)
        {
            var length = BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(offset));
            var type = System.Text.Encoding.ASCII.GetString(png, offset + 4, 4);
            if (type == "IDAT")
            {
                using var input = new MemoryStream(png, offset + 8, length);
                using var zlib = new ZLibStream(input, CompressionMode.Decompress);
                using var output = new MemoryStream();
                zlib.CopyTo(output);
                return output.ToArray();
            }
            offset += 12 + length;
        }
        throw new InvalidOperationException("no IDAT");
    }
}

public class CaptureCommandTests
{
    private static Dictionary<string, object> Capture(params (string, object)[] args) =>
        Obj(CaptureCommands.Capture(Args(args)));

    [Fact]
    public void Captures_a_screen_region_as_png()
    {
        var result = Capture(("x", 0.0), ("y", 0.0), ("w", 64.0), ("h", 32.0));
        Assert.Equal(64, Num(result["width"]));
        Assert.Equal(32, Num(result["height"]));
        Assert.Equal(1.0, result["scale"]);
        Assert.Equal(0x89, Convert.FromBase64String((string)result["png"])[0]);
    }

    [Fact]
    public void Scales_and_reports_the_scale()
    {
        var result = Capture(("x", 0.0), ("y", 0.0), ("w", 400.0), ("h", 200.0), ("maxWidth", 100.0), ("grid", true));
        Assert.Equal(100, Num(result["width"]));
        Assert.Equal(50, Num(result["height"]));
        Assert.Equal(0.25, (double)result["scale"], 6);
    }

    [Fact]
    public void Draws_boxes_and_rejects_malformed_ones()
    {
        var box = new List<object> { 10.0, 10.0, 20.0, 10.0 };
        var result = Capture(("x", 0.0), ("y", 0.0), ("w", 64.0), ("h", 32.0), ("boxes", new List<object> { box }));
        Assert.Equal(64, Num(result["width"]));
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() =>
            Capture(("x", 0.0), ("y", 0.0), ("w", 64.0), ("h", 32.0), ("boxes", new List<object> { new List<object> { 1.0, 2.0 } }))).Code);
    }

    [Fact]
    public void Rejects_empty_or_huge_regions()
    {
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => Capture(("x", 0.0), ("y", 0.0), ("w", 0.0), ("h", 10.0))).Code);
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() => Capture(("x", 0.0), ("y", 0.0), ("w", 20000.0), ("h", 10.0))).Code);
    }
}
