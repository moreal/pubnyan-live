// src/loop/sh.ts
import { spawn } from 'node:child_process';

export interface ShResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface ShOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type Sh = (cmd: string, args: string[], opts?: ShOptions) => Promise<ShResult>;

/** Spawn a process, capture both streams, and resolve when it exits. Never rejects on a non-zero exit. */
export const execSh: Sh = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, signal: opts.signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, opts.timeoutMs)
      : null;
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      // AbortSignal kills surface as an error; report them as a failed run, not a crash of the loop.
      if ((err as NodeJS.ErrnoException).name === 'AbortError') resolve({ stdout, stderr, exitCode: 130, timedOut });
      else reject(err);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? (signal ? 128 : 1), timedOut });
    });
  });

/** Run git in `cwd`; return trimmed stdout or throw with the error text. */
export async function git(sh: Sh, cwd: string, ...args: string[]): Promise<string> {
  const r = await sh('git', args, { cwd });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}
