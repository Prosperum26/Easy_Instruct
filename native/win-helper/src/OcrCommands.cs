using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace WinHelper
{
    public class OcrWord
    {
        public string Text;
        public double X, Y, W, H;
    }

    public class OcrLine
    {
        public string Text;
        public List<OcrWord> Words = new List<OcrWord>();
    }

    /// <summary>
    /// Text recognition with Windows.Media.Ocr. The engine call lives in OcrEngineWinRt.cs (the .NET exe,
    /// WinRT projection) or OcrEngineReflection.cs (Windows PowerShell, runtime WinRT interop); everything
    /// else is shared.
    /// </summary>
    public static class OcrCommands
    {
        private const int MaxScale = 4;
        private const int MaxSide = 4096;

        public static void Register(Dispatcher dispatcher)
        {
            dispatcher.Register("ocr", Ocr);
            dispatcher.Register("ocr_selftest", SelfTest);
        }

        /// <summary>
        /// Args: x, y, w, h (physical screen pixels), scale (default 2: small UI text reads better enlarged),
        /// lang (BCP-47 tag; default: the user's profile languages). Returns {language, lines: [{text, rect,
        /// words: [{text, rect}]}]} with rects in physical screen pixels.
        /// </summary>
        public static object Ocr(Dictionary<string, object> args)
        {
            int x = Args.RequireInt(args, "x"), y = Args.RequireInt(args, "y");
            int w = Args.RequireInt(args, "w"), h = Args.RequireInt(args, "h");
            var scale = Args.OptionalInt(args, "scale", 2);
            if (w <= 0 || h <= 0) throw new HelperException("BAD_ARGS", "OCR region must not be empty.");
            if (scale < 1 || scale > MaxScale) throw new HelperException("BAD_ARGS", "scale must be between 1 and " + MaxScale + ".");
            if (w * scale > MaxSide || h * scale > MaxSide)
                throw new HelperException("BAD_ARGS", "OCR region is too large; use a smaller region or scale.");
            var lang = Args.OptionalString(args, "lang");

            var size = new OutputSize { Width = w * scale, Height = h * scale, Scale = scale };
            var pixels = CaptureCommands.Grab(x, y, w, h, size, null);
            MakeOpaque(pixels);

            string language;
            var lines = OcrEngineBridge.Recognize(pixels, size.Width, size.Height, lang, out language);
            var result = new List<object>();
            foreach (var line in lines)
            {
                var words = new List<object>();
                int left = int.MaxValue, top = int.MaxValue, right = int.MinValue, bottom = int.MinValue;
                foreach (var word in line.Words)
                {
                    var r = ToScreen(word.X, word.Y, word.W, word.H, x, y, scale);
                    left = Math.Min(left, r[0]);
                    top = Math.Min(top, r[1]);
                    right = Math.Max(right, r[0] + r[2]);
                    bottom = Math.Max(bottom, r[1] + r[3]);
                    words.Add(new Dictionary<string, object> { { "text", word.Text }, { "rect", List(r) } });
                }
                if (words.Count == 0) continue;
                result.Add(new Dictionary<string, object>
                {
                    { "text", line.Text },
                    { "rect", List(new[] { left, top, right - left, bottom - top }) },
                    { "words", words },
                });
            }
            return new Dictionary<string, object> { { "language", language }, { "lines", result } };
        }

        /// <summary>Renders "EASY 12345" off screen and reads it back: tells whether OCR works on this machine.</summary>
        public static object SelfTest(Dictionary<string, object> args)
        {
            const int w = 420, h = 90;
            var pixels = RenderText("EASY 12345", w, h);
            string language;
            var text = "";
            foreach (var line in OcrEngineBridge.Recognize(pixels, w, h, null, out language)) text += line.Text + " ";
            text = text.Trim();
            return new Dictionary<string, object>
            {
                { "ok", text.Contains("12345") },
                { "text", text },
                { "language", language },
                { "languages", OcrEngineBridge.Languages() },
            };
        }

        public static int[] ToScreen(double rx, double ry, double rw, double rh, int originX, int originY, int scale)
        {
            return new[]
            {
                (int)Math.Round(originX + rx / scale),
                (int)Math.Round(originY + ry / scale),
                (int)Math.Round(rw / scale),
                (int)Math.Round(rh / scale),
            };
        }

        /// <summary>GDI leaves alpha at 0; OCR takes premultiplied BGRA, where that would mean "transparent".</summary>
        public static void MakeOpaque(byte[] bgra)
        {
            for (var i = 3; i < bgra.Length; i += 4) bgra[i] = 255;
        }

        private static List<object> List(int[] values)
        {
            var list = new List<object>();
            foreach (var v in values) list.Add(v);
            return list;
        }

        private static byte[] RenderText(string text, int w, int h)
        {
            var screen = Gdi.GetDC(IntPtr.Zero);
            var dc = Gdi.CreateCompatibleDC(screen);
            var bitmap = Gdi.CreateCompatibleBitmap(screen, w, h);
            var oldBitmap = Gdi.SelectObject(dc, bitmap);
            var font = Gdi.CreateFontW(-48, 0, 0, 0, 700, 0, 0, 0, 0, 0, 0, 0, 0, "Segoe UI");
            var oldFont = Gdi.SelectObject(dc, font);
            try
            {
                Gdi.PatBlt(dc, 0, 0, w, h, Gdi.WHITENESS);
                Gdi.SetBkMode(dc, Gdi.TRANSPARENT);
                Gdi.SetTextColor(dc, 0x00000000);
                Gdi.TextOutW(dc, 16, 12, text, text.Length);
                Gdi.SelectObject(dc, oldBitmap);

                var pixels = new byte[w * h * 4];
                var info = new Gdi.BITMAPINFOHEADER
                {
                    biSize = Marshal.SizeOf(typeof(Gdi.BITMAPINFOHEADER)),
                    biWidth = w,
                    biHeight = -h,
                    biPlanes = 1,
                    biBitCount = 32,
                };
                Gdi.GetDIBits(dc, bitmap, 0, (uint)h, pixels, ref info, 0);
                MakeOpaque(pixels);
                return pixels;
            }
            finally
            {
                Gdi.SelectObject(dc, oldFont);
                Gdi.DeleteObject(font);
                Gdi.DeleteObject(bitmap);
                Gdi.DeleteDC(dc);
                Gdi.ReleaseDC(IntPtr.Zero, screen);
            }
        }
    }
}
