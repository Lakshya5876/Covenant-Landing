"""Slices the avatar sheet into 30 uniform tile PNGs.

Approach: the sheet is a real 6x5 grid — 30 rounded-square character cards on
a pure black canvas, each with decorative shapes that sometimes bleed toward
its own cell's edge but never crosses into a neighbor's (there's a genuine
black gutter between every tile on both axes). That makes axis projection
the right tool, not blob/connected-component detection: summing the
non-black mask along each axis finds exactly 6 column bands and 5 row bands
— the real, measured content extent of each column/row — separated by real
gutters. A prior version used connected-component blobs and merged/split
guesswork for touching tiles; it produced wildly inconsistent crop sizes
(210-269px wide, 170-209px tall across the 30 tiles) and let a sliver of
black canvas margin ride along in some crops, which showed up as visible
gray/black bleed once the images render inside circular avatar frames.

This version:
  1. Finds the 6 column bands and 5 row bands from the real pixel data.
  2. Crops each of the 30 cells to the *intersection* of its row and column
     band — tight to that tile's actual content, no black margin, and
     structurally incapable of pulling in a neighbor's content (bands are
     disjoint by construction).
  3. Resizes every crop with a cover-style scale-then-center-crop to one
     exact target size, so all 30 outputs are pixel-identical in dimensions
     (true uniformity) with no stretching distortion.

Run: python scripts/slice_avatars.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "assets" / "avatar-sheet.png"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "avatars"
COLS = 6
ROWS = 5
EXPECTED_COUNT = COLS * ROWS
BLACK_THRESH = 24
BAND_MIN_PIXELS = 3  # ignore antialiasing specks when detecting band edges
TARGET = 240  # every output tile is exactly TARGET x TARGET


def find_bands(profile: np.ndarray, thresh: int) -> list[tuple[int, int]]:
    bands: list[tuple[int, int]] = []
    in_band = False
    start = 0
    for i, v in enumerate(profile):
        if v > thresh and not in_band:
            in_band, start = True, i
        elif v <= thresh and in_band:
            in_band = False
            bands.append((start, i))
    if in_band:
        bands.append((start, len(profile)))
    return bands


def cover_crop(im: Image.Image, size: int) -> Image.Image:
    """Scale so the shorter side == size, then center-crop the rest — the
    same semantics as CSS object-fit: cover, baked into the file so every
    tile is identical on disk instead of relying on runtime CSS to hide
    size variance."""
    w, h = im.size
    scale = size / min(w, h)
    nw, nh = round(w * scale), round(h * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - size) // 2
    top = (nh - size) // 2
    return im.crop((left, top, left + size, top + size))


def main() -> None:
    if not SRC.exists():
        print(f"Source sheet not found: {SRC}", file=sys.stderr)
        sys.exit(1)

    img = Image.open(SRC).convert("RGB")
    arr = np.array(img)
    h, w, _ = arr.shape

    mask = ~((arr[:, :, 0] < BLACK_THRESH) & (arr[:, :, 1] < BLACK_THRESH) & (arr[:, :, 2] < BLACK_THRESH))
    col_bands = find_bands(mask.sum(axis=0), BAND_MIN_PIXELS)
    row_bands = find_bands(mask.sum(axis=1), BAND_MIN_PIXELS)

    print(f"Detected {len(col_bands)} column bands, {len(row_bands)} row bands (want {COLS}x{ROWS}).")
    if len(col_bands) != COLS or len(row_bands) != ROWS:
        print("Grid detection did not find a clean 6x5 layout — inspect the source sheet before proceeding.", file=sys.stderr)
        for b in col_bands:
            print("  col band", b, "width", b[1] - b[0])
        for b in row_bands:
            print("  row band", b, "height", b[1] - b[0])
        sys.exit(1)

    col_widths = [b[1] - b[0] for b in col_bands]
    row_heights = [b[1] - b[0] for b in row_bands]
    print(f"Column widths: {col_widths} (range {min(col_widths)}-{max(col_widths)})")
    print(f"Row heights: {row_heights} (range {min(row_heights)}-{max(row_heights)})")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    sizes_written = set()
    for r, (ry0, ry1) in enumerate(row_bands):
        for c, (cx0, cx1) in enumerate(col_bands):
            count += 1
            tile = img.crop((cx0, ry0, cx1, ry1))
            tile = cover_crop(tile, TARGET)
            sizes_written.add(tile.size)
            out_path = OUT_DIR / f"avatar-{count:02d}.png"
            tile.save(out_path)

    print(f"Wrote {count} tiles to {OUT_DIR}")
    print(f"Output sizes present: {sizes_written} (should be exactly one size)")
    if count != EXPECTED_COUNT:
        print(f"WARNING: expected {EXPECTED_COUNT} tiles, wrote {count}.", file=sys.stderr)
        sys.exit(1)
    if len(sizes_written) != 1:
        print("WARNING: output tiles are not uniform in size.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
