"""Значки приложения (PNG) для установки на экран «Домой»: 192, 512, maskable 512, apple-touch 180. Запуск: python tools/gen_icons.py (нужен Pillow)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "icons")
BLUE, DARK, WHITE, AMBER = (31, 111, 181), (20, 74, 128), (255, 255, 255), (244, 177, 66)


def draw(size, safe):
    """safe — доля стороны, внутри которой лежит рисунок (для maskable нужна середина 80 %)."""
    S = 4 * size
    im = Image.new("RGB", (S, S), BLUE)
    d = ImageDraw.Draw(im)
    c = S / 2
    r = S * safe / 2
    # выработка: арка (тоннель)
    w = r * 1.5
    top = c - r * 0.78
    bot = c + r * 0.78
    d.pieslice([c - w / 2, top, c + w / 2, top + w], 180, 360, fill=DARK)
    d.rectangle([c - w / 2, top + w / 2, c + w / 2, bot], fill=DARK)
    d.arc([c - w / 2, top, c + w / 2, top + w], 180, 360, fill=WHITE, width=int(S * 0.028))
    d.line([c - w / 2, top + w / 2, c - w / 2, bot], fill=WHITE, width=int(S * 0.028))
    d.line([c + w / 2, top + w / 2, c + w / 2, bot], fill=WHITE, width=int(S * 0.028))
    # рельсы, сходящиеся к забою, и шпалы
    for k in range(4):
        t = k / 4
        y = bot - (bot - (top + w * 0.62)) * (1 - (1 - t) ** 2)
        half = (w * 0.30) * (1 - 0.72 * (1 - (1 - t) ** 2) / 1.0) + w * 0.03
        d.line([c - half * 1.6, y, c + half * 1.6, y], fill=AMBER, width=int(S * 0.022))
    d.line([c - w * 0.30, bot, c - w * 0.07, top + w * 0.62], fill=WHITE, width=int(S * 0.026))
    d.line([c + w * 0.30, bot, c + w * 0.07, top + w * 0.62], fill=WHITE, width=int(S * 0.026))
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    draw(192, 0.78).save(os.path.join(OUT, "icon-192.png"))
    draw(512, 0.78).save(os.path.join(OUT, "icon-512.png"))
    draw(512, 0.60).save(os.path.join(OUT, "icon-maskable-512.png"))
    draw(180, 0.70).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("значки:", OUT)


if __name__ == "__main__":
    main()
