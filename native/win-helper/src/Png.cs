using System.IO;
using System.IO.Compression;
using System.Text;

namespace WinHelper
{
    /// <summary>A minimal PNG encoder (8-bit RGB, no filtering) so the helper needs no imaging library.</summary>
    public static class Png
    {
        private static readonly uint[] CrcTable = BuildCrcTable();

        /// <summary>Encodes top-down 32-bit BGRA pixels; alpha is dropped.</summary>
        public static byte[] EncodeBgra(byte[] bgra, int width, int height)
        {
            var raw = new byte[height * (1 + width * 3)];
            var o = 0;
            for (var y = 0; y < height; y++)
            {
                raw[o++] = 0; // filter: none
                var row = y * width * 4;
                for (var x = 0; x < width; x++)
                {
                    raw[o++] = bgra[row + x * 4 + 2];
                    raw[o++] = bgra[row + x * 4 + 1];
                    raw[o++] = bgra[row + x * 4];
                }
            }

            var header = new byte[13];
            WriteBigEndian(header, 0, (uint)width);
            WriteBigEndian(header, 4, (uint)height);
            header[8] = 8; // bit depth
            header[9] = 2; // colour type: RGB

            using (var png = new MemoryStream())
            {
                png.Write(new byte[] { 0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A }, 0, 8);
                WriteChunk(png, "IHDR", header);
                WriteChunk(png, "IDAT", Zlib(raw));
                WriteChunk(png, "IEND", new byte[0]);
                return png.ToArray();
            }
        }

        public static uint Crc32(byte[] data, int offset, int count)
        {
            var crc = 0xFFFFFFFFu;
            for (var i = offset; i < offset + count; i++) crc = CrcTable[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
            return crc ^ 0xFFFFFFFFu;
        }

        /// <summary>zlib stream = 2-byte header + raw deflate + Adler-32 (DeflateStream alone is raw deflate).</summary>
        private static byte[] Zlib(byte[] data)
        {
            using (var output = new MemoryStream())
            {
                output.WriteByte(0x78);
                output.WriteByte(0x9C);
                using (var deflate = new DeflateStream(output, CompressionLevel.Optimal, true)) deflate.Write(data, 0, data.Length);

                uint a = 1, b = 0;
                foreach (var value in data)
                {
                    a = (a + value) % 65521;
                    b = (b + a) % 65521;
                }
                var adler = new byte[4];
                WriteBigEndian(adler, 0, (b << 16) | a);
                output.Write(adler, 0, 4);
                return output.ToArray();
            }
        }

        private static void WriteChunk(Stream output, string type, byte[] data)
        {
            var length = new byte[4];
            WriteBigEndian(length, 0, (uint)data.Length);
            output.Write(length, 0, 4);

            var typeAndData = new byte[4 + data.Length];
            Encoding.ASCII.GetBytes(type, 0, 4, typeAndData, 0);
            data.CopyTo(typeAndData, 4);
            output.Write(typeAndData, 0, typeAndData.Length);

            var crc = new byte[4];
            WriteBigEndian(crc, 0, Crc32(typeAndData, 0, typeAndData.Length));
            output.Write(crc, 0, 4);
        }

        private static void WriteBigEndian(byte[] buffer, int offset, uint value)
        {
            buffer[offset] = (byte)(value >> 24);
            buffer[offset + 1] = (byte)(value >> 16);
            buffer[offset + 2] = (byte)(value >> 8);
            buffer[offset + 3] = (byte)value;
        }

        private static uint[] BuildCrcTable()
        {
            var table = new uint[256];
            for (var n = 0u; n < 256; n++)
            {
                var c = n;
                for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                table[n] = c;
            }
            return table;
        }
    }
}
