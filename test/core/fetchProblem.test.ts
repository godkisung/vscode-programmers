import * as http from 'http';
import { AddressInfo } from 'net';
import { fetchProblemHtml, checkSession, AuthExpiredError } from '../../src/core/fetchProblem';

describe('fetchProblemHtml / checkSession', () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequestHeaders: http.IncomingHttpHeaders = {};

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      lastRequestHeaders = req.headers;
      if (req.url === '/learn/courses/30/lessons/1') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>ok</body></html>');
      } else if (req.url === '/learn/courses/30/lessons/expired') {
        res.writeHead(302, { Location: '/login' });
        res.end();
      } else if (req.url === '/learn/courses/30/lessons') {
        if (req.headers.cookie === '_fss_session=expired') {
          res.writeHead(401);
          res.end();
        } else {
          res.writeHead(200);
          res.end('ok');
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

  test('throws AuthExpiredError on a login redirect', async () => {
    await expect(
      fetchProblemHtml('expired', '_fss_session=abc', baseUrl)
    ).rejects.toBeInstanceOf(AuthExpiredError);
  });

  test('checkSession returns true for a 200 response', async () => {
    await expect(checkSession('_fss_session=abc', baseUrl)).resolves.toBe(true);
  });

  test('checkSession returns false for a 401 response', async () => {
    await expect(checkSession('_fss_session=expired', baseUrl)).resolves.toBe(false);
  });
});
