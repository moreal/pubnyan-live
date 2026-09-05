import type { Clip, Machine, Rig } from '#ir/types.ts';

export function machine(def: Machine): Machine {
  return def;
}

export function validateMachine(m: Machine, rig: Rig, clips: Clip[]): string[] {
  const errors: string[] = [];
  if (m.rig !== rig.name) errors.push(`machine targets rig "${m.rig}" but was validated against "${rig.name}"`);
  for (const [name, input] of Object.entries(m.inputs)) {
    if (input.type === 'enum' && !input.values.includes(input.default)) {
      errors.push(`input "${name}": default "${input.default}" is not one of its values`);
    }
  }
  const clipNames = new Set(clips.map((c) => c.name));
  for (const [layerName, layer] of Object.entries(m.layers)) {
    const at = `layer "${layerName}"`;
    if (!(layer.entry in layer.states)) errors.push(`${at}: entry "${layer.entry}" is not a state`);
    for (const [stateName, state] of Object.entries(layer.states)) {
      if (state.clip !== null && !clipNames.has(state.clip)) errors.push(`${at} state "${stateName}": unknown clip "${state.clip}"`);
    }
    for (const [i, tr] of layer.transitions.entries()) {
      const tat = `${at} transitions[${i}]`;
      if (tr.from !== '*' && !(tr.from in layer.states)) errors.push(`${tat}: unknown state "${tr.from}"`);
      if (!(tr.to in layer.states)) errors.push(`${tat}: unknown state "${tr.to}"`);
      if (!(tr.duration >= 0)) errors.push(`${tat}: duration must be >= 0`);
      const input = m.inputs[tr.when.input];
      if (!input) {
        errors.push(`${tat}: unknown input "${tr.when.input}"`);
        continue;
      }
      if ('fired' in tr.when && input.type !== 'trigger') errors.push(`${tat}: "fired" needs a trigger input`);
      if ('equals' in tr.when) {
        if (input.type === 'trigger') errors.push(`${tat}: trigger "${tr.when.input}" cannot be compared with equals`);
        if (input.type === 'enum' && typeof tr.when.equals !== 'string') errors.push(`${tat}: enum "${tr.when.input}" must equal a string`);
        if (input.type === 'enum' && typeof tr.when.equals === 'string' && !input.values.includes(tr.when.equals)) {
          errors.push(`${tat}: "${tr.when.equals}" is not a value of enum "${tr.when.input}"`);
        }
        if (input.type === 'bool' && typeof tr.when.equals !== 'boolean') errors.push(`${tat}: bool "${tr.when.input}" must equal a boolean`);
      }
    }
  }
  return errors;
}
