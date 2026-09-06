import type { Renderer } from '#render/renderer.ts';

const img = (png: Buffer) => `<img src="data:image/png;base64,${png.toString('base64')}" style="width:160px;height:auto;display:block;border:1px solid #ddd">`;

/** One row per source (reference first), one column per sampled time. */
export function contactSheet(renderer: Renderer, times: number[], rows: { label: string; frames: Buffer[] }[]): Promise<Buffer> {
  const head = `<tr><th></th>${times.map((t) => `<th style="font:12px sans-serif">${t}s</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => `<tr><th style="font:12px sans-serif;text-align:left;padding-right:8px">${r.label}</th>${r.frames.map((f) => `<td>${img(f)}</td>`).join('')}</tr>`)
    .join('');
  return renderer.renderPage(`<table style="border-collapse:collapse;padding:8px">${head}${body}</table>`, 200 + times.length * 170);
}
