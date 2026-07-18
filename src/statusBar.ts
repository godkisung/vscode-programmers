import * as vscode from 'vscode';
import { ExtensionState, ConnectionStatus } from './state';

const CONNECTION_LABELS: Record<ConnectionStatus, { text: string; tooltip: string }> = {
  unknown: { text: '$(plug) Programmers', tooltip: 'Programmers 연결 상태를 확인하려면 클릭' },
  ok: { text: '$(pass) Programmers', tooltip: 'Programmers 연결 정상 — 클릭하면 다시 확인' },
  expired: {
    text: '$(warning) Programmers 세션 만료',
    tooltip: '세션이 만료되었습니다 — 클릭해서 다시 확인하거나 로그인하세요',
  },
  none: {
    text: '$(circle-slash) Programmers 미로그인',
    tooltip: '로그인이 필요합니다 — 클릭해서 연결을 확인하세요',
  },
};

export function createStatusBarItems(
  state: ExtensionState,
  subscriptions: { dispose(): void }[]
): void {
  const connectionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  connectionItem.command = 'programmers.checkConnection';

  const problemItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
  problemItem.command = 'programmers.runSampleTests';

  const renderConnection = () => {
    const { text, tooltip } = CONNECTION_LABELS[state.connection];
    connectionItem.text = text;
    connectionItem.tooltip = tooltip;
    connectionItem.backgroundColor =
      state.connection === 'expired'
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
  };

  const renderProblem = () => {
    const problem = state.currentProblem;
    if (!problem) {
      problemItem.hide();
      return;
    }
    const run = state.lastRun;
    const summary = run
      ? ` · ${run.results.filter((r) => r.pass).length}/${run.results.length}`
      : '';
    problemItem.text = `$(file-code) ${problem.title}${summary}`;
    problemItem.tooltip = `#${problem.id} — 클릭하면 샘플 테스트를 실행합니다`;
    problemItem.show();
  };

  subscriptions.push(
    connectionItem,
    problemItem,
    state.onDidChangeConnection(renderConnection),
    state.onDidChangeProblem(renderProblem),
    state.onDidChangeTestResults(renderProblem)
  );

  renderConnection();
  renderProblem();
  connectionItem.show();
}
