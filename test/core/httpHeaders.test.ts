import { buildHeaders, USER_AGENT } from '../../src/core/httpHeaders';

describe('buildHeaders', () => {
  test('includes the cookie and a consistent user agent', () => {
    const headers = buildHeaders('_fss_session=abc123');
    expect(headers.Cookie).toBe('_fss_session=abc123');
    expect(headers['User-Agent']).toBe(USER_AGENT);
  });
});
