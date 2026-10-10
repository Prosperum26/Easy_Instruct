using System.Buffers.Binary;
using System.IO.Compression;
using System.Text.Json.Nodes;
using WinHelper;

public class CaptureMathTests
{
    [Fact]
    public void Shrinks_to_the_max_width_keeping_the_aspect_ratio()
    {
        var (w, h, scale) = CaptureMath.OutputSize(1920, 1080, 1600);
        Assert.Equal((1600, 900), (w, h));
        Assert.Equal(1600.0 / 1920, scale, 6);
    }

    [Fact]
    public void Never_enlarges_small_captures()
    {
        Assert.Equal((800, 600, 1.0), CaptureMath.OutputSize(800, 600, 1600));
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
        var expected = Png.Crc32(png.AsSpan(12, 17));
        Assert.Equal(expected, BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(29)));
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
    [Fact]
    public void Captures_a_screen_region_as_png()
    {
        var result = CaptureCommands.Capture(new JsonObject { ["x"] = 0, ["y"] = 0, ["w"] = 64, ["h"] = 32 })!;
        Assert.Equal(64, (int)result["width"]!);
        Assert.Equal(32, (int)result["height"]!);
        Assert.Equal(1.0, (double)result["scale"]!);
        var png = Convert.FromBase64String((string)result["png"]!);
        Assert.Equal(0x89, png[0]);
    }

    [Fact]
    public void Scales_and_reports_the_scale()
    {
        var result = CaptureCommands.Capture(new JsonObject
        {
            ["x"] = 0, ["y"] = 0, ["w"] = 400, ["h"] = 200, ["maxWidth"] = 100, ["grid"] = true,
        })!;
        Assert.Equal(100, (int)result["width"]!);
        Assert.Equal(50, (int)result["height"]!);
        Assert.Equal(0.25, (double)result["scale"]!, 6);
    }

    [Fact]
    public void Rejects_empty_or_huge_regions()
    {
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() =>
            CaptureCommands.Capture(new JsonObject { ["x"] = 0, ["y"] = 0, ["w"] = 0, ["h"] = 10 })).Code);
        Assert.Equal("BAD_ARGS", Assert.Throws<HelperException>(() =>
            CaptureCommands.Capture(new JsonObject { ["x"] = 0, ["y"] = 0, ["w"] = 20000, ["h"] = 10 })).Code);
    }
}
