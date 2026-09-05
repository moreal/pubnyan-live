import type { Target } from '#verify/parity.ts';
import { lottieTarget } from '#verify/targets/lottie.ts';
import { riveTarget } from '#verify/targets/rive.ts';
import { svgTarget } from '#verify/targets/svg.ts';

/** Every exporter under test. New targets register here. */
export const TARGETS: Target[] = [svgTarget, lottieTarget, riveTarget];
