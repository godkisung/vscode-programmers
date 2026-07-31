import * as os from 'os';
import * as path from 'path';

/** 설정이 없을 때 쓰는 기존 동작 — 워크스페이스 안의 숨김 폴더. */
export const DEFAULT_DATA_DIR = '.programmers';

export const SOLUTION_FILE = 'solution.py';
export const CASES_FILE = 'cases.json';
export const PROBLEM_FILE = 'problem.md';
export const RUNS_FILE = 'runs.jsonl';

/**
 * `programmers.dataRoot` 설정을 절대 경로로 해석한다.
 *
 * - 빈 값: `<workspace>/.programmers` (기존 동작 유지)
 * - `~` 시작: 홈 디렉터리 기준
 * - 절대 경로: 그대로
 * - 상대 경로: 워크스페이스 기준
 *
 * 풀이 데이터를 확장 저장소 밖(별도 private 저장소)에 두기 위한 설정이다.
 */
export function resolveDataRoot(
  workspacePath: string,
  configured?: string,
  homeDir: string = os.homedir()
): string {
  const trimmed = configured?.trim();
  if (!trimmed) return path.join(workspacePath, DEFAULT_DATA_DIR);

  if (trimmed === '~') return homeDir;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(homeDir, trimmed.slice(2));
  }
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);

  return path.resolve(workspacePath, trimmed);
}

export function problemDir(dataRoot: string, id: string): string {
  return path.join(dataRoot, id);
}

export function solutionPath(dir: string): string {
  return path.join(dir, SOLUTION_FILE);
}

export function casesPath(dir: string): string {
  return path.join(dir, CASES_FILE);
}

export function problemMdPath(dir: string): string {
  return path.join(dir, PROBLEM_FILE);
}

export function runsLogPath(dir: string): string {
  return path.join(dir, RUNS_FILE);
}
