#!/usr/bin/env python3
"""Build all Windsage store / OS / in-app image assets from brand masters."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BRAND = ASSETS / "brand"
STORE = ASSETS / "store"
UI = ASSETS / "ui"

NAVY = (6, 24, 33, 255)
NAVY_RGB = (6, 24, 33)
TEAL = (46, 196, 168, 255)
TEAL_DIM = (46, 196, 168, 90)
AMBER = (240, 160, 90, 255)
MIST = (231, 244, 247, 255)
MUTED = (139, 168, 178, 255)


def ensure_dirs() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    STORE.mkdir(parents=True, exist_ok=True)
    BRAND.mkdir(parents=True, exist_ok=True)


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def fill_rounded_icon(src: Image.Image, size: int = 1024) -> Image.Image:
    """Composite the generated rounded mark onto a full-bleed navy square."""
    base = Image.new("RGBA", (size, size), NAVY)
    img = src.copy()
    # Cover any transparent rounded corners with navy, then paste artwork.
    if img.size != (size, size):
        img = img.resize((size, size), Image.Resampling.LANCZOS)
    # Replace near-transparent pixels with navy so OS masks look clean.
    px = img.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            if a < 16:
                px[x, y] = NAVY
            elif a < 255:
                # Blend residual anti-alias onto navy
                t = a / 255.0
                px[x, y] = (
                    int(r * t + NAVY_RGB[0] * (1 - t)),
                    int(g * t + NAVY_RGB[1] * (1 - t)),
                    int(b * t + NAVY_RGB[2] * (1 - t)),
                    255,
                )
    base.alpha_composite(img)
    return base.convert("RGBA")


def punch_navy(mark: Image.Image) -> Image.Image:
    """Make near-navy pixels transparent so adaptive background shows through."""
    out = mark.convert("RGBA")
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if abs(r - NAVY_RGB[0]) < 18 and abs(g - NAVY_RGB[1]) < 18 and abs(b - NAVY_RGB[2]) < 18:
                px[x, y] = (0, 0, 0, 0)
    return out


def adaptive_foreground(icon: Image.Image, size: int = 1024) -> Image.Image:
    """Foreground with transparent margins; keep mark in Android safe zone (~66%).

    Expo / Android expect 1024×1024. Punch at source size, then one LANCZOS
    downscale into the safe zone (avoids the soft double-resize we had at 512).
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = punch_navy(icon)
    # Android keyline: important content inside ~66% of the canvas.
    safe = int(size * 0.66)
    if mark.size != (safe, safe):
        mark = mark.resize((safe, safe), Image.Resampling.LANCZOS)
    offset = (size - safe) // 2
    canvas.alpha_composite(mark, (offset, offset))
    return canvas


def monochrome_icon(fg: Image.Image, size: int = 1024) -> Image.Image:
    img = fg if fg.size == (size, size) else fg.resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    src = img.load()
    dst = out.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = src[x, y]
            if a < 20:
                continue
            luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
            alpha = int(min(255, a * (0.35 + luminance / 255.0)))
            dst[x, y] = (255, 255, 255, alpha)
    return out


def splash_from_hero(hero: Image.Image, width: int = 1284, height: int = 2778) -> Image.Image:
    """Cover-crop hero into portrait splash canvas."""
    target_ratio = width / height
    src_ratio = hero.width / hero.height
    if src_ratio > target_ratio:
        new_w = int(hero.height * target_ratio)
        left = (hero.width - new_w) // 2
        crop = hero.crop((left, 0, left + new_w, hero.height))
    else:
        new_h = int(hero.width / target_ratio)
        top = (hero.height - new_h) // 3  # bias upward sky
        crop = hero.crop((0, top, hero.width, top + new_h))
    return crop.resize((width, height), Image.Resampling.LANCZOS).convert("RGBA")


def empty_state_banner(hero: Image.Image, width: int = 1200, height: int = 720) -> Image.Image:
    target_ratio = width / height
    src_ratio = hero.width / hero.height
    if src_ratio > target_ratio:
        new_w = int(hero.height * target_ratio)
        left = (hero.width - new_w) // 2
        crop = hero.crop((left, 0, left + new_w, hero.height))
    else:
        new_h = int(hero.width / target_ratio)
        top = max(0, (hero.height - new_h) // 4)
        crop = hero.crop((0, top, hero.width, top + new_h))
    return crop.resize((width, height), Image.Resampling.LANCZOS).convert("RGBA")


def draw_metric_icon(kind: str, size: int = 256) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * 0.18
    cx = cy = size / 2

    if kind == "wind":
        for i, yoff in enumerate((-0.22, 0.0, 0.22)):
            y = cy + size * yoff
            start = pad
            end = size - pad - i * size * 0.04
            d.arc(
                [start, y - size * 0.08, end, y + size * 0.08],
                start=200,
                end=340,
                fill=TEAL,
                width=max(3, size // 28),
            )
        # tip
        d.polygon(
            [
                (size - pad, cy - size * 0.08),
                (size - pad * 0.55, cy),
                (size - pad, cy + size * 0.08),
            ],
            fill=AMBER,
        )
    elif kind == "gust":
        d.ellipse([pad, pad, size - pad, size - pad], outline=TEAL, width=max(3, size // 26))
        angle = math.radians(-35)
        r = size * 0.28
        d.line(
            [cx, cy, cx + r * math.cos(angle), cy + r * math.sin(angle)],
            fill=AMBER,
            width=max(4, size // 22),
        )
        d.ellipse([cx - size * 0.04, cy - size * 0.04, cx + size * 0.04, cy + size * 0.04], fill=MIST)
    elif kind == "temp":
        bulb_r = size * 0.16
        tube_w = size * 0.12
        top = pad
        bottom = size - pad - bulb_r
        d.rounded_rectangle(
            [cx - tube_w / 2, top, cx + tube_w / 2, bottom],
            radius=tube_w,
            outline=TEAL,
            width=max(3, size // 28),
        )
        d.ellipse(
            [cx - bulb_r, size - pad - bulb_r * 2, cx + bulb_r, size - pad],
            fill=AMBER,
            outline=TEAL,
            width=max(2, size // 40),
        )
        d.line([cx, bottom - size * 0.08, cx, top + size * 0.18], fill=AMBER, width=max(3, size // 30))
    elif kind == "wave":
        for i, yoff in enumerate((0.05, 0.22, 0.39)):
            y = pad + size * yoff
            points = []
            for x in range(int(pad), int(size - pad) + 1, 4):
                wave = math.sin((x / size) * math.pi * 2 + i) * size * 0.05
                points.append((x, y + wave))
            if len(points) > 1:
                d.line(points, fill=TEAL if i < 2 else MUTED, width=max(3, size // 28), joint="curve")
    elif kind == "check":
        d.ellipse([pad, pad, size - pad, size - pad], outline=TEAL, width=max(3, size // 24))
        d.line(
            [
                (size * 0.30, size * 0.52),
                (size * 0.45, size * 0.68),
                (size * 0.72, size * 0.36),
            ],
            fill=TEAL,
            width=max(4, size // 20),
            joint="curve",
        )
    elif kind == "bell":
        d.arc([pad * 1.2, pad, size - pad * 1.2, size - pad * 1.4], 200, -20, fill=TEAL, width=max(3, size // 24))
        d.ellipse(
            [cx - size * 0.06, size - pad * 1.15, cx + size * 0.06, size - pad * 0.75],
            fill=AMBER,
        )
        d.rounded_rectangle(
            [cx - size * 0.08, pad * 0.85, cx + size * 0.08, pad * 1.25],
            radius=size * 0.04,
            fill=TEAL,
        )
    elif kind == "station":
        d.line([cx, pad, cx, size - pad], fill=TEAL, width=max(3, size // 28))
        d.ellipse([cx - size * 0.12, pad, cx + size * 0.12, pad + size * 0.24], outline=TEAL, width=max(3, size // 30))
        d.polygon(
            [
                (cx, pad + size * 0.08),
                (cx + size * 0.28, pad + size * 0.02),
                (cx + size * 0.28, pad + size * 0.14),
            ],
            fill=AMBER,
        )
        d.rectangle([cx - size * 0.16, size - pad * 1.2, cx + size * 0.16, size - pad], fill=MUTED)
    return img


def notification_icon(icon: Image.Image, size: int = 96) -> Image.Image:
    """White silhouette on transparent for Android status bar."""
    small = adaptive_foreground(icon, 256).resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s = small.load()
    d = out.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = s[x, y]
            if a > 20:
                d[x, y] = (255, 255, 255, a)
    return out


def main() -> None:
    ensure_dirs()
    master = load_rgba(BRAND / "icon-master.png")
    hero = load_rgba(BRAND / "hero.png")

    icon = fill_rounded_icon(master, 1024)
    icon.convert("RGB").save(STORE / "icon.png", optimize=True)
    print("wrote store/icon.png")

    # Splash logo mark (transparent) for expo splash logo
    splash_logo = adaptive_foreground(icon, 1024)
    splash_logo.save(STORE / "splash-icon.png", optimize=True)
    print("wrote store/splash-icon.png")

    splash = splash_from_hero(hero)
    splash.convert("RGB").save(STORE / "splash.jpg", quality=78, optimize=True)
    print("wrote store/splash.jpg")

    banner = empty_state_banner(hero)
    banner.save(UI / "empty-hero.png", optimize=True)
    print("wrote ui/empty-hero.png")

    # Compact brand mark for in-app header / boot (@3x needs ≥384; keep 1024)
    mark = adaptive_foreground(icon, 1024)
    mark.save(UI / "mark.png", optimize=True)
    print("wrote ui/mark.png")

    # Android adaptive layers — Expo recommends 1024; 512 looked soft on xxhdpi+
    fg = adaptive_foreground(icon, 1024)
    fg.save(STORE / "android-icon-foreground.png", optimize=True)
    Image.new("RGBA", (1024, 1024), NAVY).save(STORE / "android-icon-background.png", optimize=True)
    monochrome_icon(fg, 1024).save(STORE / "android-icon-monochrome.png", optimize=True)
    print("wrote store android adaptive icons (1024)")

    # Web favicon + PWA / Add to Home Screen (Chrome needs 192 + 512)
    public = ROOT / "public"
    public.mkdir(parents=True, exist_ok=True)
    fav192 = icon.resize((192, 192), Image.Resampling.LANCZOS).convert("RGBA")
    fav192.save(STORE / "favicon.png", optimize=True)
    pwa192 = icon.resize((192, 192), Image.Resampling.LANCZOS).convert("RGBA")
    pwa512 = icon.resize((512, 512), Image.Resampling.LANCZOS).convert("RGBA")
    apple = icon.resize((180, 180), Image.Resampling.LANCZOS).convert("RGBA")
    pwa192.save(STORE / "pwa-192.png", optimize=True)
    pwa512.save(STORE / "pwa-512.png", optimize=True)
    apple.save(STORE / "apple-touch-icon.png", optimize=True)
    pwa192.save(public / "icon-192.png", optimize=True)
    pwa512.save(public / "icon-512.png", optimize=True)
    apple.save(public / "apple-touch-icon.png", optimize=True)
    fav192.save(public / "favicon.png", optimize=True)
    (public / "manifest.webmanifest").write_text(
        "{\n"
        '  "name": "Windsage",\n'
        '  "short_name": "Windsage",\n'
        '  "description": "Watch Windguru stations from the Wald cloud",\n'
        '  "start_url": "/",\n'
        '  "display": "standalone",\n'
        '  "background_color": "#061821",\n'
        '  "theme_color": "#061821",\n'
        '  "icons": [\n'
        '    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },\n'
        '    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }\n'
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    notification_icon(icon, 96).save(STORE / "notification-icon.png", optimize=True)
    print("wrote store/web favicon + PWA icons")

    for kind in ("wind", "gust", "temp", "wave", "check", "bell", "station"):
        draw_metric_icon(kind, 256).save(UI / f"{kind}.png", optimize=True)
    print("wrote ui metric icons")

    # Boot / loading tile
    boot = Image.new("RGBA", (1024, 1024), NAVY)
    logo = mark.resize((560, 560), Image.Resampling.LANCZOS)
    boot.alpha_composite(logo, ((1024 - 560) // 2, (1024 - 560) // 2))
    boot.save(UI / "boot-mark.png", optimize=True)
    print("done")


if __name__ == "__main__":
    main()
