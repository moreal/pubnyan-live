import type { Target } from '#verify/parity.ts';
import { svgTarget } from '#verify/targets/svg.ts';

/** Every exporter under test. New targets register here. */
export const TARGETS: Target[] = [svgTarget];
