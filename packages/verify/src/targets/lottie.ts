import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportLottie } from '#export-lottie/index.ts';
import type { Target } from '#verify/parity.ts';

const LOTTIE_WEB = new URL('../../../../node_modules/lottie-web/build/player/lottie.min.js', import.meta.url).pathname;

export const lottieTarget: Target = {
  name: 'lottie',
  async export(rig, clip, outDir) {
    await mkdir(outDir, { recursive: true });
    const file = join(outDir, `${clip.name}.json`);
    await writeFile(file, JSON.stringify(exportLottie(rig, clip), null, 2));
    return [file];
  },
  async renderFrame(renderer, rig, clip, t) {
    const script = await readFile(LOTTIE_WEB, 'utf8');
    const data = exportLottie(rig, clip);
    // Requesting exactly the layer's out-point frame (t === clip.duration) renders blank in
    // lottie-web, so clamp a hair short of it; the last frame is visually identical anyway.
    const frame = Math.min(t * clip.fps, data.op - 0.01);
    const html = [
      `<div id="lottie" style="width:${rig.artboard.width}px;height:${rig.artboard.height}px;"></div>`,
      `<script>${script}</script>`,
      `<script>`,
      `  window.__anim = lottie.loadAnimation({`,
      `    container: document.getElementById('lottie'),`,
      `    renderer: 'svg',`,
      `    loop: false,`,
      `    autoplay: false,`,
      `    animationData: ${JSON.stringify(data)},`,
      `  });`,
      `  window.__anim.goToAndStop(${frame}, true);`,
      `</script>`,
    ].join('\n');
    return renderer.renderHtml(html, rig.artboard.width, rig.artboard.height);
  },
};
