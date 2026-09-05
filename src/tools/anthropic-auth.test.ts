import { describe, expect, test, vi } from 'vitest';
import { resolveAnthropicEnv } from './anthropic-auth.ts';

describe('resolveAnthropicEnv', () => {
  test('prefers ANTHROPIC_API_KEY and never calls runPi', () => {
    const runPi = vi.fn(() => 'should-not-be-used');
    const result = resolveAnthropicEnv({ ANTHROPIC_API_KEY: 'sk-ant-123' }, runPi);
    expect(result).toEqual({ env: {}, source: 'ANTHROPIC_API_KEY' });
    expect(runPi).not.toHaveBeenCalled();
  });

  test('falls back to ANTHROPIC_OAUTH_TOKEN when no API key, without calling runPi', () => {
    const runPi = vi.fn(() => 'should-not-be-used');
    const result = resolveAnthropicEnv({ ANTHROPIC_OAUTH_TOKEN: 'existing-token' }, runPi);
    expect(result).toEqual({ env: {}, source: 'ANTHROPIC_OAUTH_TOKEN' });
    expect(runPi).not.toHaveBeenCalled();
  });

  test('calls runPi and returns its token when no env credential is set', () => {
    const runPi = vi.fn(() => 'fresh-pi-token');
    const result = resolveAnthropicEnv({}, runPi);
    expect(result).toEqual({ env: { ANTHROPIC_OAUTH_TOKEN: 'fresh-pi-token' }, source: 'pi-oauth' });
    expect(runPi).toHaveBeenCalledTimes(1);
  });

  test('returns none when runPi yields null', () => {
    const runPi = vi.fn(() => null);
    const result = resolveAnthropicEnv({}, runPi);
    expect(result).toEqual({ env: {}, source: 'none' });
    expect(runPi).toHaveBeenCalledTimes(1);
  });

  test('treats an empty ANTHROPIC_API_KEY as unset', () => {
    const runPi = vi.fn(() => 'fresh-pi-token');
    const result = resolveAnthropicEnv({ ANTHROPIC_API_KEY: '' }, runPi);
    expect(result).toEqual({ env: { ANTHROPIC_OAUTH_TOKEN: 'fresh-pi-token' }, source: 'pi-oauth' });
    expect(runPi).toHaveBeenCalledTimes(1);
  });
});
