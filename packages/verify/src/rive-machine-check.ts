import { readFile } from 'node:fs/promises';
import type { Rig } from '#ir/types.ts';
import type { Renderer } from '#render/renderer.ts';

export interface RiveMachineStep {
  expression?: number;
  trigger?: string;
  seconds: number;
}

/** Drive real inputs and advance deterministically, including layered reactions.
 * This exercises the state graph, not just its individual animations or input names.
 */
export async function renderRiveStateSequence(renderer: Renderer, rig: Rig, bytes: Buffer, steps: RiveMachineStep[]): Promise<Buffer[]> {
  const root = new URL('../../../node_modules/@rive-app/canvas/', import.meta.url);
  const script = await readFile(new URL('rive.js', root), 'utf8');
  const wasm = 'data:application/wasm;base64,' + (await readFile(new URL('rive.wasm', root))).toString('base64');
  const result = await renderer.evaluate<string[]>(`
    <canvas id="c" width="${rig.artboard.width}" height="${rig.artboard.height}"></canvas>
    <script>${script}</script><script>
    window.__done=false; window.__error=undefined;
    (async()=>{try {
      rive.RuntimeLoader.setWasmUrl(${JSON.stringify(wasm)});
      const runtime=await rive.RuntimeLoader.awaitInstance();
      const file=await runtime.load(Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)));
      const board=file.artboardByName(${JSON.stringify(rig.name)});
      const sm=new runtime.StateMachineInstance(board.stateMachineByName('main'),board);
      const inputs=new Map(Array.from({length:sm.inputCount()},(_,i)=>{const input=sm.input(i);return [input.name,input];}));
      const canvas=document.getElementById('c'), painter=runtime.makeRenderer(canvas);
      const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;
      const context=output.getContext('2d'), frames=[];
      sm.advanceAndApply(0);board.advance(0);
      for(const step of ${JSON.stringify(steps)}) {
        if(step.expression!==undefined) inputs.get('expression').asNumber().value=step.expression;
        if(step.trigger) inputs.get(step.trigger).asTrigger().fire();
        sm.advanceAndApply(0);board.advance(0);
        const count=Math.max(1,Math.ceil(step.seconds*120));
        for(let i=0;i<count;i++){sm.advanceAndApply(step.seconds/count);board.advance(step.seconds/count);}
        painter.clear();board.draw(painter);runtime.resolveAnimationFrame();
        context.fillStyle='#fff';context.fillRect(0,0,output.width,output.height);context.drawImage(canvas,0,0);
        frames.push(output.toDataURL('image/png').split(',')[1]);
      }
      painter.delete();sm.delete();board.delete();file.delete();
      window.__result=frames;window.__done=true;
    }catch(error){window.__error=String(error);}})();</script>`);
  return result.map((base64) => Buffer.from(base64, 'base64'));
}
