#!/usr/bin/env python3
"""Bulk-pin audit: does each imported pin land where the source says it should?

The bulk collections (hidden packages, meteorites, stunt jumps, knife flights) carry GTABase
coordinates we never checked individually. This script puts each pin's exact pixel on the basemap
and asks two questions:

  1. what colour is under the crosshair — open water, beach, grass, or built-up ground?
  2. how far is the nearest dry/paved pixel?

For the pins that come out "water" the description in the source marker is what decides whether
that is right (wrecks, dive sites, underwater facilities, boats) or wrong (a pin that should be on
a jetty). The script prints those descriptions next to the measurement; it never moves a pin.

Requires Pillow (`pip install pillow`). Tiles are fetched from the GTABase CDN and cached in
/tmp/g6tiles, so repeat runs are offline.

  python3 tools/audit-bulk-pins.py classes            # colour screen over every bulk pin
  python3 tools/audit-bulk-pins.py sample             # the 30-pin stratified sample (seeded)
  python3 tools/audit-bulk-pins.py sheets OUTDIR      # contact sheets: sample + all jumps
"""
import argparse
import colorsys
import json
import os
import random
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw, ImageFont

BASE = "https://cdn.jsdelivr.net/gh/rolux/gtadb.org@main/maps/tiles/6/day"
CACHE = "/tmp/g6tiles"
SEED = 20261127
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
DATA = os.path.join(ROOT, "sites", "gta6", "data")

os.makedirs(CACHE, exist_ok=True)
COLL = json.load(open(os.path.join(DATA, "collections.json")))["collections"]
MARKERS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                                      "gtabase-markers.json")))
MARKERS = MARKERS["markers"] if isinstance(MARKERS, dict) else MARKERS
BY_ID = {m["id"]: m for m in MARKERS}


def level_px(x, y, L):
    """Pixel of a world coordinate. Level 5 is 1 px/m, level 6 is 2 px/m."""
    s = 2 ** (L - 5)
    return (x + 16384) * s, (16384 - y) * s


def tile_path(L, ty, tx):
    return os.path.join(CACHE, f"{L}_{ty}_{tx}.jpg")


def fetch_tile(L, ty, tx):
    p = tile_path(L, ty, tx)
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return p
    url = f"{BASE}/{L}/{L},{ty},{tx}.jpg"
    for _ in range(3):
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                data = r.read()
        except Exception:
            continue
        if len(data) > 1000:
            open(p, "wb").write(data)
            return p
    return None


def prefetch(pins, L):
    tiles = set()
    for pin in pins:
        px, py = level_px(pin["position"]["x"], pin["position"]["y"], L)
        tx, ty = int(px // 256), int(py // 256)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                tiles.add((ty + dy, tx + dx))
    with ThreadPoolExecutor(max_workers=12) as ex:
        got = sum(1 for r in ex.map(lambda t: fetch_tile(L, t[0], t[1]), sorted(tiles)) if r)
    return len(tiles), got


def crop(pin, L, size):
    """`size` px around the pin, or None when a tile is missing."""
    px, py = level_px(pin["position"]["x"], pin["position"]["y"], L)
    tx, ty = int(px // 256), int(py // 256)
    canvas = Image.new("RGB", (768, 768), (10, 12, 16))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            p = tile_path(L, ty + dy, tx + dx)
            if not os.path.exists(p):
                continue
            try:
                canvas.paste(Image.open(p).convert("RGB"), ((dx + 1) * 256, (dy + 1) * 256))
            except Exception:
                continue
    cx, cy = px - (tx - 1) * 256, py - (ty - 1) * 256
    left, top = cx - size // 2, cy - size // 2
    if left < 0 or top < 0 or left + size > 768 or top + size > 768:
        return None
    return canvas.crop((left, top, left + size, top + size))


def colour_at(pin, L, r=4):
    im = crop(pin, L, 40)
    if im is None:
        return None
    box = im.crop((20 - r, 20 - r, 20 + r + 1, 20 + r + 1))
    px = list(box.getdata())
    return tuple(sum(c[i] for c in px) / len(px) for i in range(3))


def classify(rgb):
    if rgb is None:
        return "no-tile"
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in rgb])
    h *= 360
    if 175 <= h <= 225 and s >= 0.35 and v >= 0.30:
        return "water"
    if 35 <= h <= 70 and s >= 0.25 and v >= 0.55:
        return "sand"
    if 70 < h <= 160 and s >= 0.18:
        return "green"
    if s < 0.16 and v >= 0.55:
        return "built"
    if s < 0.22 and v < 0.45:
        return "dark"
    return "land"


def nearest_dry(pin, L=5, maxm=100, step=2):
    """Metres from the pin to the closest non-water pixel, None if beyond `maxm`."""
    im = crop(pin, L, 2 * maxm + 2)
    if im is None:
        return None
    w, h = im.size
    cx, cy = w // 2, h // 2
    best = float("inf")
    for yy in range(0, h, step):
        for xx in range(0, w, step):
            if classify(im.getpixel((xx, yy))) != "water":
                best = min(best, ((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5)
    return None if best == float("inf") else round(best)


def stratified(pins, n):
    """Proportional sample by region, seeded so the same pins come out every time."""
    by_region = {}
    for p in pins:
        by_region.setdefault(p["region"], []).append(p)
    total = len(pins)
    quota = {r: len(v) * n / total for r, v in by_region.items()}
    take = {r: int(q) for r, q in quota.items()}
    order = sorted(quota, key=lambda r: quota[r] - int(quota[r]), reverse=True)
    i = 0
    while sum(take.values()) < n and order:
        reg = order[i % len(order)]
        if take[reg] < len(by_region[reg]):
            take[reg] += 1
        i += 1
        if i > 4 * len(order):
            break
    rng = random.Random(SEED)
    out = []
    for reg, k in take.items():
        out.extend(rng.sample(sorted(by_region[reg], key=lambda p: p["id"]), k))
    return sorted(out, key=lambda p: p["id"])


def sample_pins():
    """13 packages, 10 meteorites, 7 knife flights — the 30 the audit reads cell by cell."""
    return (stratified([p for p in COLL if p["category"] == "hidden-package"], 13)
            + stratified([p for p in COLL if p["category"] == "meteorite"], 10)
            + stratified([p for p in COLL if p["category"] == "knife-flight"], 7))


def sheet(pins, path, cols=8, cell=220, title=""):
    label = 30
    pad = 6
    rows = (len(pins) + cols - 1) // cols
    W = cols * (cell + pad) + pad
    H = 34 + rows * (cell + label + pad)
    img = Image.new("RGB", (W, H), (8, 10, 14))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=13)
        big = ImageFont.load_default(size=17)
    except Exception:
        font = big = ImageFont.load_default()
    d.text((pad, 8), title, fill=(230, 236, 244), font=big)
    for i, pin in enumerate(pins):
        r, c = divmod(i, cols)
        x0, y0 = pad + c * (cell + pad), 34 + r * (cell + label + pad)
        view = crop(pin, 6, cell)
        if view is None:
            d.rectangle([x0, y0, x0 + cell, y0 + cell], outline=(90, 40, 40))
            d.text((x0 + 6, y0 + 6), "no tile", fill=(200, 120, 120), font=font)
        else:
            img.paste(view, (x0, y0))
        mx, my = x0 + cell // 2, y0 + cell // 2
        d.line([mx - 9, my, mx + 9, my], fill=(255, 48, 72), width=2)
        d.line([mx, my - 9, mx, my + 9], fill=(255, 48, 72), width=2)
        d.ellipse([mx - 4, my - 4, mx + 4, my + 4], outline=(255, 48, 72), width=2)
        d.text((x0 + 2, y0 + cell + 2), f'{i+1}. {pin["id"].replace("gb-", "")}',
               fill=(200, 210, 224), font=font)
        d.text((x0 + 2, y0 + cell + 15), f'{pin["position"]["x"]:.0f}, {pin["position"]["y"]:.0f}',
               fill=(140, 152, 166), font=font)
    img.save(path)
    return path


def cmd_classes(args):
    pins = COLL[: args.limit] if args.limit else COLL
    n, got = prefetch(pins, 5)
    print(f"tiles {got}/{n}")
    counts = {}
    for pin in pins:
        rgb = colour_at(pin, 5)
        cls = classify(rgb)
        counts[(pin["category"], cls)] = counts.get((pin["category"], cls), 0) + 1
        if cls == "water":
            dry = nearest_dry(pin)
            desc = (BY_ID.get(pin["_gb"]["id"], {}).get("description") or "(none)").replace("\n", " ")
            where = ">100 m" if dry is None else f"{dry} m"
            print(f'  water {pin["id"]:26s} dry {where:>7}  {desc[:110]}')
    for (cat, cls), k in sorted(counts.items()):
        print(f"  {cat:14s} {cls:10s} {k:4d}")


def cmd_sample(args):
    pins = sample_pins()
    out = dict(
        method="proportional by region within each collection, seeded; 13 packages, 10 meteorites, "
               "7 knife flights",
        seed=SEED,
        captured="2026-11-27",
        pins=[dict(id=p["id"], region=p["region"],
                   x=p["position"]["x"], y=p["position"]["y"]) for p in pins],
    )
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "bulk-audit-sample.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"{len(pins)} pins → {os.path.relpath(path, ROOT)}")


def cmd_sheets(args):
    os.makedirs(args.outdir, exist_ok=True)
    sample = sample_pins()
    sample.sort(key=lambda p: (p["category"], p["id"]))
    jumps = [p for p in COLL if p["category"] == "stunt-jump"]
    prefetch(sample, 6)
    prefetch(jumps, 6)
    print(sheet(sample, os.path.join(args.outdir, "bulk-sample.png"), cols=6,
                title="Sample: 13 packages, 10 meteorites, 7 knife flights (110 m per cell)"))
    for i in range(0, len(jumps), 44):
        chunk = jumps[i:i + 44]
        print(sheet(chunk, os.path.join(args.outdir, f"bulk-jumps-{i // 44 + 1}.png"), cols=8,
                    title=f"Stunt jumps {i + 1}-{i + len(chunk)} of {len(jumps)} (110 m per cell)"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("classes", help="colour screen over the bulk pins")
    c.add_argument("--limit", type=int)
    c.set_defaults(fn=cmd_classes)
    s = sub.add_parser("sample", help="write the seeded 30-pin sample")
    s.set_defaults(fn=cmd_sample)
    sh = sub.add_parser("sheets", help="contact sheets for the sample and every stunt jump")
    sh.add_argument("outdir")
    sh.set_defaults(fn=cmd_sheets)
    args = ap.parse_args()
    if not os.path.exists(os.path.join(DATA, "collections.json")):
        sys.exit("run from the repo root")
    args.fn(args)


if __name__ == "__main__":
    main()
