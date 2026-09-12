import { validateClip } from '#ir/clip.ts';
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
    for (const [from, destinations] of Object.entries(layer.bridges ?? {})) {
      if (!(from in layer.states)) errors.push(`${at}: bridge from unknown state "${from}"`);
      for (const [to, bridge] of Object.entries(destinations)) {
        if (!(to in layer.states)) errors.push(`${at}: bridge to unknown state "${to}"`);
        if (bridge.loop) errors.push(`${at}: bridge "${bridge.name}" must not loop`);
        if (clipNames.has(bridge.name)) errors.push(`${at}: duplicate bridge clip "${bridge.name}"`);
        clipNames.add(bridge.name);
        errors.push(...validateClip(bridge, rig).map(e => `${at} bridge ${from}->${to}: ${e}`));
      }
    }
    for (const [i, tr] of layer.transitions.entries()) {
      const tat = `${at} transitions[${i}]`;
      if (layer.bridges) for (const from of tr.from === '*' ? Object.keys(layer.states) : [tr.from]) {
        if (from !== tr.to && !layer.bridges[from]?.[tr.to]) errors.push(`${tat}: missing bridge ${from}->${tr.to}`);
      }
      if (tr.from !== '*' && !(tr.from in layer.states)) errors.push(`${tat}: unknown state "${tr.from}"`);
      if (!(tr.to in layer.states)) errors.push(`${tat}: unknown state "${tr.to}"`);
      if (!(tr.duration >= 0)) errors.push(`${tat}: duration must be >= 0`);
      for (const when of [tr.when, ...(tr.when.and ?? [])]) {
        const input = m.inputs[when.input];
        if (!input) {
          errors.push(`${tat}: unknown input "${when.input}"`);
          continue;
        }
        if ('fired' in when && input.type !== 'trigger') errors.push(`${tat}: "fired" needs a trigger input`);
        if ('equals' in when) {
          if (input.type === 'trigger') errors.push(`${tat}: trigger "${when.input}" cannot be compared with equals`);
          if (input.type === 'enum' && typeof when.equals !== 'string') errors.push(`${tat}: enum "${when.input}" must equal a string`);
          if (input.type === 'enum' && typeof when.equals === 'string' && !input.values.includes(when.equals)) {
            errors.push(`${tat}: "${when.equals}" is not a value of enum "${when.input}"`);
          }
          if (input.type === 'bool' && typeof when.equals !== 'boolean') errors.push(`${tat}: bool "${when.input}" must equal a boolean`);
        }
      }
    }
  }
  return errors;
}
