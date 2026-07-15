import { ProblemData, ParsedExample } from './types';

export function buildSolutionFile(problem: ProblemData): string {
  const header = `# ${problem.title}\n# https://school.programmers.co.kr/learn/courses/30/lessons/${problem.id}\n`;
  const body = problem.skeletonCode ?? `def solution(${problem.paramNames.join(', ')}):\n    pass\n`;
  return `${header}\n${body}\n`;
}

export function buildCasesFile(problem: ProblemData): string {
  const cases = problem.examples
    .filter((example): example is Required<ParsedExample> => example.ok)
    .map((example) => ({ inputs: example.inputs, output: example.output }));
  return JSON.stringify(cases, null, 2);
}
