import type { MachineTransition } from '#ir/types.ts';
import { reactionExpressions } from './reaction-policy.js';

/** An ignored trigger is consumed that frame; never defer it to a later emotion. */
export function reactionTransitions(trigger: keyof typeof reactionExpressions, state: string): MachineTransition[] {
  const allowed = reactionExpressions[trigger];
  const expressions = reactionExpressions.reactEarTwitch;
  return [
    ...allowed.map(expression => ({
      from: '*', to: state,
      when: { input: trigger, fired: true as const, and: [{ input: 'expression', equals: expression }] },
      duration: 0.1,
    })),
    ...expressions.filter(expression => !allowed.includes(expression)).map(expression => ({
      from: state, to: 'none', when: { input: 'expression', equals: expression }, duration: 0.12,
    })),
  ];
}
