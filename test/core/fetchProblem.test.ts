import * as http from 'http';
import { AddressInfo } from 'net';
import { fetchProblemHtml, checkSession, AuthExpiredError } from '../../src/core/fetchProblem';

describe('fetchProblemHtml / checkSession', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequestHeaders: http.IncomingHttpHeaders = {};
  let lastRequestUrl: string | undefined;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      lastRequestHeaders = req.headers;
      lastRequestUrl = req.url;
      if (req.url === '/learn/courses/30/lessons/1?language=python3') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>ok</body></html>');
      } else if (req.url === '/learn/courses/30/lessons/expired?language=python3') {
        res.writeHead(302, { Location: '/login' });
        res.end();
      } else if (req.url === '/users/profile') {
        if (req.headers.cookie === '_fss_session=abc') {
          res.writeHead(200);
          res.end('ok');
        } else {
          res.writeHead(302, { Location: '/users/login' });
          res.end();
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('fetches the problem html and sends the cookie header', async () => {
    const html = await fetchProblemHtml('1', '_fss_session=abc', baseUrl);
    expect(html).toContain('ok');
    expect(lastRequestHeaders.cookie).toBe('_fss_session=abc');
  });

  test('requests the Python3 variant of the problem page', async () => {
    await fetchProblemHtml('1', '_fss_session=abc', baseUrl);
    expect(lastRequestUrl).toBe('/learn/courses/30/lessons/1?language=python3');
  });

  test('throws AuthExpiredError on a login redirect', async () => {
    await expect(
      fetchProblemHtml('expired', '_fss_session=abc', baseUrl)
    ).rejects.toBeInstanceOf(AuthExpiredError);
  });

  test('checkSession returns true for a 200 response', async () => {
    await expect(checkSession('_fss_session=abc', baseUrl)).resolves.toBe(true);
  });

  test('checkSession returns false for a login-page redirect', async () => {
    await expect(checkSession('_fss_session=expired', baseUrl)).resolves.toBe(false);
  });

  test('checkSession reports the response status and redirect target via onResponse', async () => {
    const seen: { status: number; location: string | null }[] = [];
    await checkSession('_fss_session=expired', baseUrl, (status, location) => {
      seen.push({ status, location });
    });
    expect(seen).toEqual([{ status: 302, location: '/users/login' }]);
  });
});
