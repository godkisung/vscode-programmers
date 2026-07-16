import { filterAndFormatCookies, BrowserLaunchError, LoginCancelledError, sleep } from '../../src/core/autoLogin';

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
