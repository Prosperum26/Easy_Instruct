using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace WinHelper
{
    public class JsonFormatException : Exception
    {
        public JsonFormatException(string message) : base(message) { }
    }

    /// <summary>
    /// Minimal JSON for the helper protocol, available on both .NET Framework and .NET.
    /// Objects parse to Dictionary&lt;string, object&gt;, arrays to List&lt;object&gt;, numbers to double.
    /// </summary>
    public static class Json
    {
        public static object Parse(string text)
        {
            var parser = new Parser(text ?? "");
            parser.SkipWhitespace();
            var value = parser.ReadValue();
            parser.SkipWhitespace();
            if (!parser.AtEnd) throw new JsonFormatException("Unexpected text after the JSON value.");
            return value;
        }

        public static string Serialize(object value)
        {
            var builder = new StringBuilder();
            Write(builder, value);
            return builder.ToString();
        }

        private static void Write(StringBuilder b, object value)
        {
            if (value == null) { b.Append("null"); return; }
            if (value is string) { WriteString(b, (string)value); return; }
            if (value is bool) { b.Append((bool)value ? "true" : "false"); return; }
            if (value is int || value is long || value is short || value is uint)
            {
                b.Append(Convert.ToInt64(value).ToString(CultureInfo.InvariantCulture));
                return;
            }
            if (value is double || value is float)
            {
                var d = Convert.ToDouble(value);
                if (double.IsNaN(d) || double.IsInfinity(d)) throw new ArgumentException("JSON cannot hold NaN or Infinity.");
                b.Append(d.ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            var dictionary = value as IDictionary<string, object>;
            if (dictionary != null)
            {
                b.Append('{');
                var first = true;
                foreach (var pair in dictionary)
                {
                    if (!first) b.Append(',');
                    first = false;
                    WriteString(b, pair.Key);
                    b.Append(':');
                    Write(b, pair.Value);
                }
                b.Append('}');
                return;
            }
            var list = value as IEnumerable;
            if (list != null)
            {
                b.Append('[');
                var first = true;
                foreach (var item in list)
                {
                    if (!first) b.Append(',');
                    first = false;
                    Write(b, item);
                }
                b.Append(']');
                return;
            }
            throw new ArgumentException("Cannot serialize " + value.GetType().Name + " to JSON.");
        }

        private static void WriteString(StringBuilder b, string s)
        {
            b.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': b.Append("\\\""); break;
                    case '\\': b.Append("\\\\"); break;
                    case '\n': b.Append("\\n"); break;
                    case '\r': b.Append("\\r"); break;
                    case '\t': b.Append("\\t"); break;
                    case '\b': b.Append("\\b"); break;
                    case '\f': b.Append("\\f"); break;
                    default:
                        if (c < 0x20 || c == (char)0x2028 || c == (char)0x2029) b.Append("\\u").Append(((int)c).ToString("x4"));
                        else b.Append(c);
                        break;
                }
            }
            b.Append('"');
        }

        private class Parser
        {
            private readonly string _text;
            private int _pos;

            public Parser(string text) { _text = text; }

            public bool AtEnd { get { return _pos >= _text.Length; } }

            public void SkipWhitespace()
            {
                while (!AtEnd && (_text[_pos] == ' ' || _text[_pos] == '\t' || _text[_pos] == '\n' || _text[_pos] == '\r' || _text[_pos] == (char)0xFEFF)) _pos++;
            }

            public object ReadValue()
            {
                if (AtEnd) throw new JsonFormatException("Unexpected end of JSON.");
                var c = _text[_pos];
                if (c == '{') return ReadObject();
                if (c == '[') return ReadArray();
                if (c == '"') return ReadString();
                if (c == 't') { Expect("true"); return true; }
                if (c == 'f') { Expect("false"); return false; }
                if (c == 'n') { Expect("null"); return null; }
                if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber();
                throw new JsonFormatException("Unexpected character '" + c + "' at " + _pos + ".");
            }

            private Dictionary<string, object> ReadObject()
            {
                var result = new Dictionary<string, object>();
                _pos++;
                SkipWhitespace();
                if (Peek() == '}') { _pos++; return result; }
                while (true)
                {
                    SkipWhitespace();
                    if (Peek() != '"') throw new JsonFormatException("Expected a property name at " + _pos + ".");
                    var key = ReadString();
                    SkipWhitespace();
                    Consume(':');
                    SkipWhitespace();
                    result[key] = ReadValue();
                    SkipWhitespace();
                    if (Peek() == ',') { _pos++; continue; }
                    Consume('}');
                    return result;
                }
            }

            private List<object> ReadArray()
            {
                var result = new List<object>();
                _pos++;
                SkipWhitespace();
                if (Peek() == ']') { _pos++; return result; }
                while (true)
                {
                    SkipWhitespace();
                    result.Add(ReadValue());
                    SkipWhitespace();
                    if (Peek() == ',') { _pos++; continue; }
                    Consume(']');
                    return result;
                }
            }

            private string ReadString()
            {
                _pos++;
                var b = new StringBuilder();
                while (true)
                {
                    if (AtEnd) throw new JsonFormatException("Unterminated string.");
                    var c = _text[_pos++];
                    if (c == '"') return b.ToString();
                    if (c != '\\') { b.Append(c); continue; }
                    if (AtEnd) throw new JsonFormatException("Unterminated escape.");
                    var e = _text[_pos++];
                    switch (e)
                    {
                        case '"': b.Append('"'); break;
                        case '\\': b.Append('\\'); break;
                        case '/': b.Append('/'); break;
                        case 'b': b.Append('\b'); break;
                        case 'f': b.Append('\f'); break;
                        case 'n': b.Append('\n'); break;
                        case 'r': b.Append('\r'); break;
                        case 't': b.Append('\t'); break;
                        case 'u':
                            if (_pos + 4 > _text.Length) throw new JsonFormatException("Bad unicode escape.");
                            int code;
                            if (!int.TryParse(_text.Substring(_pos, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out code))
                                throw new JsonFormatException("Bad unicode escape.");
                            b.Append((char)code);
                            _pos += 4;
                            break;
                        default: throw new JsonFormatException("Bad escape '\\" + e + "'.");
                    }
                }
            }

            private double ReadNumber()
            {
                var start = _pos;
                while (!AtEnd && "+-0123456789.eE".IndexOf(_text[_pos]) >= 0) _pos++;
                double number;
                if (!double.TryParse(_text.Substring(start, _pos - start), NumberStyles.Float, CultureInfo.InvariantCulture, out number))
                    throw new JsonFormatException("Bad number at " + start + ".");
                return number;
            }

            private void Expect(string word)
            {
                if (string.CompareOrdinal(_text, _pos, word, 0, word.Length) != 0)
                    throw new JsonFormatException("Unexpected token at " + _pos + ".");
                _pos += word.Length;
            }

            private char Peek()
            {
                if (AtEnd) throw new JsonFormatException("Unexpected end of JSON.");
                return _text[_pos];
            }

            private void Consume(char expected)
            {
                if (Peek() != expected) throw new JsonFormatException("Expected '" + expected + "' at " + _pos + ".");
                _pos++;
            }
        }
    }
}
