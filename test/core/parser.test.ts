import * as fs from 'fs';
import * as path from 'path';
import { parseProblemHtml } from '../../src/core/parser';

describe('parseProblemHtml', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'sample-problem.html'),
    'utf-8'
  );

  test('extracts the title', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.title).toBe('완주하지 못한 선수');
  });

  test('extracts the description html', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.descriptionHtml).toContain('마라톤');
  });

  test('extracts the skeleton code', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.skeletonCode).toContain('def solution(participant, completion):');
  });

  test('extracts parameter names from the example table header', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.paramNames).toEqual(['participant', 'completion']);
  });

  test('extracts and parses example rows', () => {
    const data = parseProblemHtml(html, '42862');
    expect(data.examples).toHaveLength(2);
    expect(data.examples[0]).toEqual({
      ok: true,
      raw: ['["leo", "kiki", "eden"]', '["eden", "kiki"]', '"leo"'],
      inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']],
      output: 'leo',
    });
  });

  test('falls back to a default title and empty examples when nothing matches', () => {
    const data = parseProblemHtml('<html><body></body></html>', '1');
    expect(data.title).toBe('Problem 1');
    expect(data.examples).toEqual([]);
  });
});

describe('parseLevel', () => {
  const wrap = (body: string) => parseProblemHtml(`<html><body>${body}</body></html>`, '1').level;

  test('reads a data-level attribute', () => {
    expect(wrap('<div data-level="3"></div>')).toBe(3);
  });

  test('reads a dedicated element', () => {
    expect(wrap('<span class="challenge-level">Lv. 2</span>')).toBe(2);
  });

  test('falls back to the Lv. marker anywhere on the page', () => {
    expect(wrap('<div><p>난이도 안내</p><em>Lv. 4</em></div>')).toBe(4);
  });

  test('accepts the Korean spelling', () => {
    expect(wrap('<div>레벨 1</div>')).toBe(1);
  });

  test('returns null when the page has no level', () => {
    expect(wrap('<p>설명만 있습니다</p>')).toBeNull();
  });

  test('does not mistake a longer number for a level', () => {
    expect(wrap('<p>Lv. 42 라는 표기는 난이도가 아니다</p>')).toBeNull();
  });
});
