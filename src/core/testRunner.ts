import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { RunResult, SampleTestRun } from './types';

function resolveRunnerPath(): string {
  // Bundled (out/extension.js): __dirname = out/
  const bundled = path.join(__dirname, '..', 'resources', 'runner.py');
  if (fs.existsSync(bundled)) return bundled;
  // ts-jest / tsc (src/core/ or out/core/): __dirname = */core/
  return path.join(__dirname, '..', '..', 'resources', 'runner.py');
}

export function runSampleTests(
  solutionPath: string,
  casesPath: string,
  timeoutMs = 10000
): SampleTestRun {
  const result = spawnSync('python3', [resolveRunnerPath(), solutionPath, casesPath], {
    encoding: 'utf-8',
    timeout: timeoutMs,
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    throw new Error(`실행 시간이 ${timeoutMs / 1000}초를 초과했습니다. 무한 루프가 없는지 확인하세요.`);
  }

  if (result.error) {
    throw new Error(`python3 실행에 실패했습니다: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`runner.py가 오류로 종료되었습니다:\n${result.stderr}`);
  }

  const lines = result.stdout.trim().split('\n');
  const lastLine = lines[lines.length - 1];
  const debugOutput = lines.slice(0, -1).join('\n');
  let results: RunResult[];
  try {
    results = JSON.parse(lastLine);
  } catch {
    throw new Error(`runner.py의 출력을 해석하지 못했습니다.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return { results, debugOutput };
}
