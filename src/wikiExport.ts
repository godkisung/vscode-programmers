import { spawn } from 'child_process';

/**
 * 전체 케이스를 통과했을 때 위키 생성 파이프라인을 돌린다.
 *
 * 확장이 직접 노트를 만들지는 않는다. 파이프라인은 별도 저장소의 Python CLI이고,
 * 확장은 얇은 트리거로만 남긴다 — 프롬프트 한 줄 고칠 때마다 확장을 다시 빌드할
 * 이유가 없기 때문이다.
 */
export const DEFAULT_EXPORT_COMMAND = '.venv/bin/python tools/export.py ${problemId}';

export class WikiExportError extends Error {}

export interface ExportOptions {
  /** 명령을 실행할 디렉터리. 보통 dataRoot가 속한 저장소의 루트. */
  cwd: string;
  problemId: string;
  command: string;
  timeoutMs?: number;
}

export function expandCommand(template: string, problemId: string): string {
  return template.replace(/\$\{problemId\}/g, problemId);
}

/**
 * 셸로 실행한다. 사용자가 설정에 파이프나 인용부호를 쓸 수 있어야 하고,
 * 값은 사용자 자신의 설정에서만 오기 때문이다.
 */
export function runExport(options: ExportOptions): Promise<string> {
  const { cwd, problemId, command, timeoutMs = 30 * 60 * 1000 } = options;
  const expanded = expandCommand(command, problemId);

  return new Promise((resolve, reject) => {
    const child = spawn(expanded, { cwd, shell: true });

    let output = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const collect = (chunk: Buffer) => {
      output += chunk.toString('utf-8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new WikiExportError(`실행하지 못했습니다: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new WikiExportError(`${timeoutMs / 60000}분을 초과했습니다.`));
        return;
      }
      if (code !== 0) {
        reject(new WikiExportError(`종료 코드 ${code}\n${output.trim()}`));
        return;
      }
      resolve(output.trim());
    });
  });
}

export interface WikiExportConfig {
  enabled: boolean;
  command: string;
}
