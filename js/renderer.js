import {paintImages} from './images.js';
export class PdfRenderer {
  constructor(store){this.store=store;}
  async render(ref,canvas,maxWidth,maxHeight=Infinity,{images=true,scale:fixedScale=null}={}) {
    const page=await this.store.renderPage(ref);
    try{
    if(!canvas.isConnected)return;
    const rotation=((page.rotate+ref.rotation)%360+360)%360;
    const pageScale=ref.pageScale||1;
    const base=page.getViewport({scale:pageScale,rotation});
    const scale=(fixedScale??Math.min(maxWidth/base.width,maxHeight/base.height))*pageScale;
    const viewport=page.getViewport({scale,rotation});
    if(ref.mirrorX){viewport.transform[0]*=-1;viewport.transform[2]*=-1;viewport.transform[4]=viewport.width-viewport.transform[4];}
    if(ref.mirrorY){viewport.transform[1]*=-1;viewport.transform[3]*=-1;viewport.transform[5]=viewport.height-viewport.transform[5];}
    const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(16000000/(viewport.width*viewport.height)));
    canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
    canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;
    if(images)await paintImages(ref,canvas,viewport,ratio);
    return viewport;
    }finally{this.store.releaseRenderPage(page);}
  }
}
