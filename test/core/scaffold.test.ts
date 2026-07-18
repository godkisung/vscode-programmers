import { buildSolutionFile, buildCasesFile, mergeCasesFile } from '../../src/core/scaffold';
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

  test('includes a warning comment when some examples failed to parse', () => {
    const content = buildSolutionFile(problem);
    expect(content).toContain('⚠️ 예제 케이스 1개를 자동으로 파싱하지 못했습니다');
  });

  test('omits the warning comment when all examples parsed successfully', () => {
    const allOk = { ...problem, examples: problem.examples.filter((e) => e.ok) };
    const content = buildSolutionFile(allOk);
    expect(content).not.toContain('⚠️');
  });
});

describe('buildCasesFile', () => {
  test('serializes only successfully parsed examples, marked as sample', () => {
    const content = JSON.parse(buildCasesFile(problem));
    expect(content).toEqual([
      { inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']], output: 'leo', source: 'sample' },
    ]);
  });
});

describe('mergeCasesFile', () => {
  const sampleCase = {
    inputs: [['leo', 'kiki', 'eden'], ['eden', 'kiki']],
    output: 'leo',
    source: 'sample',
  };

  test('returns fresh sample cases when there is no existing file', () => {
    expect(JSON.parse(mergeCasesFile(undefined, problem))).toEqual([sampleCase]);
  });

  test('preserves custom cases and refreshes sample cases', () => {
    const existing = JSON.stringify([
      { inputs: [['old'], ['stale']], output: 'old', source: 'sample' },
      { inputs: [['mine'], []], output: 'mine', source: 'custom' },
    ]);

    expect(JSON.parse(mergeCasesFile(existing, problem))).toEqual([
      sampleCase,
      { inputs: [['mine'], []], output: 'mine', source: 'custom' },
    ]);
  });

  test('treats legacy cases without a source field as samples (replaced)', () => {
    const existing = JSON.stringify([{ inputs: [['legacy'], []], output: 'legacy' }]);
    expect(JSON.parse(mergeCasesFile(existing, problem))).toEqual([sampleCase]);
  });

  test('rebuilds from fresh samples when the existing file is corrupt', () => {
    expect(JSON.parse(mergeCasesFile('not json{', problem))).toEqual([sampleCase]);
  });
});
