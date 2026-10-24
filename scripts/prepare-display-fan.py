"""Prepare a continuous fan loop. Requires FFmpeg; no Python packages."""
import argparse
from array import array
import json
import math
from pathlib import Path
import subprocess
import sys

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path)
parser.add_argument('output',type=Path)
parser.add_argument('--overlap',type=float,default=1.2)
args=parser.parse_args()
rate,channels=48000,2
def decode(path):
 data=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-acodec','pcm_f32le','-ar',str(rate),'-ac',str(channels),'-'])
 samples=array('f');samples.frombytes(data)
 if sys.byteorder!='little':samples.byteswap()
 return samples
x=decode(args.source)
frames=len(x)//channels;overlap=round(args.overlap*rate)
if not 0<overlap<frames//3:raise SystemExit('Overlap must be positive and shorter than a third of the recording.')
dc=[math.fsum(x[c::channels])/frames for c in range(channels)]
for i in range(len(x)):x[i]-=dc[i%channels]
# Rotate around the overlapping head/tail. Both edges then meet naturally:
# middle -> tail/head blend -> middle, without a fade-to-silence at the seam.
y=x[overlap*channels:(frames-overlap)*channels]
for frame in range(overlap):
 theta=frame/(overlap-1)*math.pi/2;a,b=math.cos(theta),math.sin(theta)
 for c in range(channels):y.append(x[(frames-overlap+frame)*channels+c]*a+x[frame*channels+c]*b)
# Place the encoded file boundary near a shared zero crossing. This reduces
# edge transients introduced by encoding a finite representation of the loop.
cut=min(range(1,len(y)//channels),key=lambda f:max(abs(y[f*channels+c]) for c in range(channels))+.25*max(abs(y[f*channels+c]-y[(f-1)*channels+c]) for c in range(channels)))
y=y[cut*channels:]+y[:cut*channels]
encoded=array('f',y)
if sys.byteorder!='little':encoded.byteswap()
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(rate),'-ac',str(channels),'-i','pipe:0','-c:a','libvorbis','-q:a','5',str(args.output)],input=encoded.tobytes(),check=True)
z=decode(args.output);outframes=len(z)//channels
if outframes!=frames-overlap:raise SystemExit('Encoded loop sample count changed unexpectedly.')
step=math.sqrt(math.fsum((z[c]-z[-channels+c])**2 for c in range(channels))/channels)
internal=math.sqrt(math.fsum((z[i]-z[i-channels])**2 for i in range(channels,len(z)))/(len(z)-channels))
def rms(samples):return math.sqrt(math.fsum(s*s for s in samples)/len(samples))
window=round(.05*rate)*channels
levels=[20*math.log10(max(1e-12,rms(z[i:i+window]))) for i in range(0,len(z)-window+1,window)]
peak=max(abs(v) for v in z)
if peak>=1:raise SystemExit('Clipping in loop.')
if step>internal*4:raise SystemExit('Unexpectedly large discontinuity at encoded loop boundary.')
report={'source_seconds':frames/rate,'loop_seconds':outframes/rate,'overlap_seconds':args.overlap,'rotation_seconds':cut/rate,'file_bytes':args.output.stat().st_size,'peak':peak,'seam_step_rms':step,'ordinary_step_rms':internal,'seam_step_ratio':step/internal,'rms_dbfs':20*math.log10(rms(z)),'minimum_50ms_rms_dbfs':min(levels),'maximum_50ms_rms_dbfs':max(levels)}
print(json.dumps(report,indent=2))
