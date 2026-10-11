# Writes src-tauri/icons/tray.png: the pixel speech bubble of the app icon as
# a one-colour 36x36 image. macOS tints it for the menu bar (template image).
import struct, zlib
rows = [
    "...........",
    "..#######..",
    ".#########.",
    "###########",
    "###########",
    "###########",
    ".#########.",
    "..#######..",
    "..###......",
    "..##.......",
    "..#........",
]
cell, size = 3, 36
w = len(rows[0]) * cell
ox, oy = (size - w) // 2, (size - len(rows) * cell) // 2 + 1
pixels = bytearray(size * size * 4)
for y, row in enumerate(rows):
    for x, c in enumerate(row):
        if c != "#":
            continue
        for dy in range(cell):
            for dx in range(cell):
                o = ((oy + y * cell + dy) * size + ox + x * cell + dx) * 4
                pixels[o:o + 4] = bytes([0, 0, 0, 255])
raw = b"".join(b"\x00" + bytes(pixels[y * size * 4:(y + 1) * size * 4]) for y in range(size))
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
open("src-tauri/icons/tray.png", "wb").write(png)
