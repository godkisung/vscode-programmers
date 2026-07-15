import { ProblemData, ParsedExample } from './types';

export function buildSolutionFile(problem: ProblemData): string {
  const header = `# ${problem.title}\n# https://school.programmers.co.kr/learn/courses/30/lessons/${problem.id}\n`;
  const failedCount = problem.examples.filter((example) => !example.ok).length;
  const warning =
    failedCount > 0
      ? `# ⚠️ 예제 케이스 ${failedCount}개를 자동으로 파싱하지 못했습니다. cases.json과 문제 페이지를 직접 확인하세요.\n`
      : '';
  const body = problem.skeletonCode ?? `def solution(${problem.paramNames.join(', ')}):\n    pass\n`;
  return `${header}${warning}\n${body}\n`;
}

export function buildCasesFile(problem: ProblemData): string {
  const cases = problem.examples
    .filter((example): example is Required<ParsedExample> => example.ok)
    .map((example) => ({ inputs: example.inputs, output: example.output }));
  return JSON.stringify(cases, null, 2);
}
