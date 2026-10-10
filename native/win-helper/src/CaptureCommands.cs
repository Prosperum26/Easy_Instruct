using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace WinHelper;

public static class CaptureMath
{
    /// <summary>The output size after shrinking to at most <paramref name="maxWidth"/>; never enlarges.</summary>
    public static (int Width, int Height, double Scale) OutputSize(int width, int height, int maxWidth)
    {
        if (width <= maxWidth) return (width, height, 1.0);
        var scale = (double)maxWidth / width;
        return (maxWidth, Math.Max(1, (int)Math.Round(height * scale)), scale);
    }

    /// <summary>Screen coordinates that are multiples of <paramref name="step"/> strictly inside [origin, origin + length].</summary>
    public static int[] GridLines(int origin, int length, int step)
    {
        var first = (int)Math.Floor((double)origin / step) * step + step;
        var lines = new List<int>();
        for (var p = first; p < origin + length; p += step) lines.Add(p);
        return [.. lines];
    }
}

/// <summary>Screen capture with optional down-scaling and a coordinate grid, encoded as PNG.</summary>
public static class CaptureCommands
{
    private const int MaxSide = 16384;
    private const uint LineColor = 0x00C800FF; // COLORREF 0x00BBGGRR: magenta
    private const uint LabelColor = 0x0000E6FF; // yellow
    private const uint LabelBackground = 0x00201010;

    public static void Register(Dispatcher dispatcher) => dispatcher.Register("capture", Capture);

    /// <summary>
    /// Args: x, y, w, h (physical screen pixels), maxWidth (default 1600), grid (default false),
    /// gridStep (default 100). Grid labels show screen coordinates, so they can be used directly.
    /// </summary>
    public static JsonObject? Capture(JsonObject? args)
    {
        int x = Args.RequireInt(args, "x"), y = Args.RequireInt(args, "y");
        int w = Args.RequireInt(args, "w"), h = Args.RequireInt(args, "h");
        if (w <= 0 || h <= 0 || w > MaxSide || h > MaxSide)
            throw new HelperException("BAD_ARGS", $"Capture size must be between 1 and {MaxSide} pixels.");
        var maxWidth = args?["maxWidth"] is null ? 1600 : Args.RequireInt(args, "maxWidth");
        if (maxWidth <= 0) throw new HelperException("BAD_ARGS", "maxWidth must be positive.");
        var grid = Args.OptionalBool(args, "grid", false);
        var gridStep = args?["gridStep"] is null ? 100 : Args.RequireInt(args, "gridStep");
        if (gridStep < 10) throw new HelperException("BAD_ARGS", "gridStep must be at least 10.");

        var (outW, outH, scale) = CaptureMath.OutputSize(w, h, maxWidth);
        var pixels = Grab(x, y, w, h, outW, outH, grid ? (gdi => DrawGrid(gdi, x, y, w, h, outW, outH, scale, gridStep)) : null);

        return new JsonObject
        {
            ["png"] = Convert.ToBase64String(Png.EncodeBgra(pixels, outW, outH)),
            ["width"] = outW,
            ["height"] = outH,
            ["scale"] = scale,
            ["origin"] = new JsonObject { ["x"] = x, ["y"] = y },
        };
    }

    private static byte[] Grab(int x, int y, int w, int h, int outW, int outH, Action<nint>? decorate)
    {
        var screen = Gdi.GetDC(0);
        var memory = Gdi.CreateCompatibleDC(screen);
        var bitmap = Gdi.CreateCompatibleBitmap(screen, outW, outH);
        var previous = Gdi.SelectObject(memory, bitmap);
        try
        {
            bool copied;
            if (outW == w && outH == h)
            {
                copied = Gdi.BitBlt(memory, 0, 0, w, h, screen, x, y, Gdi.SRCCOPY | Gdi.CAPTUREBLT);
            }
            else
            {
                Gdi.SetStretchBltMode(memory, Gdi.HALFTONE);
                Gdi.SetBrushOrgEx(memory, 0, 0, 0);
                copied = Gdi.StretchBlt(memory, 0, 0, outW, outH, screen, x, y, w, h, Gdi.SRCCOPY | Gdi.CAPTUREBLT);
            }
            if (!copied) throw new HelperException("CAPTURE_FAILED", "Could not copy the screen.");
            decorate?.Invoke(memory);

            Gdi.SelectObject(memory, previous);
            var pixels = new byte[outW * outH * 4];
            var info = new Gdi.BITMAPINFOHEADER
            {
                biSize = Marshal.SizeOf<Gdi.BITMAPINFOHEADER>(),
                biWidth = outW,
                biHeight = -outH, // top-down rows
                biPlanes = 1,
                biBitCount = 32,
            };
            if (Gdi.GetDIBits(memory, bitmap, 0, (uint)outH, pixels, ref info, 0) == 0)
                throw new HelperException("CAPTURE_FAILED", "Could not read the captured pixels.");
            return pixels;
        }
        finally
        {
            Gdi.SelectObject(memory, previous);
            Gdi.DeleteObject(bitmap);
            Gdi.DeleteDC(memory);
            Gdi.ReleaseDC(0, screen);
        }
    }

    private static void DrawGrid(nint dc, int x, int y, int w, int h, int outW, int outH, double scale, int step)
    {
        var pen = Gdi.CreatePen(Gdi.PS_DOT, 1, LineColor);
        var font = Gdi.CreateFontW(-12, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, "Segoe UI");
        var oldPen = Gdi.SelectObject(dc, pen);
        var oldFont = Gdi.SelectObject(dc, font);
        Gdi.SetBkMode(dc, Gdi.OPAQUE);
        Gdi.SetBkColor(dc, LabelBackground);
        Gdi.SetTextColor(dc, LabelColor);
        try
        {
            foreach (var sx in CaptureMath.GridLines(x, w, step))
            {
                var px = (int)Math.Round((sx - x) * scale);
                Gdi.MoveToEx(dc, px, 0, 0);
                Gdi.LineTo(dc, px, outH);
                Label(dc, px + 2, 1, sx.ToString());
                Label(dc, px + 2, outH - 15, sx.ToString());
            }
            foreach (var sy in CaptureMath.GridLines(y, h, step))
            {
                var py = (int)Math.Round((sy - y) * scale);
                Gdi.MoveToEx(dc, 0, py, 0);
                Gdi.LineTo(dc, outW, py);
                Label(dc, 1, py + 1, sy.ToString());
                Label(dc, outW - 34, py + 1, sy.ToString());
            }
        }
        finally
        {
            Gdi.SelectObject(dc, oldPen);
            Gdi.SelectObject(dc, oldFont);
            Gdi.DeleteObject(pen);
            Gdi.DeleteObject(font);
        }
    }

    private static void Label(nint dc, int x, int y, string text) => Gdi.TextOutW(dc, x, y, text, text.Length);
}

internal static partial class Gdi
{
    public const uint SRCCOPY = 0x00CC0020;
    public const uint CAPTUREBLT = 0x40000000;
    public const int HALFTONE = 4;
    public const int PS_DOT = 2;
    public const int OPAQUE = 2;

    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAPINFOHEADER
    {
        public int biSize;
        public int biWidth;
        public int biHeight;
        public short biPlanes;
        public short biBitCount;
        public int biCompression;
        public int biSizeImage;
        public int biXPelsPerMeter;
        public int biYPelsPerMeter;
        public int biClrUsed;
        public int biClrImportant;
    }

    [LibraryImport("user32.dll")] public static partial nint GetDC(nint hwnd);
    [LibraryImport("user32.dll")] public static partial int ReleaseDC(nint hwnd, nint dc);
    [LibraryImport("gdi32.dll")] public static partial nint CreateCompatibleDC(nint dc);
    [LibraryImport("gdi32.dll")] public static partial nint CreateCompatibleBitmap(nint dc, int w, int h);
    [LibraryImport("gdi32.dll")] public static partial nint SelectObject(nint dc, nint obj);
    [LibraryImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static partial bool DeleteObject(nint obj);
    [LibraryImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static partial bool DeleteDC(nint dc);

    [LibraryImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool BitBlt(nint dst, int x, int y, int w, int h, nint src, int sx, int sy, uint rop);

    [LibraryImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool StretchBlt(nint dst, int x, int y, int w, int h, nint src, int sx, int sy, int sw, int sh, uint rop);

    [LibraryImport("gdi32.dll")] public static partial int SetStretchBltMode(nint dc, int mode);
    [LibraryImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static partial bool SetBrushOrgEx(nint dc, int x, int y, nint previous);
    [LibraryImport("gdi32.dll")] public static partial int GetDIBits(nint dc, nint bitmap, uint start, uint lines, [Out] byte[] bits, ref BITMAPINFOHEADER info, uint usage);
    [LibraryImport("gdi32.dll")] public static partial nint CreatePen(int style, int width, uint color);
    [LibraryImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static partial bool MoveToEx(nint dc, int x, int y, nint previous);
    [LibraryImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static partial bool LineTo(nint dc, int x, int y);
    [LibraryImport("gdi32.dll")] public static partial uint SetTextColor(nint dc, uint color);
    [LibraryImport("gdi32.dll")] public static partial uint SetBkColor(nint dc, uint color);
    [LibraryImport("gdi32.dll")] public static partial int SetBkMode(nint dc, int mode);

    [LibraryImport("gdi32.dll", StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool TextOutW(nint dc, int x, int y, string text, int length);

    [LibraryImport("gdi32.dll", StringMarshalling = StringMarshalling.Utf16)]
    public static partial nint CreateFontW(int height, int width, int escapement, int orientation, int weight,
        uint italic, uint underline, uint strikeOut, uint charSet, uint outPrecision, uint clipPrecision,
        uint quality, uint pitchAndFamily, string face);
}
