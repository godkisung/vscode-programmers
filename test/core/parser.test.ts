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
