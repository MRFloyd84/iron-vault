"""Prepare the user's door and step recordings; optional original upload directory."""
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'public/audio'
RATE = 48000
SOURCES = {
    'hangar-door-original.mp3': 'freesound_community-big-garage-door-opening-43959.mp3',
    'mech-step-original.mp3': 'freesound_community-mech_step_001-87175.mp3',
}
if len(sys.argv) > 1:
    for name, source in SOURCES.items():
        shutil.copyfile(Path(sys.argv[1]) / source, OUT / name)

def read(name):
    return np.frombuffer(subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(OUT / name),
        '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-']), dtype='<f4').copy()

def save(name, samples, peak):
    samples *= peak / max(float(np.max(np.abs(samples))), 1e-6)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE),
        '-ac', '1', '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '5', str(OUT / name)],
        input=samples.astype('<f4').tobytes(), check=True)
    print(name, round(len(samples) / RATE, 3), 'seconds')

# Keep the steady motor section. A crossfade avoids a hard seam during travel.
door = read('hangar-door-original.mp3')[round(.4 * RATE):round(8.4 * RATE)]
n = round(.35 * RATE)
phase = np.linspace(0, np.pi / 2, n, endpoint=False)
seam = door[-n:] * np.cos(phase) + door[:n] * np.sin(phase)
save('hangar-door-loop.ogg', np.concatenate([door[n:-n], seam]), .65)

# Remove the quiet lead-in and inaudible end, retaining the impact and its tail.
step = read('mech-step-original.mp3')[round(.035 * RATE):round(1.32 * RATE)]
n = round(.003 * RATE)
step[:n] *= np.linspace(0, 1, n)
step[-round(.04 * RATE):] *= np.linspace(1, 0, round(.04 * RATE))
save('mech-step.ogg', step, .65)
