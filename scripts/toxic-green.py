"""Färbt die Grüntöne der Displays giftgrün (einmalig angewendet in v53).

Alle Hex- und rgba-Farben mit grünem Farbton (75°–165°) in den Display-Dateien
bekommen einen einheitlichen Farbton von 96° (gelbstichiges Neongrün) und mehr
Sättigung; die Helligkeit bleibt, damit Lesbarkeit und Kontraste erhalten bleiben.
Amber/Rot (Warnungen) und Grautöne bleiben unverändert.
"""
import colorsys, re, sys, pathlib

FILES = ['lib/instruments.ts', 'lib/service-instruments.ts', 'lib/mobility-instruments.ts',
         'lib/display-boot.ts', 'lib/surround-cameras.ts', 'lib/weapon-hud.ts', 'lib/display-aging.ts']
HUE = 96 / 360

def shift(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.08 or not (75 / 360 <= h <= 165 / 360):
        return None
    s = min(1.0, s * 1.55 + 0.18)
    r2, g2, b2 = colorsys.hls_to_rgb(HUE, l, s)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)

def hexrep(m):
    v = m.group(1)
    r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    out = shift(r, g, b)
    return m.group(0) if out is None else "'#%02x%02x%02x'" % out

def rgbarep(m):
    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    out = shift(r, g, b)
    return m.group(0) if out is None else 'rgba(%d,%d,%d,' % out

changed = 0
for f in FILES:
    p = pathlib.Path(f)
    s = p.read_text()
    t = re.sub(r"'#([0-9a-fA-F]{6})'", hexrep, s)
    t = re.sub(r"rgba\((\d+),\s*(\d+),\s*(\d+),", rgbarep, t)
    if t != s:
        changed += 1
        p.write_text(t)
        print('angepasst:', f)
print(changed, 'Dateien')
