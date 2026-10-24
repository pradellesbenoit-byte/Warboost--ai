import sharp from "sharp";

// Generated geometry only: no Last War artwork, player data or image metadata.
// These fixtures exercise image transport, masking and crop/slot association,
// not the ability of a live Vision model to identify a real hero.
export async function syntheticFormationPng({width=1008,height=2244,palette="aircraft"}={}){
  const colors=palette==="tank"
    ? ["#40b080","#80a030","#c06040","#7040c0","#40a0c0"]
    : ["#c04080","#4080c0","#b0a040","#40c080","#8040c0"];
  const tops=[.484,.548,.609,.670,.732];
  const rows=tops.map((top,index)=>{
    const y=Math.round(height*top),h=Math.round(height*.054);
    const portrait=`<rect x="${Math.round(width*.105)}" y="${y}" width="${Math.round(width*.118)}" height="${h}" fill="${colors[index]}"/>`;
    const gear=Array.from({length:4},(_,slot)=>`<rect x="${Math.round(width*(.230+slot*.120))}" y="${y}" width="${Math.round(width*.107)}" height="${h}" fill="${colors[(index+slot)%5]}"/>`).join("");
    return portrait+gear;
  }).join("");
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#142030"/>${rows}</svg>`);
  return sharp(svg).png().toBuffer();
}
