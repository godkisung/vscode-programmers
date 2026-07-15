import { spawnSync } from 'child_process';
import * as path from 'path';
import { RunResult } from './types';

const RUNNER_PATH = path.join(__dirname, '..', '..', 'resources', 'runner.py');

export function runSampleTests(solutionPath: string, casesPath: string): RunResult[] {
  const result = spawnSync('python3', [RUNNER_PATH, solutionPath, casesPath], {
    encoding: 'utf-8',
  });

  if (result.error) {
    throw new Error(`python3 실행에 실패했습니다: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`runner.py가 오류로 종료되었습니다:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout);
}
