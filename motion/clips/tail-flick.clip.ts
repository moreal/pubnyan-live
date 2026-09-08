import ringWobble from './ring-wobble.clip.ts';

/** @deprecated Pubnyan has no tail. Use ring-wobble / reactRingWobble.
 * Keep the old export and trigger functional for existing integrations.
 */
export default { ...ringWobble, name: 'tail-flick' };
