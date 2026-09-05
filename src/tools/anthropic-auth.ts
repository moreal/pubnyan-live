// Resolves Anthropic credentials for the agent loop: prefer an explicit key/token in the
// environment, and fall back to minting a fresh Claude subscription OAuth token via `pi`
// (the pi CLI) when neither is set.
import { spawnSync } from 'node:child_process';

export interface AuthResolution {
  env: Record<string, string>;
  source: 'ANTHROPIC_API_KEY' | 'ANTHROPIC_OAUTH_TOKEN' | 'pi-oauth' | 'none';
}

export function resolveAnthropicEnv(env: NodeJS.ProcessEnv, runPi: () => string | null): AuthResolution {
  if (env.ANTHROPIC_API_KEY) {
    return { env: {}, source: 'ANTHROPIC_API_KEY' };
  }
  if (env.ANTHROPIC_OAUTH_TOKEN) {
    return { env: {}, source: 'ANTHROPIC_OAUTH_TOKEN' };
  }
  const token = runPi();
  if (token && token.trim() !== '') {
    return { env: { ANTHROPIC_OAUTH_TOKEN: token.trim() }, source: 'pi-oauth' };
  }
  return { env: {}, source: 'none' };
}

/** Prints a fresh Claude Pro/Max OAuth bearer token via the `pi` CLI, or null if unavailable. Never throws; never logs the token. */
export function piBearerToken(): string | null {
  const r = spawnSync('pi', ['auth', 'print-bearer-token', '--provider', 'anthropic', '--min-expiry', '60m'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30_000,
  });
  if (r.status !== 0) return null;
  const token = (r.stdout ?? '').trim();
  return token === '' ? null : token;
}
