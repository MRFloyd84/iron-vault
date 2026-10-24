"""Prepare the user's new recordings. Optional argument: upload directory.
Without it, rebuild from the retained original MP3s in assets-src/audio.
"""
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'public/audio'
SRC = Path(__file__).resolve().parents[1] / 'assets-src/audio'
RATE = 48000
SOURCES = {
    'neuro-calibration-original.mp3': 'industrial_control_p_#3-1788351868344.mp3',
    'parking-lock-original.mp3': 'electrical_contactor_#2-1788351767599.mp3',
    'coolant-leak-original.mp3': 'industrial_coolant_p_#1-1788351704002.mp3',
}
if len(sys.argv) > 1:
    for name, source in SOURCES.items():
        shutil.copyfile(Path(sys.argv[1]) / source, SRC / name)

def read(name):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(SRC / name),
                                   '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-'])
    return np.frombuffer(raw, dtype='<f4').copy()

def loop(samples, seconds):
    n = round(seconds * RATE)
    phase = np.linspace(0, np.pi / 2, n, endpoint=False)
    seam = samples[-n:] * np.cos(phase) + samples[:n] * np.sin(phase)
    return np.concatenate([samples[n:-n], seam])

def save(name, samples, peak):
    # These MP3 decoders produce peaks above full scale; allow encoding headroom.
    samples = samples * (peak / max(float(np.max(np.abs(samples))), 1e-6))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE),
                    '-ac', '1', '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '5',
                    str(OUT / name)], input=samples.astype('<f4').tobytes(), check=True)
    print(name, round(len(samples) / RATE, 3), 'seconds')

calibration = read('neuro-calibration-original.mp3')
save('neuro-calibration-loop.ogg', loop(calibration, .2), .55)
lock = read('parking-lock-original.mp3')[round(.68 * RATE):round(1.68 * RATE)]
n = round(.003 * RATE)
lock[:n] *= np.linspace(0, 1, n)
lock[-n:] *= np.linspace(1, 0, n)
save('parking-lock-latch.ogg', lock, .72)
leak = read('coolant-leak-original.mp3')[round(.25 * RATE):round(4.55 * RATE)]
save('coolant-leak-loop.ogg', loop(leak, .3), .65)
