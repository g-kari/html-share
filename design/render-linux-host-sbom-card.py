"""Render the article-specific Open Graph image for linux-host-sbom-inventory.

Usage: python3 design/render-linux-host-sbom-card.py
Requires Pillow and a Japanese-capable font.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/assets/linux-host-sbom-ogp-v1.png"
FONT_DIR = Path("/usr/share/fonts/opentype/noto")
FONTS = [
    (FONT_DIR / "NotoSansCJK-Bold.ttc", FONT_DIR / "NotoSansCJK-Regular.ttc"),
    (Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"),
     Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc")),
]


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for heavy, regular in FONTS:
        path = heavy if bold else regular
        if path.exists():
            return ImageFont.truetype(str(path), size, index=0)
    raise RuntimeError("A Japanese-capable Noto Sans CJK font is required")


width, height = 1200, 630
background = "#15262d"
surface = "#20343a"
cyan = "#84e2ec"
white = "#f9fcfc"
dim = "#bacbd0"

img = Image.new("RGB", (width, height), background)
draw = ImageDraw.Draw(img)
draw.rectangle((0, 0, 16, height), fill=cyan)
draw.text((70, 49), "HTML Share", font=get_font(27, True), fill=white)
draw.line((70, 103, 1124, 103), fill="#4e6971", width=2)

for text, y in [
    ("Linuxサーバーの", 151),
    ("ソフトウェアを", 256),
    ("SBOM化する", 361),
]:
    draw.text((68, y), text, font=get_font(72, True), fill=white)

# Architecture illustration: a host inventory becomes a standard SBOM.
left, right = 764, 1122
draw.rounded_rectangle((left, 151, right, 350), radius=12,
                       fill=surface, outline="#658189", width=2)
draw.text((785, 166), "HOST INVENTORY", font=get_font(19, True), fill=cyan)
draw.line((786, 211, 1101, 211), fill="#587178", width=1)
draw.text((787, 237), "nginx", font=get_font(32, True), fill=white)
draw.text((941, 237), "PHP", font=get_font(32, True), fill=white)
draw.text((786, 293), "OpenSSL", font=get_font(27), fill=dim)

draw.line((943, 366, 943, 406), fill=cyan, width=5)
draw.polygon([(930, 397), (956, 397), (943, 417)], fill=cyan)

draw.rounded_rectangle((left, 436, right, 521), radius=12,
                       outline=cyan, width=3)
draw.text((790, 457), "CycloneDX JSON", font=get_font(29, True), fill=cyan)

draw.line((70, 564, 1124, 564), fill="#4e6971", width=2)
draw.text((70, 578), "ソフトウェア構成の収集・標準化・脆弱性照合", font=get_font(20), fill=dim)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUTPUT, optimize=True)
print(f"Wrote {OUTPUT} ({width}x{height})")
