import { spawn } from 'child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * git을 실행한다. 셸을 거치지 않고 인자 배열로 넘기므로 경로에 공백이나
 * 특수문자가 있어도 안전하다.
 */
export function runGit(args: string[], cwd: string, timeoutMs = 20000): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`git 실행에 실패했습니다: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`git ${args[0]} 이(가) ${timeoutMs / 1000}초를 초과했습니다.`));
        return;
      }
      resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export type PullOutcome =
  | { ok: true; changed: boolean }
  | { ok: false; reason: PullFailure; detail: string };

export type PullFailure = 'conflict' | 'no-upstream' | 'dirty' | 'network' | 'unknown';

/**
 * pull 실패 원인을 분류한다. 원인마다 사용자에게 할 말이 다르기 때문이다.
 * 특히 conflict는 절대 자동으로 풀지 않는다 — 사람에게 넘겨야 한다.
 */
export function classifyPullFailure(stderr: string): PullFailure {
  const text = stderr.toLowerCase();
  if (text.includes('conflict') || text.includes('could not apply')) return 'conflict';
  if (text.includes('no tracking information') || text.includes('no upstream')) return 'no-upstream';
  if (text.includes('local changes') || text.includes('unstaged changes') || text.includes('cannot pull with rebase')) {
    return 'dirty';
  }
  if (
    text.includes('could not resolve host') ||
    text.includes('connection refused') ||
    text.includes('network is unreachable') ||
    text.includes('timed out') ||
    text.includes('unable to access')
  ) {
    return 'network';
  }
  return 'unknown';
}

export function describePullFailure(reason: PullFailure): string {
  switch (reason) {
    case 'conflict':
      return '충돌이 났습니다. 자동으로 해결하지 않으니 직접 정리한 뒤 다시 시도하세요.';
    case 'no-upstream':
      return '추적 중인 원격 브랜치가 없습니다. 먼저 `git push -u origin <branch>`를 한 번 실행하세요.';
    case 'dirty':
      return '커밋하지 않은 변경이 있어 rebase할 수 없습니다.';
    case 'network':
      return '원격 저장소에 접근하지 못했습니다. 오프라인이면 작업을 계속해도 됩니다.';
    default:
      return '알 수 없는 이유로 실패했습니다.';
  }
}

/** 커밋 메시지. 나중에 git log만 봐도 언제 뭘 풀었는지 알 수 있어야 한다. */
export function buildCommitMessage(problem: { id: string; title: string }): string {
  const title = problem.title.trim().replace(/\s+/g, ' ');
  return title ? `solve(${problem.id}): ${title}` : `solve(${problem.id})`;
}

export async function findRepoRoot(dir: string): Promise<string | undefined> {
  try {
    const result = await runGit(['rev-parse', '--show-toplevel'], dir);
    return result.code === 0 && result.stdout ? result.stdout : undefined;
  } catch {
    return undefined;
  }
}

export async function pullRebase(repoRoot: string): Promise<PullOutcome> {
  const before = await revParseHead(repoRoot);
  const result = await runGit(['pull', '--rebase', '--autostash'], repoRoot);
  if (result.code !== 0) {
    const reason = classifyPullFailure(`${result.stderr}\n${result.stdout}`);
    // rebase가 중간에 멈춰 있으면 저장소를 원래 상태로 되돌린다.
    if (reason === 'conflict') {
      await runGit(['rebase', '--abort'], repoRoot).catch(() => undefined);
    }
    return { ok: false, reason, detail: result.stderr || result.stdout };
  }
  const after = await revParseHead(repoRoot);
  return { ok: true, changed: before !== after };
}

async function revParseHead(repoRoot: string): Promise<string | undefined> {
  const result = await runGit(['rev-parse', 'HEAD'], repoRoot).catch(() => undefined);
  return result?.code === 0 ? result.stdout : undefined;
}

/**
 * 지정한 경로 아래만 스테이징해 커밋한다.
 *
 * 저장소 전체를 `git add -A` 하지 않는 것이 중요하다. 데이터 폴더가
 * 소스 코드와 같은 저장소 안에 있을 수 있고, 그 경우 작업 중이던 코드까지
 * 함께 커밋된다.
 *
 * @returns 커밋했으면 true, 커밋할 변경이 없었으면 false
 */
export async function stageAndCommit(
  repoRoot: string,
  pathspec: string,
  message: string
): Promise<boolean> {
  const add = await runGit(['add', '--', pathspec], repoRoot);
  if (add.code !== 0) {
    throw new Error(`git add 실패: ${add.stderr}`);
  }

  const staged = await runGit(['diff', '--cached', '--quiet', '--', pathspec], repoRoot);
  if (staged.code === 0) return false; // 종료 코드 0 = 차이 없음

  const commit = await runGit(['commit', '-m', message, '--', pathspec], repoRoot);
  if (commit.code !== 0) {
    throw new Error(`git commit 실패: ${commit.stderr || commit.stdout}`);
  }
  return true;
}

export async function push(repoRoot: string): Promise<void> {
  const result = await runGit(['push'], repoRoot);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || 'git push 실패');
  }
}

/** 원격에 아직 보내지 않은 커밋이 있는지. 없으면 push를 건너뛴다. */
export async function hasUnpushedCommits(repoRoot: string): Promise<boolean> {
  const result = await runGit(['rev-list', '--count', '@{upstream}..HEAD'], repoRoot).catch(
    () => undefined
  );
  if (!result || result.code !== 0) return false;
  return Number(result.stdout) > 0;
}
