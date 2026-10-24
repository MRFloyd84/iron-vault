"""Bereitet die Regen- und Donneraufnahmen für den Regenmodus auf.

Eingang (unverändert aufbewahrt in assets-src/audio):
  rain-original.mp3     "Gentle rain falling #2", 2,42 s, Stereo 48 kHz
  thunder-original.mp3  "thunder #4", 11,04 s, Stereo 48 kHz, zwei Donnerschläge

Ausgang (public/audio):
  rain-loop.ogg    16 s nahtlose Schleife. Die kurze Aufnahme wird in vier versetzten
                   Lagen aus zufällig gewählten, weich überblendeten Stücken
                   geschichtet, damit man die 2,4-s-Wiederholung nicht heraushört.
  thunder-1.ogg    erster, fernerer Donner (0,0–5,0 s), ausgeblendet
  thunder-2.ogg    zweiter, schwerer Donner (5,9–11,04 s), ausgeblendet

Aufruf: python scripts/prepare-rain-audio.py
Benötigt: Python 3 mit numpy, ffmpeg im PATH.
"""
from pathlib import Path
import json
import hashlib
import subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets-src/audio'
OUT = ROOT / 'public/audio'
RATE = 48000


def read(name):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(SRC / name),
                                   '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()


def save(name, samples, peak=None, rms_db=None):
    s = samples - samples.mean(axis=0)
    if rms_db is not None:
        rms = float(np.sqrt(np.mean(s ** 2)))
        s *= 10 ** (rms_db / 20) / max(rms, 1e-9)
    if peak is not None:
        s *= peak / max(float(np.max(np.abs(s))), 1e-9)
    s = np.clip(s, -0.98, 0.98)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '2',
                    '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '5', str(OUT / name)],
                   input=s.astype('<f4').tobytes(), check=True)
    info = {
        'file': name,
        'duration_seconds': round(len(s) / RATE, 3),
        'peak': round(float(np.max(np.abs(s))), 4),
        'rms_dbfs': round(20 * np.log10(max(float(np.sqrt(np.mean(s ** 2))), 1e-9)), 2),
    }
    print(info)
    return info


def fade(n):
    t = np.linspace(0, np.pi / 2, n, endpoint=False)
    return np.sin(t)[:, None], np.cos(t)[:, None]


def rain_loop(src, seconds=16.0, layers=4, chunk=1.6, xfade=0.4, seed=7):
    rng = np.random.default_rng(seed)
    total = int(seconds * RATE)
    n_chunk, n_x = int(chunk * RATE), int(xfade * RATE)
    fin, fout = fade(n_x)
    out = np.zeros((total + n_chunk, 2), dtype=np.float64)
    for layer in range(layers):
        pos = -int(rng.uniform(0, chunk) * RATE)  # versetzter Start je Lage
        while pos < total:
            start = int(rng.uniform(0, len(src) - n_chunk))
            piece = src[start:start + n_chunk].astype(np.float64) * rng.uniform(0.8, 1.15)
            if rng.random() < 0.5:
                piece = piece[:, ::-1]  # Kanäle tauschen: andere Raumposition
            piece[:n_x] *= fin
            piece[-n_x:] *= fout
            a, b = max(pos, 0), pos + n_chunk
            out[a:b] += piece[a - pos:]
            pos += n_chunk - n_x
    out = out[:total + n_x]
    # Nahtstelle: Ende über den Anfang blenden (gleiche Leistung).
    head, tail = out[:n_x].copy(), out[total:total + n_x]
    out = out[:total]
    out[:n_x] = head * fin + tail * fout
    return out


def cut(src, start, end, fade_in=0.02, fade_out=1.2):
    s = src[int(start * RATE):int(end * RATE)].astype(np.float64)
    n_in, n_out = int(fade_in * RATE), int(fade_out * RATE)
    s[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    s[-n_out:] *= (np.linspace(1, 0, n_out) ** 2)[:, None]
    return s


if __name__ == '__main__':
    rain = read('rain-original.mp3')
    thunder = read('thunder-original.mp3')
    infos = [
        save('rain-loop.ogg', rain_loop(rain), rms_db=-24),
        save('thunder-1.ogg', cut(thunder, 0.0, 5.0), peak=0.7),
        save('thunder-2.ogg', cut(thunder, 5.9, 11.04, fade_out=1.8), peak=0.9),
    ]
    for info, source in zip(infos, ['rain-original.mp3', 'thunder-original.mp3', 'thunder-original.mp3']):
        info['source'] = source
        info['source_sha256'] = hashlib.sha256((SRC / source).read_bytes()).hexdigest()
    (OUT / 'weather-sources.json').write_text(json.dumps(infos, indent=2) + '\n')
