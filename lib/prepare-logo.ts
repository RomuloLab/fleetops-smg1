import { MAX_LOGO_BYTES, type LogoFrame } from "./carrier-registration-model";
export type PreparedLogo = { url: string; width: number; height: number; frame: LogoFrame };
export async function prepareLogo(file: File): Promise<PreparedLogo> {
  if (!file.size || file.size > MAX_LOGO_BYTES) throw new Error("Selecione uma imagem de até 2 MB.");
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image(); picture.src = url; await picture.decode();
    const width = picture.naturalWidth, height = picture.naturalHeight;
    if (!width || !height || width > 8000 || height > 8000 || width * height > 24000000) throw new Error("A imagem deve ter até 8.000 pixels por lado.");
    const canvas = document.createElement("canvas"); const scale = Math.min(1,512 / Math.max(width,height));
    canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { url, width, height, frame: { x:0,y:0,width,height,background:"#ffffff" } };
    context.drawImage(picture,0,0,canvas.width,canvas.height);
    const data = context.getImageData(0,0,canvas.width,canvas.height).data;
    const corners = [0,canvas.width-1,(canvas.height-1)*canvas.width,canvas.width*canvas.height-1].map(at => Array.from(data.slice(at*4,at*4+4)));
    const transparent = corners.filter(pixel => pixel[3] < 24).length >= 3;
    const background = [0,1,2].map(channel => Math.round(corners.reduce((sum,pixel)=>sum+pixel[channel],0)/4));
    const color = transparent ? "#ffffff" : "#" + background.map(value=>value.toString(16).padStart(2,"0")).join("");
    const uniform = transparent || corners.every(pixel => background.every((value,channel)=>Math.abs(value-pixel[channel]) < 35));
    let frame: LogoFrame = { x:0,y:0,width,height,background:color };
    if (uniform) {
      let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
      for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
        const at=(y*canvas.width+x)*4;
        const foreground = data[at+3] > 24 && (transparent || background.some((value,channel)=>Math.abs(value-data[at+channel]) > 35));
        if(foreground){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
      }
      if(right>=left&&bottom>=top){
        const margin=Math.max(3,Math.ceil(Math.max(right-left+1,bottom-top+1)*0.055));
        const x=Math.max(0,Math.floor((left-margin)*width/canvas.width)); const y=Math.max(0,Math.floor((top-margin)*height/canvas.height));
        const endX=Math.min(width,Math.ceil((right+1+margin)*width/canvas.width)); const endY=Math.min(height,Math.ceil((bottom+1+margin)*height/canvas.height));
        frame={x,y,width:endX-x,height:endY-y,background:color};
      }
    }
    return {url,width,height,frame};
  } catch(cause) { URL.revokeObjectURL(url); throw cause instanceof Error ? cause : new Error("Não foi possível abrir a imagem."); }
}
