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
import { runAutoLogin, BrowserLaunchError, LoginCancelledError } from './core/autoLogin';
import { detectProblemIdCandidate } from './core/clipboardCandidate';
import { getRecentProblems, addRecentProblem } from './recentProblems';

let currentPanel: vscode.WebviewPanel | undefined;
let currentProblemDir: string | undefined;
let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Programmers');
  }
  return outputChannel;
}

async function runLoginFlow(context: vscode.ExtensionContext): Promise<boolean> {
  const profileDir = path.join(context.globalStorageUri.fsPath, 'browser-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5 * 60 * 1000);

  try {
    const cookie = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:
          'Programmers 로그인 — 뜨는 브라우저 창에서 로그인해주세요... (구글 계정 연동 로그인은 구글이 자동화된 브라우저를 차단해 지원되지 않습니다 — 이 경우 취소 후 "Set Session Cookie"를 이용하세요)',
        cancellable: true,
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        const channel = getOutputChannel();
        channel.appendLine('--- Programmers 로그인 시작 ---');
        channel.show(true);
        return runAutoLogin(profileDir, controller.signal, (msg) => channel.appendLine(`[login] ${msg}`));
      }
    );
    await setCookie(context.secrets, cookie);
    vscode.window.showInformationMessage('Programmers 로그인에 성공했습니다.');
    return true;
  } catch (err) {
    if (err instanceof LoginCancelledError) {
      if (timedOut) {
        vscode.window.showErrorMessage(
          '로그인 시간이 초과되었습니다. 구글 계정으로 로그인하는 경우 구글이 자동화된 브라우저의 로그인을 차단해 완료되지 않을 수 있습니다 — 이 경우 "Set Session Cookie"로 수동 입력해주세요.'
        );
      }
      return false;
    }
    if (err instanceof BrowserLaunchError) {
      const choice = await vscode.window.showErrorMessage(
        `자동 로그인을 사용할 수 없습니다: ${err.message} "Programmers: Set Session Cookie"로 수동 입력해주세요.`,
        '프로파일 초기화 후 재시도'
      );
      if (choice === '프로파일 초기화 후 재시도') {
        fs.rmSync(profileDir, { recursive: true, force: true });
        return runLoginFlow(context);
      }
      return false;
    }
    vscode.window.showErrorMessage(
      `로그인 중 오류가 발생했습니다: ${(err as Error).message} "Programmers: Set Session Cookie"로 수동 입력해주세요.`
    );
    return false;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function offerLoginAndRetry(
  context: vscode.ExtensionContext,
  message: string,
  retry: () => Promise<void>
): Promise<void> {
  const choice = await vscode.window.showErrorMessage(message, '로그인');
  if (choice === '로그인' && (await runLoginFlow(context))) {
    await retry();
  }
}

async function checkConnectionOnce(
  context: vscode.ExtensionContext,
  allowLoginRetry: boolean
): Promise<void> {
  const cookie = await getCookie(context.secrets);
  if (!cookie) {
    if (!allowLoginRetry) {
      vscode.window.showErrorMessage('먼저 "Programmers: Set Session Cookie"로 쿠키를 설정하세요.');
      return;
    }
    await offerLoginAndRetry(context, '먼저 세션 쿠키를 설정하거나 로그인하세요.', () =>
      checkConnectionOnce(context, false)
    );
    return;
  }

  try {
    const ok = await checkSession(cookie);
    if (ok) {
      vscode.window.showInformationMessage('Programmers 연결 확인: 정상');
      return;
    }
    if (!allowLoginRetry) {
      vscode.window.showErrorMessage('Programmers 연결 확인 실패: 쿠키가 만료되었을 수 있습니다.');
      return;
    }
    await offerLoginAndRetry(
      context,
      'Programmers 연결 확인 실패: 쿠키가 만료되었을 수 있습니다.',
      () => checkConnectionOnce(context, false)
    );
  } catch (err) {
    vscode.window.showErrorMessage(`연결 확인 중 오류가 발생했습니다: ${(err as Error).message}`);
  }
}

async function openProblemOnce(
  context: vscode.ExtensionContext,
  workspaceFolder: vscode.WorkspaceFolder,
  id: string,
  allowLoginRetry: boolean
): Promise<void> {
  const cookie = await getCookie(context.secrets);
  if (!cookie) {
    if (!allowLoginRetry) {
      vscode.window.showErrorMessage('먼저 "Programmers: Set Session Cookie"로 쿠키를 설정하세요.');
      return;
    }
    await offerLoginAndRetry(context, '먼저 세션 쿠키를 설정하거나 로그인하세요.', () =>
      openProblemOnce(context, workspaceFolder, id, false)
    );
    return;
  }

  let problem: ProblemData;
  try {
    const html = await fetchProblemHtml(id, cookie);
    problem = parseProblemHtml(html, id);
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      if (!allowLoginRetry) {
        vscode.window.showErrorMessage('쿠키가 만료된 것 같습니다. 브라우저에서 다시 복사해 설정해주세요.');
        return;
      }
      await offerLoginAndRetry(context, '쿠키가 만료된 것 같습니다.', () =>
        openProblemOnce(context, workspaceFolder, id, false)
      );
    } else {
      vscode.window.showErrorMessage(`문제를 불러오지 못했습니다: ${(err as Error).message}`);
    }
    return;
  }

  const dir = path.join(workspaceFolder.uri.fsPath, '.programmers', id);
  fs.mkdirSync(dir, { recursive: true });
  const solutionPath = path.join(dir, 'solution.py');
  const casesPath = path.join(dir, 'cases.json');
  if (!fs.existsSync(solutionPath)) {
    fs.writeFileSync(solutionPath, buildSolutionFile(problem));
  }
  fs.writeFileSync(casesPath, buildCasesFile(problem));
  currentProblemDir = dir;
  await addRecentProblem(context.globalState, { id: problem.id, title: problem.title });

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
  currentPanel.reveal(vscode.ViewColumn.Two);
}

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

    vscode.commands.registerCommand('programmers.login', async () => {
      await runLoginFlow(context);
    }),

    vscode.commands.registerCommand('programmers.checkConnection', async () => {
      await checkConnectionOnce(context, true);
    }),

    vscode.commands.registerCommand('programmers.openProblem', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('먼저 워크스페이스 폴더를 여세요.');
        return;
      }

      let clipboardCandidate: string | undefined;
      try {
        clipboardCandidate = detectProblemIdCandidate(await vscode.env.clipboard.readText());
      } catch {
        clipboardCandidate = undefined;
      }

      const recent = getRecentProblems(context.globalState);

      type ProblemQuickPickItem = vscode.QuickPickItem & { id?: string; manualEntry?: boolean };
      const items: ProblemQuickPickItem[] = [];

      if (clipboardCandidate && !recent.some((p) => p.id === clipboardCandidate)) {
        items.push({ label: `📋 클립보드에서 감지됨: ${clipboardCandidate}`, id: clipboardCandidate });
      }
      for (const p of recent) {
        items.push({ label: `${p.id} — ${p.title}`, id: p.id });
      }
      items.push({ label: '✏️ 직접 입력...', manualEntry: true });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Programmers 문제를 선택하거나 직접 입력하세요',
      });
      if (!picked) return;

      let id: string;
      if (picked.manualEntry) {
        const rawInput = await vscode.window.showInputBox({
          prompt: 'Programmers 문제 번호 또는 URL을 입력하세요',
          value: clipboardCandidate,
        });
        if (!rawInput) return;
        id = extractProblemId(rawInput);
        if (!/^\d+$/.test(id)) {
          vscode.window.showErrorMessage('문제 번호를 인식하지 못했습니다. 숫자 또는 문제 페이지 URL을 입력하세요.');
          return;
        }
      } else {
        id = picked.id as string;
      }

      await openProblemOnce(context, workspaceFolder, id, true);
    }),

    vscode.commands.registerCommand('programmers.runSampleTests', async () => {
      if (!currentProblemDir) {
        vscode.window.showErrorMessage('먼저 "Programmers: Open Problem"으로 문제를 여세요.');
        return;
      }
      const solutionPath = path.join(currentProblemDir, 'solution.py');
      const casesPath = path.join(currentProblemDir, 'cases.json');

      try {
        const { results, debugOutput } = runSampleTests(solutionPath, casesPath);
        const passed = results.filter((r) => r.pass).length;
        const channel = getOutputChannel();
        channel.clear();
        channel.appendLine('(참고: 로컬 측정치이며 실제 채점 서버 성능과 다를 수 있습니다)');
        channel.appendLine(`${passed}/${results.length} 통과`);
        for (const r of results) {
          const timing = r.timeMs !== undefined ? ` (${r.timeMs}ms)` : '';
          if (r.pass) {
            channel.appendLine(`  [PASS] case ${r.index}${timing}`);
          } else if (r.error) {
            channel.appendLine(`  [FAIL] case ${r.index}: ${r.error}${timing}`);
          } else {
            channel.appendLine(
              `  [FAIL] case ${r.index}: expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}${timing}`
            );
          }
        }
        if (debugOutput) {
          channel.appendLine('');
          channel.appendLine('--- 프로그램 출력 (print) ---');
          channel.appendLine(debugOutput);
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
