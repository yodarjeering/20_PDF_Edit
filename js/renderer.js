export class PdfRenderer {
  constructor(store){this.store=store;}
  async render(ref,canvas,maxWidth,maxHeight=Infinity) {
    const page=await this.store.page(ref);
    if(!canvas.isConnected)return;
    const rotation=((page.rotate+ref.rotation)%360+360)%360;
    const base=page.getViewport({scale:1,rotation});
    const scale=Math.min(maxWidth/base.width,maxHeight/base.height);
    const viewport=page.getViewport({scale,rotation});
    const ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
    canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;
    return viewport;
  }
}
