"""Draws the app icons from fnnzhrn's logo (src/app/icon.svg: a green rising line on a dark tile).

Run from mobile/: python3 scripts/make-icons.py  (needs ImageMagick's `magick`).
Drawn with ImageMagick primitives because its SVG renderer drops the line's stroke.
"""
import subprocess

# The logo on its 64x64 grid, as in src/app/icon.svg.
LINE = [(10, 46), (22, 34), (31, 40), (44, 24), (54, 16)]
AREA = LINE + [(54, 54), (10, 54)]
DARK, GREEN, K = "#0b0d0c", "#3ddc84", 16  # K: 64 grid units -> 1024 px


def place(points, scale, centre_y):
    """Scales the mark around the middle, moving its own centre (y=centre_y) there."""
    return [(32 + (x - 32) * scale, 32 + (y - centre_y) * scale) for x, y in points]


def coords(points):
    return " ".join(f"{x * K:.1f},{y * K:.1f}" for x, y in points)


def draw(out, *, scale=1.0, centre_y=32, background=None, tile=False, area=True, color=GREEN):
    cmd = ["magick", "-size", "1024x1024", "xc:" + (background if background and not tile else "none")]
    if tile:
        cmd += ["-fill", DARK, "-draw", f"roundrectangle 0,0 1023,1023 {14 * K},{14 * K}"]
    if area:
        cmd += ["-fill", color + "2e", "-stroke", "none", "-draw", "polygon " + coords(place(AREA, scale, centre_y))]
    cmd += ["-fill", "none", "-stroke", color, "-strokewidth", str(5 * K * scale),
            "-draw", "stroke-linecap round stroke-linejoin round polyline " + coords(place(LINE, scale, centre_y)), out]
    subprocess.run(cmd, check=True)


# iOS: full-bleed and opaque; iOS rounds the corners.
draw("assets/images/icon.png", background=DARK)
subprocess.run(["magick", "assets/images/icon.png", "-alpha", "off", "assets/images/icon.png"], check=True)
# Android adaptive icon: the mark inside the safe zone; the background colour is in app.json.
draw("assets/images/android-icon-foreground.png", scale=0.62, centre_y=35)
draw("assets/images/android-icon-monochrome.png", scale=0.62, centre_y=35, area=False, color="#ffffff")
# Splash and favicon: the website's rounded tile.
draw("assets/images/splash-icon.png", tile=True)
subprocess.run(["magick", "assets/images/splash-icon.png", "-resize", "48x48", "assets/images/favicon.png"], check=True)
