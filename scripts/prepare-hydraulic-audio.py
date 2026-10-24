"""Bereitet die Hydraulik-Aufnahmen (mit ElevenLabs erzeugt) für das Gehen auf.

Eingang (unverändert aufbewahrt in assets-src/audio/hydraulics):
  extend-a…c.mp3   Zylinder fährt aus      (je 1,03 s)
  retract-a…c.mp3  Zylinder fährt ein      (je 1,03 s)
  vent-a…c.mp3     Druckablass beim Abheben (je 0,72 s)
  settle-a…c.mp3   Ventil schließt, Federn beim Aufsetzen (je 0,84 s)
  creak-a…d.mp3    Knarzendes Gelenk       (je 1,51 s)
  pump-a/b.mp3     Hydraulikpumpe, Dauerton (je 7,51 s)

Ausgang (public/audio): Mono-OGG, Stille am Anfang entfernt, weich ausgeblendet,
auf gleiche Lautheit gebracht (Pegel je Gruppe unten). Die Pumpe wird zu einer
nahtlosen Schleife (Ende über den Anfang geblendet).

Aufruf: python scripts/prepare-hydraulic-audio.py
Benötigt: Python 3 mit numpy, ffmpeg im PATH.
"""
from pathlib import Path
import json
import hashlib
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets-src/audio/hydraulics'
OUT = ROOT / 'public/audio'
RATE = 48000

# Gruppe: (Quellen, Ziel-RMS in dBFS, Ausblendung in s)
GROUPS = {
    'extend': ('abc', -21, 0.35),
    'retract': ('abc', -21, 0.3),
    'vent': ('abc', -22, 0.3),
    'settle': ('abc', -19, 0.35),
    'creak': ('abcd', -23, 0.4),
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
        'source': 'assets-src/audio/hydraulics/' + source,
        'source_sha256': hashlib.sha256((SRC / source).read_bytes()).hexdigest(),
        'duration_seconds': round(len(s) / RATE, 3),
        'peak': round(float(np.max(np.abs(s))), 4),
        'rms_dbfs': round(float(20 * np.log10(max(float(np.sqrt(np.mean(s ** 2))), 1e-9))), 2),
    }
    print(info)
    return info


def trim(s, fade_out, threshold_db=-45):
    """Stille am Anfang weg (5 ms Vorlauf), 5 ms Ein-, weiche Ausblendung am Ende."""
    level = 10 ** (threshold_db / 20) * np.max(np.abs(s))
    start = max(0, int(np.argmax(np.abs(s) > level)) - int(0.005 * RATE))
    s = s[start:].copy()
    n_in, n_out = int(0.005 * RATE), min(int(fade_out * RATE), len(s) // 2)
    s[:n_in] *= np.linspace(0, 1, n_in)
    s[-n_out:] *= np.linspace(1, 0, n_out) ** 2
    return s


def loop(s, xfade=0.6):
    n = int(xfade * RATE)
    t = np.linspace(0, np.pi / 2, n, endpoint=False)
    body = s[:-n].copy()
    body[:n] = body[:n] * np.sin(t) + s[-n:] * np.cos(t)
    return body


if __name__ == '__main__':
    infos = []
    for group, (letters, rms_db, fade_out) in GROUPS.items():
        for i, letter in enumerate(letters, 1):
            source = f'{group}-{letter}.mp3'
            infos.append(save(f'hyd-{group}-{i}.ogg', trim(read(source), fade_out), rms_db, source))
    # Pumpe: beide Aufnahmen hintereinander (mit Überblendung) ergeben 14 s ohne
    # hörbare Wiederholung, danach Ende über den Anfang.
    a, b = read('pump-a.mp3'), read('pump-b.mp3')
    a *= np.sqrt(np.mean(b ** 2)) / np.sqrt(np.mean(a ** 2))
    n = int(0.6 * RATE)
    t = np.linspace(0, np.pi / 2, n, endpoint=False)
    joined = np.concatenate([a[:-n], a[-n:] * np.cos(t) + b[:n] * np.sin(t), b[n:]])
    info = save('hyd-pump-loop.ogg', loop(joined), -26, 'pump-a.mp3')
    info['source'] += ' + pump-b.mp3'
    info['source_sha256'] += ' ' + hashlib.sha256((SRC / 'pump-b.mp3').read_bytes()).hexdigest()
    infos.append(info)
    (OUT / 'hydraulic-sources.json').write_text(json.dumps(
        {'origin': 'Von Rene mit ElevenLabs Sound Effects erzeugt (Prompts in AENDERUNGEN_v56.md).',
         'files': infos}, indent=2, ensure_ascii=False) + '\n')
