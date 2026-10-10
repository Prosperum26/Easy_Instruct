using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace WinHelper
{
    public struct OutputSize
    {
        public int Width;
        public int Height;
        public double Scale;
    }

    public static class CaptureMath
    {
        /// <summary>The output size after shrinking to at most <paramref name="maxWidth"/>; never enlarges.</summary>
        public static OutputSize Shrink(int width, int height, int maxWidth)
        {
            if (width <= maxWidth) return new OutputSize { Width = width, Height = height, Scale = 1.0 };
            var scale = (double)maxWidth / width;
            return new OutputSize { Width = maxWidth, Height = Math.Max(1, (int)Math.Round(height * scale)), Scale = scale };
        }

        /// <summary>Screen coordinates that are multiples of <paramref name="step"/> strictly inside [origin, origin + length].</summary>
        public static int[] GridLines(int origin, int length, int step)
        {
            var first = (int)Math.Floor((double)origin / step) * step + step;
            var lines = new List<int>();
            for (var p = first; p < origin + length; p += step) lines.Add(p);
            return lines.ToArray();
        }
    }

    /// <summary>Screen capture with optional down-scaling and a coordinate grid, encoded as PNG.</summary>
    public static class CaptureCommands
    {
        private const int MaxSide = 16384;
        private const uint LineColor = 0x00C800FF; // COLORREF 0x00BBGGRR: magenta
        private const uint LabelColor = 0x0000E6FF; // yellow
        private const uint LabelBackground = 0x00201010;

        public static void Register(Dispatcher dispatcher)
        {
            dispatcher.Register("capture", Capture);
        }

        /// <summary>
        /// Args: x, y, w, h (physical screen pixels), maxWidth (default 1600), grid (default false),
        /// gridStep (default 100). Grid labels show screen coordinates, so they can be used directly.
        /// </summary>
        public static object Capture(Dictionary<string, object> args)
        {
            int x = Args.RequireInt(args, "x"), y = Args.RequireInt(args, "y");
            int w = Args.RequireInt(args, "w"), h = Args.RequireInt(args, "h");
            if (w <= 0 || h <= 0 || w > MaxSide || h > MaxSide)
                throw new HelperException("BAD_ARGS", "Capture size must be between 1 and " + MaxSide + " pixels.");
            var maxWidth = Args.OptionalInt(args, "maxWidth", 1600);
            if (maxWidth <= 0) throw new HelperException("BAD_ARGS", "maxWidth must be positive.");
            var grid = Args.OptionalBool(args, "grid", false);
            var gridStep = Args.OptionalInt(args, "gridStep", 100);
            if (gridStep < 10) throw new HelperException("BAD_ARGS", "gridStep must be at least 10.");

            var size = CaptureMath.Shrink(w, h, maxWidth);
            Action<IntPtr> decorate = null;
            if (grid) decorate = delegate(IntPtr dc) { DrawGrid(dc, x, y, w, h, size, gridStep); };
            var pixels = Grab(x, y, w, h, size, decorate);

            return new Dictionary<string, object>
            {
                { "png", Convert.ToBase64String(Png.EncodeBgra(pixels, size.Width, size.Height)) },
                { "width", size.Width },
                { "height", size.Height },
                { "scale", size.Scale },
                { "origin", new Dictionary<string, object> { { "x", x }, { "y", y } } },
            };
        }

        /// <summary>Copies a screen region into top-down BGRA pixels of <paramref name="size"/> (shrunk or enlarged).</summary>
        internal static byte[] Grab(int x, int y, int w, int h, OutputSize size, Action<IntPtr> decorate)
        {
            var screen = Gdi.GetDC(IntPtr.Zero);
            var memory = Gdi.CreateCompatibleDC(screen);
            var bitmap = Gdi.CreateCompatibleBitmap(screen, size.Width, size.Height);
            var previous = Gdi.SelectObject(memory, bitmap);
            try
            {
                bool copied;
                if (size.Width == w && size.Height == h)
                {
                    copied = Gdi.BitBlt(memory, 0, 0, w, h, screen, x, y, Gdi.SRCCOPY | Gdi.CAPTUREBLT);
                }
                else
                {
                    Gdi.SetStretchBltMode(memory, Gdi.HALFTONE);
                    Gdi.SetBrushOrgEx(memory, 0, 0, IntPtr.Zero);
                    copied = Gdi.StretchBlt(memory, 0, 0, size.Width, size.Height, screen, x, y, w, h, Gdi.SRCCOPY | Gdi.CAPTUREBLT);
                }
                if (!copied) throw new HelperException("CAPTURE_FAILED", "Could not copy the screen.");
                if (decorate != null) decorate(memory);

                Gdi.SelectObject(memory, previous);
                var pixels = new byte[size.Width * size.Height * 4];
                var info = new Gdi.BITMAPINFOHEADER
                {
                    biSize = Marshal.SizeOf(typeof(Gdi.BITMAPINFOHEADER)),
                    biWidth = size.Width,
                    biHeight = -size.Height, // top-down rows
                    biPlanes = 1,
                    biBitCount = 32,
                };
                if (Gdi.GetDIBits(memory, bitmap, 0, (uint)size.Height, pixels, ref info, 0) == 0)
                    throw new HelperException("CAPTURE_FAILED", "Could not read the captured pixels.");
                return pixels;
            }
            finally
            {
                Gdi.SelectObject(memory, previous);
                Gdi.DeleteObject(bitmap);
                Gdi.DeleteDC(memory);
                Gdi.ReleaseDC(IntPtr.Zero, screen);
            }
        }

        private static void DrawGrid(IntPtr dc, int x, int y, int w, int h, OutputSize size, int step)
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
                    var px = (int)Math.Round((sx - x) * size.Scale);
                    Gdi.MoveToEx(dc, px, 0, IntPtr.Zero);
                    Gdi.LineTo(dc, px, size.Height);
                    Label(dc, px + 2, 1, sx.ToString());
                    Label(dc, px + 2, size.Height - 15, sx.ToString());
                }
                foreach (var sy in CaptureMath.GridLines(y, h, step))
                {
                    var py = (int)Math.Round((sy - y) * size.Scale);
                    Gdi.MoveToEx(dc, 0, py, IntPtr.Zero);
                    Gdi.LineTo(dc, size.Width, py);
                    Label(dc, 1, py + 1, sy.ToString());
                    Label(dc, size.Width - 34, py + 1, sy.ToString());
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

        private static void Label(IntPtr dc, int x, int y, string text)
        {
            Gdi.TextOutW(dc, x, y, text, text.Length);
        }
    }

    internal static class Gdi
    {
        public const uint SRCCOPY = 0x00CC0020;
        public const uint CAPTUREBLT = 0x40000000;
        public const int HALFTONE = 4;
        public const int PS_DOT = 2;
        public const int OPAQUE = 2;
        public const int TRANSPARENT = 1;
        public const uint WHITENESS = 0x00FF0062;

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

        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int w, int h);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
        [DllImport("gdi32.dll")] public static extern bool StretchBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int sw, int sh, uint rop);
        [DllImport("gdi32.dll")] public static extern int SetStretchBltMode(IntPtr dc, int mode);
        [DllImport("gdi32.dll")] public static extern bool SetBrushOrgEx(IntPtr dc, int x, int y, IntPtr previous);
        [DllImport("gdi32.dll")] public static extern int GetDIBits(IntPtr dc, IntPtr bitmap, uint start, uint lines, [Out] byte[] bits, ref BITMAPINFOHEADER info, uint usage);
        [DllImport("gdi32.dll")] public static extern IntPtr CreatePen(int style, int width, uint color);
        [DllImport("gdi32.dll")] public static extern bool MoveToEx(IntPtr dc, int x, int y, IntPtr previous);
        [DllImport("gdi32.dll")] public static extern bool LineTo(IntPtr dc, int x, int y);
        [DllImport("gdi32.dll")] public static extern uint SetTextColor(IntPtr dc, uint color);
        [DllImport("gdi32.dll")] public static extern uint SetBkColor(IntPtr dc, uint color);
        [DllImport("gdi32.dll")] public static extern int SetBkMode(IntPtr dc, int mode);
        [DllImport("gdi32.dll")] public static extern bool PatBlt(IntPtr dc, int x, int y, int w, int h, uint rop);
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern bool TextOutW(IntPtr dc, int x, int y, string text, int length);

        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr CreateFontW(int height, int width, int escapement, int orientation, int weight,
            uint italic, uint underline, uint strikeOut, uint charSet, uint outPrecision, uint clipPrecision,
            uint quality, uint pitchAndFamily, string face);
    }
}
