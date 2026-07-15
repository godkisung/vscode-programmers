import { renderProblemHtml } from '../../src/webview/render';
import { ProblemData } from '../../src/core/types';

const problem: ProblemData = {
  id: '42862',
  title: '완주하지 못한 선수',
  descriptionHtml: '<p>설명 <img src="/images/a.png"><script>alert(1)</script></p>',
  paramNames: [],
  skeletonCode: null,
  examples: [],
};

describe('renderProblemHtml', () => {
  test('escapes the title', () => {
    const html = renderProblemHtml({ ...problem, title: '<b>x</b>' });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  test('strips script tags from the description', () => {
    const html = renderProblemHtml(problem);
    expect(html).not.toContain('<script>');
  });

  test('rewrites relative image src to an absolute url', () => {
    const html = renderProblemHtml(problem);
    expect(html).toContain('src="https://school.programmers.co.kr/images/a.png"');
  });

  test('includes a link back to the original problem page', () => {
    const html = renderProblemHtml(problem);
    expect(html).toContain(
      'href="https://school.programmers.co.kr/learn/courses/30/lessons/42862"'
    );
  });

  test('preserves a same-page anchor link instead of rewriting it to an absolute URL', () => {
    const html = renderProblemHtml({
      ...problem,
      descriptionHtml: '<p><a href="#section">jump</a></p>',
    });
    expect(html).toContain('href="#section"');
  });

  test('strips a javascript: URL from a link href', () => {
    const html = renderProblemHtml({
      ...problem,
      descriptionHtml: '<p><a href="javascript:alert(1)">click</a></p>',
    });
    expect(html).not.toContain('javascript:');
  });

  test('adds rel="noopener noreferrer" to links', () => {
    const html = renderProblemHtml({
      ...problem,
      descriptionHtml: '<p><a href="/some/page">link</a></p>',
    });
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
