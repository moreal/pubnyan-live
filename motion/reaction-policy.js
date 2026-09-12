// Shared by the exported state machine, landing page, and Storybook controls.
export const reactionExpressions = {
  react: ['normal', 'shy'],
  reactNod: ['normal', 'curious', 'shy'],
  reactTilt: ['normal', 'curious'],
  reactEarTwitch: ['normal', 'angry', 'curious', 'cry', 'shy'],
  reactRingWobble: ['normal', 'curious'],
  reactTailFlick: ['normal', 'curious'], // deprecated ring-wobble alias
  reactCelebrate: ['normal'],
};

export function canReact(expression, trigger) {
  return Object.hasOwn(reactionExpressions, trigger) && reactionExpressions[trigger].includes(expression);
}
