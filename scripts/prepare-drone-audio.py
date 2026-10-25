"""Bereitet die Drohnengeräusche (von Rene mit ElevenLabs erzeugt) auf.

Eingang (unverändert aufbewahrt in assets-src/audio/drone):
  hover-loop.mp3   Rotoren im Schwebeflug, Dauerton (7,5 s)
  spinup.mp3       Motoren laufen hoch (2,5 s)
  spindown.mp3     Motoren laufen aus (1,7 s)
  release.mp3      Verriegelung der Halterung öffnet (1,7 s)
  dock.mp3         Kufen setzen auf, Klauen schließen (1,7 s)
  mark.mp3         Laser-Zielmarkierung rastet ein (0,9 s)
  static-loop.mp3  Funkrauschen der Bildverbindung (3,3 s)

Ausgang (public/audio): Mono-OGG, Stille am Anfang entfernt, weich ausgeblendet, auf
gleiche Lautheit gebracht. Dauertöne werden nahtlose Schleifen (Ende über den Anfang
geblendet).

Aufruf: python scripts/prepare-drone-audio.py
Benötigt: Python 3 mit numpy, ffmpeg im PATH.
"""
from pathlib import Path
import json
import hashlib
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets-src/audio/drone'
OUT = ROOT / 'public/audio'
RATE = 48000

# Ziel: (Quelle, Ziel-RMS in dBFS, Ausblendung in s oder 'loop')
FILES = {
    'drone-hover-loop.ogg': ('hover-loop.mp3', -22, 'loop'),
    'drone-spinup.ogg': ('spinup.mp3', -24, 0.12),
    'drone-spindown.ogg': ('spindown.mp3', -24, 0.5),
    'drone-release.ogg': ('release.mp3', -22, 0.4),
    'drone-dock.ogg': ('dock.mp3', -21, 0.4),
    'drone-mark.ogg': ('mark.mp3', -22, 0.12),
    'drone-static-loop.ogg': ('static-loop.mp3', -26, 'loop'),
}


def read(name):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(SRC / name),
                                   '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-'])
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def save(name, s, rms_db, source):
    s = s - s.mean()
    rms = float(np.sqrt(np.mean(s ** 2)))
    s = s * 10 ** (rms_db / 20) / max(rms, 1e-9)
    peak = float(np.max(np.abs(s)))
    if peak > 0.9:  # Spitzen begrenzen statt übersteuern
        s *= 0.9 / peak
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1',
                    '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '4', str(OUT / name)],
                   input=s.astype('<f4').tobytes(), check=True)
    info = {
        'file': name,
        'source': 'assets-src/audio/drone/' + source,
        'source_sha256': hashlib.sha256((SRC / source).read_bytes()).hexdigest(),
        'duration_seconds': round(len(s) / RATE, 3),
        'peak': round(float(np.max(np.abs(s))), 4),
        'rms_dbfs': round(float(20 * np.log10(max(float(np.sqrt(np.mean(s ** 2))), 1e-9))), 2),
    }
    print(info)
    return info


def trim(s, fade_out, threshold_db=-45):
    """Stille am Anfang und Ende weg, 5 ms Ein-, weiche Ausblendung am Ende."""
    level = 10 ** (threshold_db / 20) * np.max(np.abs(s))
    loud = np.nonzero(np.abs(s) > level)[0]
    start = max(0, int(loud[0]) - int(0.005 * RATE))
    end = min(len(s), int(loud[-1]) + int(0.02 * RATE))
    s = s[start:end].copy()
    n_in, n_out = int(0.005 * RATE), min(int(fade_out * RATE), len(s) // 2)
    s[:n_in] *= np.linspace(0, 1, n_in)
    s[-n_out:] *= np.linspace(1, 0, n_out) ** 2
    return s


def loop(s, xfade=0.5):
    # Kurze Ränder (Ein-/Ausschwingen der Aufnahme) abschneiden, dann Ende über den Anfang.
    s = s[int(0.05 * RATE):-int(0.05 * RATE)]
    n = int(xfade * RATE)
    t = np.linspace(0, np.pi / 2, n, endpoint=False)
    body = s[:-n].copy()
    body[:n] = body[:n] * np.sin(t) + s[-n:] * np.cos(t)
    return body


if __name__ == '__main__':
    infos = []
    for name, (source, rms_db, fade) in FILES.items():
        s = read(source)
        infos.append(save(name, loop(s) if fade == 'loop' else trim(s, fade), rms_db, source))
    (OUT / 'drone-sources.json').write_text(json.dumps(
        {'origin': 'Von Rene mit ElevenLabs Sound Effects erzeugt (Prompts in AENDERUNGEN_v60_1.md).',
         'files': infos}, indent=2, ensure_ascii=False) + '\n')
