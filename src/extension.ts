import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCookie, setCookie } from './secretsStore';
import { fetchProblemHtml, checkSession, AuthExpiredError } from './core/fetchProblem';
import { parseProblemHtml } from './core/parser';
import { buildSolutionFile, buildCasesFile } from './core/scaffold';
import { runSampleTests } from './core/testRunner';
import { renderProblemHtml } from './webview/render';
import { ProblemData } from './core/types';

let currentPanel: vscode.WebviewPanel | undefined;
let currentProblemDir: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('programmers.setSessionCookie', async () => {
      const cookie = await vscode.window.showInputBox({
        prompt: '브라우저 개발자도구에서 복사한 Cookie 헤더 값을 붙여넣으세요',
        password: true,
        ignoreFocusOut: true,
      });
      if (!cookie) return;
      await setCookie(context.secrets, cookie);
      vscode.window.showInformationMessage('Programmers 세션 쿠키를 저장했습니다.');
    }),

    vscode.commands.registerCommand('programmers.checkConnection', async () => {
      const cookie = await getCookie(context.secrets);
      if (!cookie) {
        vscode.window.showErrorMessage('먼저 "Programmers: Set Session Cookie"로 쿠키를 설정하세요.');
        return;
      }
      const ok = await checkSession(cookie);
      if (ok) {
        vscode.window.showInformationMessage('Programmers 연결 확인: 정상');
      } else {
        vscode.window.showErrorMessage('Programmers 연결 확인 실패: 쿠키가 만료되었을 수 있습니다.');
      }
    }),

    vscode.commands.registerCommand('programmers.openProblem', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('먼저 워크스페이스 폴더를 여세요.');
        return;
      }

      const rawInput = await vscode.window.showInputBox({
        prompt: 'Programmers 문제 번호 또는 URL을 입력하세요',
      });
      if (!rawInput) return;
      const id = extractProblemId(rawInput);

      const cookie = await getCookie(context.secrets);
      if (!cookie) {
        vscode.window.showErrorMessage('먼저 "Programmers: Set Session Cookie"로 쿠키를 설정하세요.');
        return;
      }

      let problem: ProblemData;
      try {
        const html = await fetchProblemHtml(id, cookie);
        problem = parseProblemHtml(html, id);
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          vscode.window.showErrorMessage('쿠키가 만료된 것 같습니다. 브라우저에서 다시 복사해 설정해주세요.');
        } else {
          vscode.window.showErrorMessage(`문제를 불러오지 못했습니다: ${(err as Error).message}`);
        }
        return;
      }

      const dir = path.join(workspaceFolder.uri.fsPath, '.programmers', id);
      fs.mkdirSync(dir, { recursive: true });
      const solutionPath = path.join(dir, 'solution.py');
      const casesPath = path.join(dir, 'cases.json');
      fs.writeFileSync(solutionPath, buildSolutionFile(problem));
      fs.writeFileSync(casesPath, buildCasesFile(problem));
      currentProblemDir = dir;

      const doc = await vscode.workspace.openTextDocument(solutionPath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

      if (!currentPanel) {
        currentPanel = vscode.window.createWebviewPanel(
          'programmersProblem',
          problem.title,
          vscode.ViewColumn.Two,
          {}
        );
        currentPanel.onDidDispose(() => {
          currentPanel = undefined;
        });
      }
      currentPanel.title = problem.title;
      currentPanel.webview.html = renderProblemHtml(problem);
    }),

    vscode.commands.registerCommand('programmers.runSampleTests', async () => {
      if (!currentProblemDir) {
        vscode.window.showErrorMessage('먼저 "Programmers: Open Problem"으로 문제를 여세요.');
        return;
      }
      const solutionPath = path.join(currentProblemDir, 'solution.py');
      const casesPath = path.join(currentProblemDir, 'cases.json');

      try {
        const results = runSampleTests(solutionPath, casesPath);
        const passed = results.filter((r) => r.pass).length;
        const channel = vscode.window.createOutputChannel('Programmers');
        channel.clear();
        channel.appendLine(`${passed}/${results.length} 통과`);
        for (const r of results) {
          if (r.pass) {
            channel.appendLine(`  [PASS] case ${r.index}`);
          } else if (r.error) {
            channel.appendLine(`  [FAIL] case ${r.index}: ${r.error}`);
          } else {
            channel.appendLine(
              `  [FAIL] case ${r.index}: expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`
            );
          }
        }
        channel.show();
      } catch (err) {
        vscode.window.showErrorMessage(`테스트 실행 실패: ${(err as Error).message}`);
      }
    })
  );
}

export function deactivate() {}

function extractProblemId(input: string): string {
  const match = input.match(/lessons\/(\d+)/);
  return match ? match[1] : input.trim();
}
