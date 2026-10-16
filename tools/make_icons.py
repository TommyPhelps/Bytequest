"""Draws the BYTEQUEST icon (pixel '>_' prompt on a beveled navy CRT tile) and writes Tauri's icon set.
Usage: python3 tools/make_icons.py src-tauri/icons"""
import sys
from PIL import Image, ImageDraw

NAVY_TOP, NAVY_BOT = (16, 34, 74), (5, 11, 24)
GREEN, GREEN_DIM = (82, 255, 140), (30, 120, 70)

def draw(size):
    s = 1024
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = 56
    for y in range(m, s - m):
        t = (y - m) / (s - 2 * m)
        c = tuple(int(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOT)) + (255,)
        d.line([(m, y), (s - m, y)], fill=c)
    w = 22
    d.rectangle([m, m, s - m - 1, m + w], fill=(150, 180, 230, 255))
    d.rectangle([m, m, m + w, s - m - 1], fill=(150, 180, 230, 255))
    d.rectangle([m, s - m - w, s - m - 1, s - m - 1], fill=(2, 4, 11, 255))
    d.rectangle([s - m - w, m, s - m - 1, s - m - 1], fill=(2, 4, 11, 255))
    d.rectangle([m - 8, m - 8, s - m + 7, s - m + 7], outline=(2, 4, 11, 255), width=8)
    a, b = 160, s - 160
    d.rectangle([a, a, b, b], fill=(3, 14, 10, 255))
    for y in range(a, b, 16):  # scanlines
        d.line([(a, y), (b, y)], fill=(6, 26, 18, 255), width=6)
    px = 56  # pixel grid
    def cell(cx, cy, col=GREEN):
        x0, y0 = 250 + cx * px, 330 + cy * px
        d.rectangle([x0, y0, x0 + px - 6, y0 + px - 6], fill=col + (255,))
    for i, (cx, cy) in enumerate([(0, 0), (1, 1), (2, 2), (3, 3), (2, 4), (1, 5), (0, 6)]):
        cell(cx, cy)
    for cx in range(5, 10):
        cell(cx, 6)
    for cx in range(5, 10):
        cell(cx, 7, GREEN_DIM)
    return im.resize((size, size), Image.LANCZOS)

out = sys.argv[1]
big = draw(1024)
big.save(f"{out}/icon.png")
for n, p in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)]:
    draw(p).save(f"{out}/{n}")
big.save(f"{out}/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
