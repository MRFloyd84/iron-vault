// Directly shade the existing canvas. source-atop preserves HUD transparency.
export function drawDisplaySurface(c:CanvasRenderingContext2D,seconds:number,reducedMotion=false,index=0,overlay=false){
 const w=c.canvas.width,h=c.canvas.height,spacing=Math.max(6,Math.round(h/52));
 c.save();c.setTransform(1,0,0,1,0,0);c.shadowBlur=0;c.globalAlpha=1;
 c.globalCompositeOperation=overlay?'source-over':'source-atop';c.fillStyle='rgba(0,0,0,0.26)';
 for(let y=0;y<h;y+=spacing)c.fillRect(0,y,w,Math.max(1,Math.round(spacing*.24)));
 if(!reducedMotion){
  const phase=index*2.39996323;
  c.fillStyle='rgba(0,0,0,'+(.018+.014*Math.sin(seconds*7+phase)+.004*Math.sin(seconds*13+phase))+')';c.fillRect(0,0,w,h);
  const band=Math.max(6,h*.10),y=((seconds*.12+index*.13)%1)*(h+band)-band;
  c.fillStyle='rgba(0,0,0,0.055)';c.fillRect(0,y,w,band);
 }
 c.restore();
}
