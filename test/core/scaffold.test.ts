import { buildSolutionFile, buildCasesFile } from '../../src/core/scaffold';
import { ProblemData } from '../../src/core/types';

const problem: ProblemData = {
  id: '42862',
  title: '완주하지 못한 선수',
  descriptionHtml: '<p>desc</p>',
  paramNames: ['participant', 'completion'],
  skeletonCode: "def solution(participant, completion):\n    answer = ''\n    return answer",
  examples: [
    {
      ok: true,
      raw: ['a', 'b', 'c'],
      inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']],
      output: 'leo',
    },
    { ok: false, raw: ['bad', 'data', 'here'] },
  ],
};

describe('buildSolutionFile', () => {
  test('includes a header comment with the title and URL', () => {
    const content = buildSolutionFile(problem);
    expect(content).toContain('완주하지 못한 선수');
    expect(content).toContain('https://school.programmers.co.kr/learn/courses/30/lessons/42862');
  });

  test('uses the parsed skeleton code when available', () => {
    const content = buildSolutionFile(problem);
    expect(content).toContain('def solution(participant, completion):');
  });

  test('falls back to a generated stub when no skeleton is available', () => {
    const content = buildSolutionFile({ ...problem, skeletonCode: null });
    expect(content).toContain('def solution(participant, completion):\n    pass');
  });
});

describe('buildCasesFile', () => {
  test('serializes only successfully parsed examples', () => {
    const content = JSON.parse(buildCasesFile(problem));
    expect(content).toEqual([
      { inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']], output: 'leo' },
    ]);
  });
});
