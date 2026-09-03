#!/usr/bin/env python3
"""Write tiny solid-color PNG launcher icons (no Pillow)."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORANGE = (245, 78, 0, 255)
BG = (20, 18, 11, 255)


def png_rgba(width: int, height: int, pixels: bytes) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + pixels[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def circle_icon(size: int) -> bytes:
    cx = cy = (size - 1) / 2
    r_out = size * 0.38
    r_in = size * 0.18
    rows = []
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            rows.append(bytes(ORANGE if r_in <= d <= r_out else BG))
    return png_rgba(size, size, b"".join(rows))


def main() -> None:
    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    res = ROOT / "app" / "src" / "main" / "res"
    for folder, size in sizes.items():
        dest = res / folder
        dest.mkdir(parents=True, exist_ok=True)
        data = circle_icon(size)
        (dest / "ic_launcher.png").write_bytes(data)
        (dest / "ic_launcher_round.png").write_bytes(data)
    print("icons written")


if __name__ == "__main__":
    main()
