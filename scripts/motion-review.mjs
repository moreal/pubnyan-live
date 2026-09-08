import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { clips, getRig } from '../motion/index.ts';
import { exportSvg } from '../packages/export-svg/src/index.ts';

// Optional snapshot directory contains SVGs captured before an editing session.
// The output embeds both versions, so the review stays usable without a server.
const baseline = process.argv[2] ? resolve(process.argv[2]) : undefined;
const selected = clips.filter(c => c.rig === 'pubnyan');
const entries = await Promise.all(selected.map(async c => {
  const rig = getRig(c.rig);
  let before = baseline ? await readFile(join(baseline, `${c.name}.svg`), 'utf8').catch(() => null) : null;
  // Center an older unpadded canvas in the new gutters, keeping artwork at the
  // same pixel scale in both panes. Only the review copy is changed.
  if (before) {
    const box = before.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
    if (box?.length === 4) {
      const { width, height } = rig.artboard;
      before = before.replace(/viewBox="[^"]+"/, `viewBox="${box[0] - (width - box[2]) / 2} ${box[1] - (height - box[3]) / 2} ${width} ${height}"`)
        .replace(/width="[^"]+"/, `width="${width}"`).replace(/height="[^"]+"/, `height="${height}"`);
    }
  }
  return { name: c.name, duration: c.duration, after: exportSvg(rig, c), before };
}));
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pubnyan · Motion review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f6f2;color:#242522;font:16px system-ui,sans-serif;padding:32px;max-width:1100px;margin:auto}h1{font-size:28px;margin:0 0 8px}p{line-height:1.6;color:#60635b}.controls{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:24px 0}button,select{font:inherit;min-height:44px;padding:8px 14px;border:1px solid #bfc4b8;border-radius:8px;background:white;color:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #376b45;outline-offset:3px}.frames{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;background:white;border:1px solid #e2e4dc;border-radius:16px;overflow:hidden}figcaption{padding:16px 20px;font-weight:600}iframe{display:block;width:100%;aspect-ratio:406/351;border:0}.timeline{display:flex;align-items:center;gap:16px;margin:24px 0}input{flex:1;min-width:100px;min-height:44px;accent-color:#376b45}output{font-variant-numeric:tabular-nums;width:110px}small{color:#60635b}@media(max-width:600px){body{padding:20px}.frames{grid-template-columns:1fr}}
</style><h1>Pubnyan · Motion review</h1><p>시선이 먼저, 고개가 다음. 준비 동작과 멈춤, 귀의 여운을 비교해 보세요.</p>
<div class="controls"><label for="clip">동작</label><select id="clip"></select><button id="play" type="button">재생</button><button id="reset" type="button">처음으로</button><label for="rate">속도</label><select id="rate"><option value="1">1×</option><option value="0.5">0.5×</option><option value="0.25">0.25×</option></select></div>
<div class="frames"><figure id="old"><figcaption>수정 전</figcaption><iframe id="before" title="수정 전 애니메이션"></iframe></figure><figure><figcaption>폴리싱 후</figcaption><iframe id="after" title="폴리싱 후 애니메이션"></iframe></figure></div>
<div class="timeline"><label for="time">프레임</label><input id="time" type="range" min="0" step="0.001" value="0"><output id="clock">0.00 s</output></div><p>재생 버튼으로 시작합니다. 슬라이더로 정확한 포즈를 확인할 수 있습니다. 한 동작이 끝나면 잠깐 쉬고 다시 재생합니다.</p><small>pubnyan artwork © Bak Eunji · CC BY-SA 4.0</small>
<script>
const entries=${JSON.stringify(entries).replace(/</g, '\\u003c')};
const $=id=>document.getElementById(id),iframes=[$('before'),$('after')];let playing=false,t=0,last=0;
for(const entry of entries){const option=document.createElement('option');option.value=entry.name;option.textContent=entry.name;$('clip').append(option);}
function entry(){return entries.find(e=>e.name===$('clip').value)}
function paint(){const poseTime=Math.min(t,entry().duration);for(const frame of iframes)for(const a of frame.contentDocument?.getAnimations()??[]){a.pause();a.currentTime=poseTime*1000;}$('time').value=poseTime;$('clock').textContent=poseTime.toFixed(2)+' s';}
function pause(){playing=false;$('play').textContent='재생'}
function load(){pause();t=0;const e=entry();$('time').max=e.duration;$('old').hidden=!e.before;document.querySelector('.frames').style.gridTemplateColumns=e.before?'':'1fr';for(const [i,frame]of iframes.entries()){frame.onload=paint;frame.srcdoc='<style>html,body{margin:0;overflow:hidden}svg{display:block;width:100%;height:auto}*,svg *{animation-play-state:paused!important}</style>'+(i===0?(e.before??''):e.after);}paint();}
$('clip').onchange=load;$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'일시 정지':'재생';last=performance.now()};$('reset').onclick=()=>{pause();t=0;paint()};$('time').oninput=()=>{pause();t=Number($('time').value);paint()};
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
function tick(now){if(playing){t+=(now-last)/1000*Number($('rate').value);if(t>entry().duration+0.65)t=0;paint()}last=now;requestAnimationFrame(tick)}load();requestAnimationFrame(tick);
</script></html>`;
const out = resolve('dist/verify');
await mkdir(out,{recursive:true});
await writeFile(join(out,'polish-review.html'),html);
console.log('dist/verify/polish-review.html');
