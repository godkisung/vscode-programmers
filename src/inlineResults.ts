import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionState } from './state';
import { findSolutionDefLine } from './core/solutionLocator';
import { RunResult } from './core/types';

function describeFailure(result: RunResult): string {
  if (result.error) return `case ${result.index}: ${result.error}`;
  return `case ${result.index} 실패: expected=${JSON.stringify(result.expected)}, actual=${JSON.stringify(result.actual)}`;
}

export class InlineResultsProvider implements vscode.CodeLensProvider {
  private lensEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.lensEmitter.event;
  private diagnostics: vscode.DiagnosticCollection;

  constructor(
    private state: ExtensionState,
    subscriptions: { dispose(): void }[]
  ) {
    this.diagnostics = vscode.languages.createDiagnosticCollection('programmers');
    subscriptions.push(
      this.diagnostics,
      vscode.languages.registerCodeLensProvider(
        { language: 'python', pattern: '**/.programmers/*/solution.py' },
        this
      ),
      this.state.onDidChangeTestResults(() => {
        this.lensEmitter.fire();
        this.updateDiagnostics();
      }),
      this.state.onDidChangeProblem(() => {
        this.lensEmitter.fire();
        this.diagnostics.clear();
      })
    );
  }

  private currentSolutionPath(): string | undefined {
    const problem = this.state.currentProblem;
    return problem ? path.join(problem.dir, 'solution.py') : undefined;
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.uri.fsPath !== this.currentSolutionPath()) return [];

    const line = findSolutionDefLine(document.getText());
    const range = new vscode.Range(line, 0, line, 0);
    const lenses = [
      new vscode.CodeLens(range, {
        title: '$(play) 샘플 테스트 실행',
        command: 'programmers.runSampleTests',
      }),
    ];

    const run = this.state.lastRun;
    if (run && run.results.length > 0) {
      const passed = run.results.filter((r) => r.pass).length;
      const total = run.results.length;
      lenses.push(
        new vscode.CodeLens(range, {
          title: passed === total ? `✓ ${passed}/${total} 통과` : `✗ ${passed}/${total} 통과`,
          tooltip: '최근 샘플 테스트 결과 — 클릭하면 다시 실행합니다',
          command: 'programmers.runSampleTests',
        })
      );
    }
    return lenses;
  }

  private updateDiagnostics(): void {
    this.diagnostics.clear();
    const solutionPath = this.currentSolutionPath();
    const run = this.state.lastRun;
    if (!solutionPath || !run) return;

    const failures = run.results.filter((r) => !r.pass);
    if (failures.length === 0) return;

    let source: string;
    try {
      source = fs.readFileSync(solutionPath, 'utf-8');
    } catch {
      return;
    }
    const line = findSolutionDefLine(source);
    const lineText = source.split('\n')[line] ?? '';
    const range = new vscode.Range(line, 0, line, Math.max(lineText.length, 1));

    const diags = failures.map((f) => {
      const diag = new vscode.Diagnostic(range, describeFailure(f), vscode.DiagnosticSeverity.Warning);
      diag.source = 'programmers';
      return diag;
    });
    this.diagnostics.set(vscode.Uri.file(solutionPath), diags);
  }
}
