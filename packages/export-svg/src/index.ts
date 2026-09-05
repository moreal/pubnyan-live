import { EASES } from '#ir/easing.ts';
import { interpolatePath } from '#ir/path.ts';
import { REST, groupTracks, resolvePath, sampleNumeric, sampleVec2, type TracksByProperty } from '#ir/sample.ts';
import { ATTRIBUTION } from '#ir/svg.ts';
import type { Clip, EaseName, Key, Rig, RigPart, Track, Vec2 } from '#ir/types.ts';

const fmt = (n: number) => String(Number(n.toFixed(4)));
const cssName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-');
const bezier = (e: EaseName) => `cubic-bezier(${EASES[e].join(', ')})`;

interface Stop {
  pct: number;
  decl: string;
  /** Ease of the segment ending at this stop. */
  ease?: EaseName;
}

function keyframes(id: string, stops: Stop[]): string {
  const frames = [...stops];
  if (frames[0].pct > 0) frames.unshift({ ...frames[0], pct: 0, ease: undefined });
  if (frames[frames.length - 1].pct < 100) frames.push({ ...frames[frames.length - 1], pct: 100, ease: undefined });
  const lines = frames.map((f, i) => {
    const next = frames[i + 1];
    const timing = next?.ease && next.ease !== 'linear' ? ` animation-timing-function: ${bezier(next.ease)};` : '';
    return `  ${fmt(f.pct)}% { ${f.decl};${timing} }`;
  });
  return `@keyframes ${id} {\n${lines.join('\n')}\n}`;
}

/** Same composition as ir/matrix.ts localMatrix(), so no reliance on transform-origin semantics for nested groups. */
const transformDecl = (pivot: Vec2, position: Vec2, rotation: number, sc: Vec2) =>
  `transform: translate(${fmt(position[0] + pivot[0])}px, ${fmt(position[1] + pivot[1])}px) rotate(${fmt(rotation)}deg) scale(${fmt(sc[0])}, ${fmt(sc[1])}) translate(${fmt(-pivot[0])}px, ${fmt(-pivot[1])}px)`;

function keyStops<V>(keys: Key<V>[], duration: number, decl: (v: V) => string): Stop[] {
  return keys.map((k) => ({ pct: (k.t / duration) * 100, decl: decl(k.v), ease: k.ease }));
}

function transformStops(part: RigPart, tracks: TracksByProperty, clip: Clip): Stop[] | null {
  const present = [tracks.position, tracks.rotation, tracks.scale].filter((t) => t !== undefined) as Track<
    'position' | 'rotation' | 'scale'
  >[];
  if (present.length === 0) return null;
  if (present.length === 1) {
    const only = present[0]!;
    if (only.property === 'position') return keyStops(only.keys as Key<Vec2>[], clip.duration, (v) => transformDecl(part.pivot, v, REST.rotation, REST.scale));
    if (only.property === 'rotation') return keyStops(only.keys as Key<number>[], clip.duration, (v) => transformDecl(part.pivot, REST.position, v, REST.scale));
    return keyStops(only.keys as Key<Vec2>[], clip.duration, (v) => transformDecl(part.pivot, REST.position, REST.rotation, v));
  }
  const frames = Math.max(1, Math.round(clip.duration * clip.fps));
  const stops: Stop[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * clip.duration;
    const position = tracks.position ? sampleVec2(tracks.position, t) : REST.position;
    const rotation = tracks.rotation ? sampleNumeric(tracks.rotation, t) : REST.rotation;
    const sc = tracks.scale ? sampleVec2(tracks.scale, t) : REST.scale;
    stops.push({ pct: (f / frames) * 100, decl: transformDecl(part.pivot, position, rotation, sc) });
  }
  return stops;
}

function shapeMarkup(rig: Rig, part: RigPart, track: Track<'shape'> | undefined, clip: Clip, timing: string, rules: string[]): string {
  const id = cssName(part.name);
  const path = (d: string, style = '') => `<path d="${d}" fill="${part.fill}"${style ? ` style="${style}"` : ''}/>`;
  if (!track) return part.path ? path(part.path) : '';
  const paths = track.keys.map((k) => resolvePath(rig, part, k.v));
  const morphable = paths.every((d, i) => i === 0 || (d !== null && paths[i - 1] !== null && interpolatePath(paths[i - 1]!, d, 0) !== null));
  if (morphable) {
    if (!paths[0]) return '';
    rules.push(keyframes(`${id}-s`, keyStops(track.keys, clip.duration, (v) => `d: path("${resolvePath(rig, part, v)}")`)));
    return path(paths[0]!, `animation: ${id}-s ${timing}`);
  }
  const expressions = [...new Set(track.keys.map((k) => k.v))];
  return expressions
    .map((expr) => {
      const d = resolvePath(rig, part, expr);
      if (!d) return '';
      const anim = `${id}-s-${cssName(expr)}`;
      rules.push(keyframes(anim, keyStops(track.keys, clip.duration, (v) => `opacity: ${v === expr ? 1 : 0}`)));
      return path(d, `animation: ${anim} ${timing}`);
    })
    .join('');
}

export function exportSvg(rig: Rig, clip: Clip): string {
  const byPart = groupTracks(clip);
  const children = new Map<string | undefined, RigPart[]>();
  for (const part of rig.parts) children.set(part.parent, [...(children.get(part.parent) ?? []), part]);
  const timing = `${fmt(clip.duration)}s linear ${clip.loop ? 'infinite' : '1 forwards'}`;
  const rules: string[] = [];

  const render = (part: RigPart): string => {
    const id = cssName(part.name);
    const tracks = byPart.get(part.name) ?? {};
    const anims: string[] = [];
    const tStops = transformStops(part, tracks, clip);
    if (tStops) {
      rules.push(keyframes(`${id}-t`, tStops));
      anims.push(`${id}-t ${timing}`);
    }
    let shape = shapeMarkup(rig, part, tracks.shape, clip, timing, rules);
    // The sampler gives a part the opacity of its OWN track; children do not inherit it,
    // so the opacity animation wraps the part's shapes alone and never the child groups.
    if (tracks.opacity) {
      rules.push(keyframes(`${id}-o`, keyStops(tracks.opacity.keys, clip.duration, (v) => `opacity: ${fmt(v)}`)));
      shape = `<g style="animation: ${id}-o ${timing}">${shape}</g>`;
    }
    const kids = (children.get(part.name) ?? []).map(render).join('');
    const style = ['transform-box: view-box', 'transform-origin: 0px 0px'];
    if (anims.length) style.push(`animation: ${anims.join(', ')}`);
    return `<g id="${id}" style="${style.join('; ')}">${shape}${kids}</g>`;
  };

  const body = (children.get(undefined) ?? []).map(render).join('\n');
  const { width, height } = rig.artboard;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${clip.name}</title>`,
    `<desc>${ATTRIBUTION}</desc>`,
    `<style>\n${rules.join('\n')}\n</style>`,
    body,
    `</svg>`,
  ].join('\n');
}
