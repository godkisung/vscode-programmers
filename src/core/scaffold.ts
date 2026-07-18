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

export interface StoredCase {
  inputs: unknown[];
  output: unknown;
  source?: 'sample' | 'custom';
}

function sampleCases(problem: ProblemData): StoredCase[] {
  return problem.examples
    .filter((example): example is Required<ParsedExample> => example.ok)
    .map((example) => ({ inputs: example.inputs, output: example.output, source: 'sample' as const }));
}

export function buildCasesFile(problem: ProblemData): string {
  return JSON.stringify(sampleCases(problem), null, 2);
}

/**
 * 문제를 다시 열 때 cases.json을 갱신한다.
 * 샘플 케이스는 새로 파싱한 값으로 교체하고, 사용자가 추가한 custom 케이스는 보존한다.
 * source 필드가 없는 레거시 케이스는 샘플로 간주해 교체된다.
 */
export function mergeCasesFile(existingContent: string | undefined, problem: ProblemData): string {
  let custom: StoredCase[] = [];
  if (existingContent) {
    try {
      const parsed = JSON.parse(existingContent);
      if (Array.isArray(parsed)) {
        custom = parsed.filter((c): c is StoredCase => c && c.source === 'custom');
      }
    } catch {
      // 손상된 파일은 샘플 케이스로 재생성
    }
  }
  return JSON.stringify([...sampleCases(problem), ...custom], null, 2);
}
