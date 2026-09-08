import { track } from '#ir/clip.ts';
import type { Key, Property, Track, TrackValue } from '#ir/types.ts';

/** One physical ring, split only for correct occlusion around the cat.
 * Both halves share their pivot and identical timing in every export target.
 */
export function orbit<P extends Extract<Property, 'rotation' | 'position' | 'scale'>>(
  property: P, keys: Key<TrackValue<P>>[],
): Track<P>[] {
  return ['ring-back', 'ring-front'].map(part => track(part, property, keys));
}
