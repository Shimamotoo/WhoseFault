import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WHOSEFAULT_API_URL,
  MissingApiTokenError,
  loadConfig,
  loadConfigOrExit,
  normalizeApiUrl,
} from '../src/config.js';

describe('config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes WHOSEFAULT_API_URL with default and strips trailing slashes', () => {
    expect(normalizeApiUrl(undefined)).toBe(DEFAULT_WHOSEFAULT_API_URL);
    expect(normalizeApiUrl('   ')).toBe(DEFAULT_WHOSEFAULT_API_URL);
    expect(normalizeApiUrl('http://localhost:3333/api///')).toBe('http://localhost:3333/api');
    expect(normalizeApiUrl(' https://api.whosefault.dev/api/ ')).toBe(
      'https://api.whosefault.dev/api',
    );
  });

  it('throws MissingApiTokenError when WHOSEFAULT_API_TOKEN is missing or blank', () => {
    expect(() => loadConfig({})).toThrow(MissingApiTokenError);
    expect(() => loadConfig({ WHOSEFAULT_API_TOKEN: '   ' })).toThrow(MissingApiTokenError);
  });

  it('returns normalized config when WHOSEFAULT_API_TOKEN is provided', () => {
    const config = loadConfig({
      WHOSEFAULT_API_URL: 'http://127.0.0.1:4000/api/',
      WHOSEFAULT_API_TOKEN: '  fake-bearer-token  ',
    });

    expect(config).toEqual({
      apiUrl: 'http://127.0.0.1:4000/api',
      apiToken: 'fake-bearer-token',
    });
  });

  it('logs clear message to stderr without leaking secrets and exits with code 1 when token is absent (CA-01)', () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.fn((code: number): never => {
      throw new Error(`PROCESS_EXIT_${code}`);
    });

    expect(() =>
      loadConfigOrExit({ WHOSEFAULT_API_URL: 'http://localhost:3333/api' }, exitSpy),
    ).toThrow('PROCESS_EXIT_1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]?.[0]).toContain('WHOSEFAULT_API_TOKEN');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
