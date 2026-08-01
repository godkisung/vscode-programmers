import * as vscode from 'vscode';
import {
  buildCommitMessage,
  describePullFailure,
  findRepoRoot,
  hasUnpushedCommits,
  pullRebase,
  push,
  stageAndCommit,
} from './core/git';

/**
 * 여러 기기에서 문제를 풀기 위한 자동 동기화.
 *
 * 수동 pull/push는 반드시 까먹는다. 확장이 대신 하되, **충돌은 절대 자동으로
 * 해결하지 않는다** — 자동화의 목적은 마찰 제거이지 판단 대행이 아니다.
 */
export class GitSync {
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private repoRootCache = new Map<string, string | undefined>();

  constructor(
    private log: (message: string) => void,
    private pushDelayMs = 30_000
  ) {}

  private get enabled(): boolean {
    return vscode.workspace.getConfiguration('programmers').get<boolean>('git.autoSync', false);
  }

  private async repoRootFor(dataRoot: string): Promise<string | undefined> {
    if (!this.repoRootCache.has(dataRoot)) {
      this.repoRootCache.set(dataRoot, await findRepoRoot(dataRoot));
    }
    return this.repoRootCache.get(dataRoot);
  }

  /** dataRoot가 속한 저장소의 루트. 위키 노트 경로를 계산할 때도 쓴다. */
  async repoRoot(dataRoot: string): Promise<string | undefined> {
    return this.repoRootFor(dataRoot);
  }

  /**
   * 문제를 열기 전에 원격 변경을 받아온다.
   *
   * 실패해도 예외를 던지지 않는다. 동기화가 안 된다고 문제를 못 풀 이유는 없다.
   */
  async pullBeforeOpen(dataRoot: string): Promise<void> {
    if (!this.enabled) return;

    const repoRoot = await this.repoRootFor(dataRoot);
    if (!repoRoot) {
      this.log(`[git] ${dataRoot} 는 git 저장소가 아닙니다. 동기화를 건너뜁니다.`);
      return;
    }

    try {
      const outcome = await pullRebase(repoRoot);
      if (outcome.ok) {
        this.log(`[git] pull --rebase ${outcome.changed ? '— 새 커밋을 받았습니다' : '— 변경 없음'}`);
        return;
      }

      this.log(`[git] pull 실패 (${outcome.reason}): ${outcome.detail}`);
      // 오프라인은 흔하고 작업에 지장이 없다. 조용히 로그만 남긴다.
      if (outcome.reason !== 'network') {
        vscode.window.showWarningMessage(`Programmers 동기화: ${describePullFailure(outcome.reason)}`);
      }
    } catch (err) {
      this.log(`[git] pull 중 오류: ${(err as Error).message}`);
    }
  }

  /**
   * 전체 케이스를 통과했을 때 커밋한다. 풀다 만 코드는 쌓지 않는다.
   *
   * 저장소 전체가 아니라 dataRoot 아래만 스테이징한다 — 데이터 폴더가
   * 소스 코드와 같은 저장소에 있을 수 있기 때문이다.
   */
  async commitOnPass(
    dataRoot: string,
    problem: { id: string; title: string },
    extraPaths: string[] = []
  ): Promise<void> {
    if (!this.enabled) return;

    const repoRoot = await this.repoRootFor(dataRoot);
    if (!repoRoot) return;

    try {
      const committed = await stageAndCommit(
        repoRoot,
        [dataRoot, ...extraPaths],
        buildCommitMessage(problem)
      );
      if (committed) {
        this.log(`[git] 커밋: ${buildCommitMessage(problem)}`);
        this.schedulePush(repoRoot);
      }
    } catch (err) {
      this.log(`[git] 커밋 실패: ${(err as Error).message}`);
    }
  }

  /**
   * 커밋할 때마다 push하면 저장 한 번에 네트워크 왕복이 붙는다.
   * 마지막 커밋으로부터 조용해진 뒤 한 번만 보낸다.
   */
  private schedulePush(repoRoot: string): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = undefined;
      void this.pushNow(repoRoot);
    }, this.pushDelayMs);
  }

  async pushNow(repoRoot: string): Promise<void> {
    try {
      if (!(await hasUnpushedCommits(repoRoot))) return;
      await push(repoRoot);
      this.log('[git] push 완료');
    } catch (err) {
      // 오프라인이면 다음 커밋 때 함께 올라간다. 알림까지 띄울 일은 아니다.
      this.log(`[git] push 실패 (다음에 다시 시도합니다): ${(err as Error).message}`);
    }
  }

  /** 창을 닫기 전 마지막 시도. 대기 중인 push가 있으면 지금 보낸다. */
  async flush(dataRoot: string): Promise<void> {
    if (!this.pushTimer) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = undefined;

    const repoRoot = await this.repoRootFor(dataRoot);
    if (repoRoot) await this.pushNow(repoRoot);
  }

  dispose(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
  }
}
