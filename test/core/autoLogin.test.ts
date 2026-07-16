import {
  filterAndFormatCookies,
  BrowserLaunchError,
  LoginCancelledError,
  sleep,
  resolveChromeExecutable,
} from '../../src/core/autoLogin';

describe('filterAndFormatCookies', () => {
  test('keeps a cookie whose domain exactly matches the target host', () => {
    const result = filterAndFormatCookies(
      [{ name: '_fss_session', value: 'abc123', domain: 'school.programmers.co.kr' }],
      'school.programmers.co.kr'
    );
    expect(result).toBe('_fss_session=abc123');
  });

  test('keeps a cookie set on the parent domain with a leading dot', () => {
    const result = filterAndFormatCookies(
      [{ name: 'shared_id', value: 'xyz', domain: '.programmers.co.kr' }],
      'school.programmers.co.kr'
    );
    expect(result).toBe('shared_id=xyz');
  });

  test('drops cookies for unrelated domains', () => {
    const result = filterAndFormatCookies(
      [
        { name: '_fss_session', value: 'abc123', domain: 'school.programmers.co.kr' },
        { name: '_ga', value: 'tracking', domain: '.google-analytics.com' },
      ],
      'school.programmers.co.kr'
    );
    expect(result).toBe('_fss_session=abc123');
  });

  test('joins multiple matching cookies with "; "', () => {
    const result = filterAndFormatCookies(
      [
        { name: 'a', value: '1', domain: 'school.programmers.co.kr' },
        { name: 'b', value: '2', domain: '.programmers.co.kr' },
      ],
      'school.programmers.co.kr'
    );
    expect(result).toBe('a=1; b=2');
  });

  test('returns an empty string when nothing matches', () => {
    const result = filterAndFormatCookies(
      [{ name: '_ga', value: 'tracking', domain: '.google-analytics.com' }],
      'school.programmers.co.kr'
    );
    expect(result).toBe('');
  });
});

describe('error classes', () => {
  test('BrowserLaunchError carries a message and name', () => {
    const err = new BrowserLaunchError('Chrome을 찾을 수 없습니다');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BrowserLaunchError');
    expect(err.message).toBe('Chrome을 찾을 수 없습니다');
  });

  test('LoginCancelledError has a fixed message', () => {
    const err = new LoginCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LoginCancelledError');
  });
});

describe('sleep', () => {
  test('resolves immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const start = Date.now();
    await sleep(5000, controller.signal);
    expect(Date.now() - start).toBeLessThan(100);
  });

  test('resolves early when the signal aborts mid-wait', async () => {
    const controller = new AbortController();
    const start = Date.now();
    setTimeout(() => controller.abort(), 20);
    await sleep(5000, controller.signal);
    expect(Date.now() - start).toBeLessThan(500);
  });

  test('resolves after ms elapses when never aborted', async () => {
    const controller = new AbortController();
    const start = Date.now();
    await sleep(50, controller.signal);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});

describe('resolveChromeExecutable', () => {
  test('returns the first Linux candidate that exists', () => {
    const exists = (p: string) => p === '/opt/google/chrome/chrome';
    expect(resolveChromeExecutable('linux', exists, {})).toBe('/opt/google/chrome/chrome');
  });

  test('falls through to a later Linux candidate when earlier ones are missing', () => {
    const exists = (p: string) => p === '/usr/bin/google-chrome-stable';
    expect(resolveChromeExecutable('linux', exists, {})).toBe('/usr/bin/google-chrome-stable');
  });

  test('returns null on Linux when no candidate exists', () => {
    expect(resolveChromeExecutable('linux', () => false, {})).toBeNull();
  });

  test('returns the macOS app bundle path when it exists', () => {
    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const exists = (p: string) => p === macPath;
    expect(resolveChromeExecutable('darwin', exists, {})).toBe(macPath);
  });

  test('returns null on macOS when the app bundle is missing', () => {
    expect(resolveChromeExecutable('darwin', () => false, {})).toBeNull();
  });

  test('builds the Windows path from the ProgramFiles env var, using backslash separators regardless of host OS', () => {
    const expected = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const exists = (p: string) => p === expected;
    expect(resolveChromeExecutable('win32', exists, { ProgramFiles: 'C:\\Program Files' })).toBe(expected);
  });

  test('falls back to the x86 ProgramFiles candidate on Windows', () => {
    const expected = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
    const exists = (p: string) => p === expected;
    expect(
      resolveChromeExecutable('win32', exists, {
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      })
    ).toBe(expected);
  });
});
