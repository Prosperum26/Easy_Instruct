#if !WINRT_PROJECTION
using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Threading.Tasks;

namespace WinHelper
{
    /// <summary>
    /// OCR for Windows PowerShell 5.1. Add-Type cannot reference .winmd files, so the WinRT types are
    /// resolved at runtime through .NET Framework's built-in WinRT interop. See OcrEngineWinRt.cs for the exe.
    /// </summary>
    internal static class OcrEngineBridge
    {
        private const int TimeoutMs = 10000;
        private const string InteropAssembly =
            "System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";

        public static List<OcrLine> Recognize(byte[] bgra, int width, int height, string lang, out string language)
        {
            var engineType = WinRt("Windows.Media.Ocr.OcrEngine", "Windows.Foundation");
            object engine;
            try
            {
                engine = lang == null
                    ? engineType.GetMethod("TryCreateFromUserProfileLanguages").Invoke(null, null)
                    : engineType.GetMethod("TryCreateFromLanguage").Invoke(null, new[] { Language(lang) });
            }
            catch (TargetInvocationException)
            {
                engine = null;
            }
            if (engine == null)
                throw new HelperException("OCR_UNAVAILABLE", "No OCR engine for " + (lang ?? "the user's languages") + ".");
            language = (string)Get(Get(engine, "RecognizerLanguage"), "LanguageTag");

            var buffer = Type.GetType("System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions, " + InteropAssembly, true)
                .GetMethod("AsBuffer", new[] { typeof(byte[]) })
                .Invoke(null, new object[] { bgra });
            var bitmapType = WinRt("Windows.Graphics.Imaging.SoftwareBitmap", "Windows.Graphics");
            var bitmap = FindMethod(bitmapType, "CreateCopyFromBuffer", 5).Invoke(null, new[]
            {
                buffer,
                Enum.Parse(WinRt("Windows.Graphics.Imaging.BitmapPixelFormat", "Windows.Graphics"), "Bgra8"),
                width,
                height,
                Enum.Parse(WinRt("Windows.Graphics.Imaging.BitmapAlphaMode", "Windows.Graphics"), "Premultiplied"),
            });

            var operation = engineType.GetMethod("RecognizeAsync").Invoke(engine, new[] { bitmap });
            var result = Await(operation, WinRt("Windows.Media.Ocr.OcrResult", "Windows.Foundation"));

            var lines = new List<OcrLine>();
            foreach (var line in (IEnumerable)Get(result, "Lines"))
            {
                var converted = new OcrLine { Text = (string)Get(line, "Text") };
                foreach (var word in (IEnumerable)Get(line, "Words"))
                {
                    var rect = Get(word, "BoundingRect");
                    converted.Words.Add(new OcrWord
                    {
                        Text = (string)Get(word, "Text"),
                        X = Convert.ToDouble(Get(rect, "X")),
                        Y = Convert.ToDouble(Get(rect, "Y")),
                        W = Convert.ToDouble(Get(rect, "Width")),
                        H = Convert.ToDouble(Get(rect, "Height")),
                    });
                }
                lines.Add(converted);
            }
            return lines;
        }

        public static List<object> Languages()
        {
            var tags = new List<object>();
            var available = WinRt("Windows.Media.Ocr.OcrEngine", "Windows.Foundation").GetProperty("AvailableRecognizerLanguages").GetValue(null, null);
            foreach (var language in (IEnumerable)available) tags.Add(Get(language, "LanguageTag"));
            return tags;
        }

        private static Type WinRt(string name, string contract)
        {
            try
            {
                return Type.GetType(name + ", " + contract + ", ContentType=WindowsRuntime", true);
            }
            catch (Exception e)
            {
                throw new HelperException("OCR_UNAVAILABLE", "Windows OCR is not available: " + e.Message);
            }
        }

        private static object Language(string tag)
        {
            return Activator.CreateInstance(WinRt("Windows.Globalization.Language", "Windows.Foundation"), tag);
        }

        private static object Get(object target, string property)
        {
            return target.GetType().GetProperty(property).GetValue(target, null);
        }

        private static MethodInfo FindMethod(Type type, string name, int parameterCount)
        {
            foreach (var method in type.GetMethods())
                if (method.Name == name && method.GetParameters().Length == parameterCount) return method;
            throw new HelperException("OCR_UNAVAILABLE", "Missing WinRT method " + name + ".");
        }

        private static object Await(object operation, Type resultType)
        {
            var extensions = Type.GetType("System.WindowsRuntimeSystemExtensions, " + InteropAssembly, true);
            MethodInfo asTask = null;
            foreach (var method in extensions.GetMethods())
            {
                if (method.Name != "AsTask" || !method.IsGenericMethodDefinition) continue;
                var parameters = method.GetParameters();
                if (parameters.Length == 1 && parameters[0].ParameterType.Name == "IAsyncOperation`1")
                {
                    asTask = method.MakeGenericMethod(resultType);
                    break;
                }
            }
            if (asTask == null) throw new HelperException("OCR_UNAVAILABLE", "Missing WinRT AsTask.");
            var task = (Task)asTask.Invoke(null, new[] { operation });
            if (!task.Wait(TimeoutMs)) throw new HelperException("OCR_TIMEOUT", "OCR took too long.");
            return task.GetType().GetProperty("Result").GetValue(task, null);
        }
    }
}
#endif
