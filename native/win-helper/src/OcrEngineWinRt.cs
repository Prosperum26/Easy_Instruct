#if WINRT_PROJECTION
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

namespace WinHelper
{
    /// <summary>OCR for the .NET exe through the WinRT projection (Windows 10 TFM). See OcrEngineReflection.cs for PowerShell.</summary>
    internal static class OcrEngineBridge
    {
        private const int TimeoutMs = 10000;

        public static List<OcrLine> Recognize(byte[] bgra, int width, int height, string lang, out string language)
        {
            OcrEngine engine;
            try
            {
                engine = lang == null
                    ? OcrEngine.TryCreateFromUserProfileLanguages()
                    : OcrEngine.TryCreateFromLanguage(new Windows.Globalization.Language(lang));
            }
            catch (ArgumentException)
            {
                engine = null;
            }
            if (engine == null)
                throw new HelperException("OCR_UNAVAILABLE", "No OCR engine for " + (lang ?? "the user's languages") + ".");
            language = engine.RecognizerLanguage.LanguageTag;

            var bitmap = SoftwareBitmap.CreateCopyFromBuffer(bgra.AsBuffer(), BitmapPixelFormat.Bgra8, width, height, BitmapAlphaMode.Premultiplied);
            var task = engine.RecognizeAsync(bitmap).AsTask();
            if (!task.Wait(TimeoutMs)) throw new HelperException("OCR_TIMEOUT", "OCR took too long.");

            var lines = new List<OcrLine>();
            foreach (var line in task.Result.Lines)
            {
                var result = new OcrLine { Text = line.Text };
                foreach (var word in line.Words)
                {
                    var r = word.BoundingRect;
                    result.Words.Add(new OcrWord { Text = word.Text, X = r.X, Y = r.Y, W = r.Width, H = r.Height });
                }
                lines.Add(result);
            }
            return lines;
        }

        public static List<object> Languages()
        {
            var tags = new List<object>();
            foreach (var language in OcrEngine.AvailableRecognizerLanguages) tags.Add(language.LanguageTag);
            return tags;
        }
    }
}
#endif
