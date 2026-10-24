"""Prepare the three user recordings; usage: python scripts/prepare-service-audio.py UPLOAD_DIR.
Original MP3s are retained unchanged alongside the derived browser assets.
"""
from pathlib import Path
import sys,subprocess,tempfile,shutil
import numpy as np
SOURCE={
 'coolant-pump-original.mp3':'industrial_coolant_p_#1-1788349039851.mp3',
 'contactor-original.mp3':'electrical_contactor_#3-1788349136908.mp3',
 'service-warning-original.mp3':'industrial_control_p_#4-1788349208831.mp3',
}
root=Path(sys.argv[1]);out=Path(__file__).resolve().parents[1]/'public/audio';rate=48000
for name,source in SOURCE.items():shutil.copyfile(root/source,out/name)
def read(name):
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(out/name),'-f','f32le','-ar',str(rate),'-ac','1','-'])
 return np.frombuffer(raw,dtype='<f4').copy()
def loop(a,fade):
 n=round(rate*fade);t=np.linspace(0,1,n,endpoint=False)
 # Crossfade final and initial samples at the seam, keeping RMS level stable.
 cross=a[-n:]*np.cos(t*np.pi/2)+a[:n]*np.sin(t*np.pi/2)
 return np.concatenate([a[n:-n],cross])
def edges(a,duration=.003):
 n=min(round(rate*duration),len(a)//2);a=a.copy();a[:n]*=np.linspace(0,1,n);a[-n:]*=np.linspace(1,0,n);return a
def save(name,a,peak):
 a=a*(peak/max(float(np.max(np.abs(a))),1e-6))
 subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(rate),'-ac','1','-i','pipe:0','-c:a','libvorbis','-q:a','5',str(out/name)],input=a.astype('<f4').tobytes(),check=True)
 print(name,round(len(a)/rate,3),'s')
pump=read('coolant-pump-original.mp3');save('coolant-pump-loop.ogg',loop(pump[int(.4*rate):int(5.5*rate)],.3),.65)
contactor=read('contactor-original.mp3')
save('contactor-on.ogg',edges(contactor[int(.075*rate):int(.5*rate)]),.7)
save('contactor-off.ogg',edges(contactor[int(.665*rate):int(1.12*rate)]),.7)
warning=edges(read('service-warning-original.mp3'),.025)
save('service-warning-loop.ogg',np.concatenate([warning,np.zeros(2*rate)]),.5)
