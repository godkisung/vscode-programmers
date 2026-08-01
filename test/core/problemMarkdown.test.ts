import { buildProblemMarkdown, htmlToMarkdown } from '../../src/core/problemMarkdown';
import { ProblemData } from '../../src/core/types';

const problem: ProblemData = {
  id: '12973',
  title: '짝지어 제거하기',
  level: 2,
  descriptionHtml:
    '<p>알파벳 소문자로 이루어진 <strong>문자열</strong>입니다.</p><ul><li>길이는 1,000,000 이하</li></ul>',
  paramNames: ['s'],
  skeletonCode: null,
  examples: [
    { ok: true, raw: ['"baabaa"', '1'], inputs: ['baabaa'], output: 1 },
    { ok: true, raw: ['"cdcd"', '0'], inputs: ['cdcd'], output: 0 },
  ],
};

const FIXED_DATE = new Date('2026-07-31T05:00:00.000Z');

describe('htmlToMarkdown', () => {
  test('converts basic formatting', () => {
    expect(htmlToMarkdown('<p>hello <strong>world</strong></p>')).toBe('hello **world**');
  });

  test('converts tables (gfm)', () => {
    const md = htmlToMarkdown(
      '<table><thead><tr><th>s</th><th>result</th></tr></thead><tbody><tr><td>"ab"</td><td>0</td></tr></tbody></table>'
    );
    expect(md).toContain('| s | result |');
    expect(md).toContain('| "ab" | 0 |');
  });

  test('rewrites relative image and link URLs to absolute', () => {
    const md = htmlToMarkdown('<p><img src="/img/a.png" alt="예시"><a href="/learn/x">링크</a></p>');
    expect(md).toContain('![예시](https://school.programmers.co.kr/img/a.png)');
    expect(md).toContain('[링크](https://school.programmers.co.kr/learn/x)');
  });

  test('drops dangerous link schemes but keeps the text', () => {
    const md = htmlToMarkdown('<a href="javascript:alert(1)">click</a>');
    expect(md).toBe('click');
  });

  test('returns an empty string for blank html', () => {
    expect(htmlToMarkdown('   ')).toBe('');
  });
});

describe('buildProblemMarkdown', () => {
  test('writes frontmatter with id, title, url and fetch time', () => {
    const md = buildProblemMarkdown(problem, FIXED_DATE);
    expect(md).toContain('id: "12973"');
    expect(md).toContain('title: 짝지어 제거하기');
    expect(md).toContain('url: https://school.programmers.co.kr/learn/courses/30/lessons/12973');
    expect(md).toContain('platform: programmers');
    expect(md).toContain('fetched_at: 2026-07-31T05:00:00.000Z');
  });

  test('quotes a numeric id so YAML keeps it a string', () => {
    expect(buildProblemMarkdown(problem, FIXED_DATE)).toContain('id: "12973"');
  });

  test('quotes a title that would otherwise break YAML', () => {
    const md = buildProblemMarkdown({ ...problem, title: '문제: 어려움 #3' }, FIXED_DATE);
    expect(md).toContain('title: "문제: 어려움 #3"');
  });

  test('includes the description as markdown', () => {
    const md = buildProblemMarkdown(problem, FIXED_DATE);
    expect(md).toContain('# 짝지어 제거하기');
    expect(md).toContain('알파벳 소문자로 이루어진 **문자열**입니다.');
    // turndown은 불릿 뒤에 공백 3칸을 넣는다. 유효한 마크다운이라 그대로 둔다.
    expect(md).toMatch(/^- +길이는 1,000,000 이하$/m);
  });

  test('renders the examples table using the raw cell text', () => {
    const md = buildProblemMarkdown(problem, FIXED_DATE);
    expect(md).toContain('| s | result |');
    expect(md).toContain('| "baabaa" | 1 |');
  });

  test('keeps unparsed examples and flags them', () => {
    const withFailure: ProblemData = {
      ...problem,
      examples: [
        { ok: true, raw: ['"baabaa"', '1'], inputs: ['baabaa'], output: 1 },
        { ok: false, raw: ['"cdcd"', '0'] },
      ],
    };
    const md = buildProblemMarkdown(withFailure, FIXED_DATE);

    // cases.json에서 빠지는 값이라 problem.md가 유일한 원본이 된다.
    expect(md).toContain('예제 케이스 1개를 자동으로 파싱하지 못했습니다');
    expect(md).toContain('| s | result | 파싱 |');
    expect(md).toContain('| "cdcd" | 0 | ⚠️ |');
    expect(md).toContain('| "baabaa" | 1 | ✅ |');
  });

  test('omits the parse column when every example parsed', () => {
    const md = buildProblemMarkdown(problem, FIXED_DATE);
    expect(md).not.toContain('파싱');
    expect(md).not.toContain('⚠️');
  });

  test('escapes pipes and newlines so the table survives', () => {
    const tricky: ProblemData = {
      ...problem,
      examples: [{ ok: true, raw: ['"a|b"\nnext', '1'], inputs: ['a|b'], output: 1 }],
    };
    const md = buildProblemMarkdown(tricky, FIXED_DATE);
    expect(md).toContain('| "a\\|b"<br>next | 1 |');
  });

  test('omits the examples section when there are none', () => {
    const md = buildProblemMarkdown({ ...problem, examples: [] }, FIXED_DATE);
    expect(md).not.toContain('## 입출력 예');
  });

  test('notes a missing description instead of leaving a hole', () => {
    const md = buildProblemMarkdown({ ...problem, descriptionHtml: '' }, FIXED_DATE);
    expect(md).toContain('_문제 설명을 가져오지 못했습니다._');
  });

  test('links back to the original page', () => {
    expect(buildProblemMarkdown(problem, FIXED_DATE)).toContain(
      '[원본 페이지에서 보기](https://school.programmers.co.kr/learn/courses/30/lessons/12973)'
    );
  });
});

describe('level in frontmatter', () => {
  test('writes the parsed level', () => {
    expect(buildProblemMarkdown(problem, FIXED_DATE)).toContain('level: 2');
  });

  test('writes null rather than guessing when the page had none', () => {
    // 난이도는 사실 정보다. 모르면 비워두는 게 맞다.
    expect(buildProblemMarkdown({ ...problem, level: null }, FIXED_DATE)).toContain('level: null');
  });
});
