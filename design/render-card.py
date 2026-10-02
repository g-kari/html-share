"""Optional asset authoring helper. Requires Pillow; never used by site builds.

Run from the repository root: python design/render-card.py
The versioned PNG is committed so deployment only needs Node.js.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SCALE = 2
image = Image.new("RGB", (1200 * SCALE, 630 * SCALE))
pixels = image.load()
for y in range(image.height):
    for x in range(image.width):
        glow = max(0, 1 - (((x / SCALE - 1090) / 930) ** 2 + ((y / SCALE - 30) / 750) ** 2))
        pixels[x, y] = (int(15 + 9 * glow), int(17 + 15 * glow), int(25 + 29 * glow))
draw = ImageDraw.Draw(image)
def box(rect, **kwargs):
    draw.rounded_rectangle(tuple(int(n * SCALE) for n in rect), radius=kwargs.pop("radius", 0) * SCALE, **kwargs)
def font(size, bold=False):
    family = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(family, size * SCALE)
def text(x, y, value, size, fill, bold=False):
    draw.text((x * SCALE, y * SCALE), value, font=font(size, bold), fill=fill)
box((38, 38, 1162, 592), radius=28, outline="#3a465e", width=2 * SCALE)
box((80, 91, 342, 137), radius=23, fill="#26374d")
text(98, 101, "IDEAS / NOTES / GUIDES", 15, "#bdd5ef", True)
text(76, 193, "HTML Share", 83, "#f2f5fb", True)
text(83, 318, "A little space for useful things.", 28, "#aebbd0")
box((81, 460, 392, 518), radius=14, fill="#1e2b3d", outline="#455d7c", width=SCALE)
text(103, 470, "share.0g0.xyz", 28, "#b4ccff")
# An original stacked-document mark, with no third-party brand artwork.
box((908, 179, 1099, 400), radius=22, fill="#233348", outline="#647fb4", width=2 * SCALE)
box((880, 209, 1071, 430), radius=22, fill="#344165", outline="#8197c1", width=2 * SCALE)
box((852, 239, 1043, 460), radius=22, fill="#1c263a", outline="#acbded", width=3 * SCALE)
text(877, 258, "</>", 44, "#a1dadd", True)
for y, end in [(350, 1008), (379, 985), (408, 997)]:
    box((881, y, end, y + 8), radius=4, fill="#7791bc")
output = Path("public/assets/html-share-card-v1.png")
output.parent.mkdir(parents=True, exist_ok=True)
image.resize((1200, 630), Image.Resampling.LANCZOS).save(output, optimize=True)
print(output)
