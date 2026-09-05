export type Segment =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

const TOKEN = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/** Parses absolute M/L/C/Z path data, including svgpath's implicit command repetition ("L1 2 3 4"). */
export function parsePath(d: string): Segment[] {
  const tokens = d.match(TOKEN) ?? [];
  const out: Segment[] = [];
  let i = 0;
  let cmd = '';
  const num = (): number => {
    const v = Number(tokens[i++]);
    if (!Number.isFinite(v)) throw new Error(`path: expected a number at token ${i - 1} in "${d.slice(0, 40)}"`);
    return v;
  };
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[A-Za-z]/.test(tk)) {
      if (tk !== tk.toUpperCase()) throw new Error(`path: relative command "${tk}" not allowed; rig paths are absolute`);
      if (!'MLCZ'.includes(tk)) throw new Error(`path: unsupported command "${tk}"; use M, L, C, Z`);
      cmd = tk;
      i++;
      if (cmd === 'Z') {
        out.push(['Z']);
        cmd = '';
      }
      continue;
    }
    if (cmd === 'M') {
      out.push(['M', num(), num()]);
      cmd = 'L';
    } else if (cmd === 'L') {
      out.push(['L', num(), num()]);
    } else if (cmd === 'C') {
      out.push(['C', num(), num(), num(), num(), num(), num()]);
    } else {
      throw new Error(`path: number without a command in "${d.slice(0, 40)}"`);
    }
  }
  return out;
}

const fmt = (n: number, precision: number) => String(Number(n.toFixed(precision)));

export function serializePath(segs: Segment[], precision = 2): string {
  return segs.map((s) => s[0] + (s.slice(1) as number[]).map((n) => fmt(n, precision)).join(' ')).join('');
}

/** Linear blend of two paths with identical command sequences; null when they differ. */
export function interpolatePath(a: string, b: string, p: number): string | null {
  const sa = parsePath(a);
  const sb = parsePath(b);
  if (sa.length !== sb.length) return null;
  const out: Segment[] = [];
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i];
    const y = sb[i];
    if (x[0] !== y[0]) return null;
    const nums = (x.slice(1) as number[]).map((v, k) => v + ((y as number[])[k + 1] - v) * p);
    out.push([x[0], ...nums] as Segment);
  }
  return serializePath(out);
}
