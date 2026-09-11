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

/** Segment gates preserve per-segment morphing even when another key is null or incompatible. */
function segmentedShapes(rig: Rig, part: RigPart, tr: Track<'shape'>, clip: Clip, timing: string, rules: string[], clipping: boolean): string {
  const prefix = `${cssName(part.name)}-${clipping ? 'aperture' : 'segments'}`;
  const paths: string[] = [];
  const pct = (t: number) => String(Number((t / clip.duration * 100).toFixed(10)));
  const gateTiming = `${fmt(clip.duration)}s steps(1, end) ${clip.loop ? 'infinite' : '1 forwards'}`;
  const emit = (d: string | null, start: number, end: number, morph?: [Key<string>, Key<string>], opacity?: [number, number], ease?: EaseName) => {
    if (!d || end <= start || start > clip.duration) return;
    const id = `${prefix}-${paths.length}`;
    const gates = [`0% { visibility: ${start <= 0 ? 'visible' : 'hidden'}; }`];
    if (start > 0) gates.push(`${pct(start)}% { visibility: visible; }`);
    if (end < clip.duration) gates.push(`${pct(end)}% { visibility: hidden; }`);
    gates.push(`100% { visibility: ${end <= clip.duration ? 'hidden' : 'visible'}; }`);
    rules.push(`@keyframes ${id}-gate { ${gates.join(' ')} }`);
    const animations = [`${id}-gate ${gateTiming}`];
    if (morph) {
      rules.push(keyframes(`${id}-shape`, keyStops(morph, clip.duration, v => `d: path("${resolvePath(rig, part, v)}")`)));
      animations.push(`${id}-shape ${timing}`);
    }
    if (opacity) {
      rules.push(keyframes(`${id}-opacity`, keyStops([{t:start,v:opacity[0]}, {t:end,v:opacity[1],ease}], clip.duration, v => `opacity: ${v}`)));
      animations.push(`${id}-opacity ${timing}`);
    }
    paths.push(`<path d="${d}" fill="${part.fill}" style="animation: ${animations.join(', ')}"/>`);
  };
  const first = tr.keys[0]!;
  emit(resolvePath(rig, part, first.v), 0, first.t);
  for (let i = 0; i + 1 < tr.keys.length; i++) {
    const from = tr.keys[i]!, to = tr.keys[i + 1]!;
    const a = resolvePath(rig, part, from.v), b = resolvePath(rig, part, to.v);
    if (a && b && interpolatePath(a, b, 0) !== null) {
      emit(a, from.t, to.t, [from, to]);
    } else {
      emit(a, from.t, to.t, undefined, clipping ? undefined : [1, 0], to.ease);
      // Native targets also use a sub-frame activation epsilon at discontinuities.
      emit(b, from.t + (clipping ? 1e-7 : 0), to.t, undefined, clipping ? undefined : [0, 1], to.ease);
    }
  }
  const last = tr.keys[tr.keys.length - 1]!;
  emit(resolvePath(rig, part, last.v), last.t, clip.duration + 1);
  return paths.join('');
}

function shapeMarkup(rig: Rig, part: RigPart, track: Track<'shape'> | undefined, clip: Clip, timing: string, rules: string[], clipping = false): string {
  const id = cssName(part.name) + (clipping ? '-clip' : '');
  const path = (d: string, style = '') => `<path d="${d}" fill="${part.fill}"${style ? ` style="${style}"` : ''}/>`;
  if (!track) return part.path ? path(part.path) : '';
  const paths = track.keys.map((k) => resolvePath(rig, part, k.v));
  if (clipping) return segmentedShapes(rig, part, track, clip, timing, rules, true);
  const morphable = paths.every((d, i) => i === 0 || (d !== null && paths[i - 1] !== null && interpolatePath(paths[i - 1]!, d, 0) !== null));
  if (morphable) {
    if (!paths[0]) return '';
    rules.push(keyframes(`${id}-s`, keyStops(track.keys, clip.duration, (v) => `d: path("${resolvePath(rig, part, v)}")`)));
    return path(paths[0]!, `animation: ${id}-s ${timing}`);
  }
  if (paths.some((d, i) => i > 0 && d && paths[i - 1] && d !== paths[i - 1] && interpolatePath(paths[i - 1]!, d, 0) !== null)) {
    return segmentedShapes(rig, part, track, clip, timing, rules, false);
  }
  const expressions = [...new Set(track.keys.map((k) => k.v))];
  return expressions
    .map((expr) => {
      const d = resolvePath(rig, part, expr);
      if (!d) return '';
      const anim = `${id}-s-${cssName(expr)}`;
      rules.push(keyframes(anim, keyStops(track.keys, clip.duration, (v) => clipping
        ? `visibility: ${v === expr ? 'visible' : 'hidden'}`
        : `opacity: ${v === expr ? 1 : 0}`)));
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
  const definitions = new Map<string, string>();
  const aperture = (name: string): string => {
    const id = `aperture-${cssName(name)}`;
    if (definitions.has(name)) return id;
    const source = rig.parts.find(p => p.name === name)!;
    const tracks = byPart.get(name) ?? {};
    const stops = transformStops(source, tracks, clip);
    const styles = ['transform-box: view-box', 'transform-origin: 0px 0px'];
    if (stops) {
      const animation = `${cssName(name)}-clip-t`;
      rules.push(keyframes(animation, stops));
      styles.push(`animation: ${animation} ${timing}`);
    }
    const paths = shapeMarkup(rig, source, tracks.shape, clip, timing, rules, true);
    // clipPath uses geometry, not source paint opacity. Visibility selects the
    // union of active contours during an incompatible source crossfade.
    definitions.set(name, `<clipPath id="${id}" clipPathUnits="userSpaceOnUse" style="${styles.join('; ')}">${paths}</clipPath>`);
    return id;
  };

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
      // Each crossfading contour is a separate sampled drawing. Multiply its
      // opacity before compositing overlaps, not after flattening the group.
      shape = shape.replace(/<path\b[^>]*\/>/g, path => `<g style="animation: ${id}-o ${timing}">${path}</g>`);
    }
    const kids = (children.get(part.name) ?? []).map(render).join('');
    const style = ['transform-box: view-box', 'transform-origin: 0px 0px'];
    if (anims.length) style.push(`animation: ${anims.join(', ')}`);
    if (part.clipTo !== undefined) {
      // Clip in the common parent's coordinates, before the pupil's own motion.
      // A separate transformed child group preserves the own-drawing-only rule.
      const mask = aperture(part.clipTo);
      const drawing = `<g style="${style.join('; ')}">${shape}</g>`;
      const descendants = kids ? `<g style="${style.join('; ')}">${kids}</g>` : '';
      return `<g id="${id}"><g clip-path="url(#${mask})">${drawing}</g>${descendants}</g>`;
    }
    return `<g id="${id}" style="${style.join('; ')}">${shape}${kids}</g>`;
  };

  const body = (children.get(undefined) ?? []).map(render).join('\n');
  const { width, height } = rig.artboard;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${clip.name}</title>`,
    `<desc>${ATTRIBUTION}</desc>`,
    `<style>\n${rules.join('\n')}\n</style>`,
    ...(definitions.size ? [`<defs>${[...definitions.values()].join('')}</defs>`] : []),
    body,
    `</svg>`,
  ].join('\n');
}
