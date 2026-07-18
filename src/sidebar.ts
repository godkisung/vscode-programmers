import * as vscode from 'vscode';
import { ExtensionState } from './state';
import { getRecentProblems, RecentProblem } from './recentProblems';

type Node =
  | { kind: 'current' }
  | { kind: 'recentGroup' }
  | { kind: 'recent'; problem: RecentProblem };

export class ProblemsTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private state: ExtensionState,
    private globalState: vscode.Memento,
    subscriptions: { dispose(): void }[]
  ) {
    subscriptions.push(
      state.onDidChangeProblem(() => this.emitter.fire()),
      state.onDidChangeTestResults(() => this.emitter.fire())
    );
  }

  refresh(): void {
    this.emitter.fire();
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      const roots: Node[] = [];
      if (this.state.currentProblem) roots.push({ kind: 'current' });
      if (getRecentProblems(this.globalState).length > 0) roots.push({ kind: 'recentGroup' });
      return roots;
    }
    if (node.kind === 'recentGroup') {
      return getRecentProblems(this.globalState).map((problem) => ({ kind: 'recent', problem }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'current') {
      const problem = this.state.currentProblem;
      const item = new vscode.TreeItem(problem?.title ?? '');
      const run = this.state.lastRun;
      const summary = run
        ? ` · ${run.results.filter((r) => r.pass).length}/${run.results.length} 통과`
        : '';
      item.description = `#${problem?.id}${summary}`;
      item.iconPath = new vscode.ThemeIcon('file-code');
      item.contextValue = 'currentProblem';
      item.tooltip = '클릭하면 solution.py를 엽니다';
      item.command = {
        command: 'programmers.revealSolution',
        title: 'solution.py 열기',
      };
      return item;
    }

    if (node.kind === 'recentGroup') {
      return new vscode.TreeItem('최근 문제', vscode.TreeItemCollapsibleState.Expanded);
    }

    const item = new vscode.TreeItem(node.problem.title);
    item.description = node.problem.id;
    item.iconPath = new vscode.ThemeIcon('history');
    item.command = {
      command: 'programmers.openProblemById',
      title: '문제 열기',
      arguments: [node.problem.id],
    };
    return item;
  }
}
