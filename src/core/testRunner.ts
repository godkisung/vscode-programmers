import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { RunResult, SampleTestRun } from './types';

export class TestRunCancelledError extends Error {
  constructor() {
    super('테스트 실행이 취소되었습니다.');
    this.name = 'TestRunCancelledError';
  }
}

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

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
  options: RunOptions = {}
): Promise<SampleTestRun> {
  const { timeoutMs = 10000, signal } = options;

  return new Promise<SampleTestRun>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new TestRunCancelledError());
      return;
    }

    const child = spawn('python3', [resolveRunnerPath(), solutionPath, casesPath]);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const onAbort = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      cleanup();
      settle(() => reject(new Error(`python3 실행에 실패했습니다: ${err.message}`)));
    });

    child.on('close', (code) => {
      cleanup();
      if (settled) return;
      if (cancelled) {
        reject(new TestRunCancelledError());
        return;
      }
      if (timedOut) {
        reject(
          new Error(`실행 시간이 ${timeoutMs / 1000}초를 초과했습니다. 무한 루프가 없는지 확인하세요.`)
        );
        return;
      }
      if (code !== 0) {
        reject(new Error(`runner.py가 오류로 종료되었습니다:\n${stderr}`));
        return;
      }

      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const debugOutput = lines.slice(0, -1).join('\n');
      let results: RunResult[];
      try {
        results = JSON.parse(lastLine);
      } catch {
        reject(
          new Error(`runner.py의 출력을 해석하지 못했습니다.\nstdout:\n${stdout}\nstderr:\n${stderr}`)
        );
        return;
      }
      resolve({ results, debugOutput });
    });
  });
}
