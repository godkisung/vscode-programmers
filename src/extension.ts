import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCookie, setCookie } from './secretsStore';
import { fetchProblemHtml, checkSession, AuthExpiredError } from './core/fetchProblem';
import { parseProblemHtml } from './core/parser';
import { buildSolutionFile, mergeCasesFile, StoredCase } from './core/scaffold';
import { parseCaseValue } from './core/caseParser';
import { runSampleTests, TestRunCancelledError } from './core/testRunner';
import { renderProblemHtml } from './webview/render';
import { ProblemData } from './core/types';
import { buildProblemMarkdown } from './core/problemMarkdown';
import { problemUrl } from './core/urls';
import {
  resolveDataRoot,
  problemDir,
  solutionPath,
  casesPath,
  problemMdPath,
  runsLogPath,
} from './core/paths';
import {
  appendRunEvent,
  buildErrorRunEvent,
  buildRunEvent,
  RunContext,
  RunTrigger,
} from './core/runLog';
import { GitSync } from './gitSync';
import { DEFAULT_EXPORT_COMMAND, WikiExportConfig, runExport } from './wikiExport';
import { runAutoLogin, BrowserLaunchError, LoginCancelledError } from './core/autoLogin';
import { detectProblemIdCandidate } from './core/clipboardCandidate';
import { getRecentProblems, addRecentProblem } from './recentProblems';
import { ExtensionState } from './state';
import { ProblemsTreeProvider } from './sidebar';
import { createStatusBarItems } from './statusBar';
import { InlineResultsProvider } from './inlineResults';

let currentPanel: vscode.WebviewPanel | undefined;
let state: ExtensionState;
let outputChannel: vscode.OutputChannel | undefined;
let gitSync: GitSync;
/** 창을 닫을 때 남은 push를 보내기 위해 마지막으로 쓴 데이터 폴더를 기억한다. */
let lastDataRoot: string | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Programmers');
  }
  return outputChannel;
}

function getDataRoot(workspaceFolder: vscode.WorkspaceFolder): string {
  const configured = vscode.workspace.getConfiguration('programmers').get<string>('dataRoot');
  const dataRoot = resolveDataRoot(workspaceFolder.uri.fsPath, configured);
  lastDataRoot = dataRoot;
  return dataRoot;
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
    state.setConnection('ok');
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
    state.setConnection('none');
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
    state.setConnection(ok ? 'ok' : 'expired');
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

  const dataRoot = getDataRoot(workspaceFolder);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '문제를 불러오는 중...' },
    async (progress) => {
      // 다른 기기에서 푼 내용을 먼저 받아온다. 실패해도 문제 풀이는 계속한다.
      progress.report({ message: '동기화 중...' });
      await gitSync.pullBeforeOpen(dataRoot);

      let problem: ProblemData;
      try {
        const html = await fetchProblemHtml(id, cookie);
        problem = parseProblemHtml(html, id);
      } catch (err) {
        if (err instanceof AuthExpiredError) {
          state.setConnection('expired');
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

      const dir = problemDir(dataRoot, id);
      const solutionFile = solutionPath(dir);
      try {
        fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(solutionFile)) {
          fs.writeFileSync(solutionFile, buildSolutionFile(problem));
        }
        const existingCases = fs.existsSync(casesPath(dir))
          ? fs.readFileSync(casesPath(dir), 'utf-8')
          : undefined;
        fs.writeFileSync(casesPath(dir), mergeCasesFile(existingCases, problem));
      } catch (err) {
        vscode.window.showErrorMessage(
          `문제 파일을 저장하지 못했습니다: ${(err as Error).message} (programmers.dataRoot 설정을 확인하세요)`
        );
        return;
      }

      // problem.md는 실패해도 문제 풀이를 막지 않는다 — 위키용 부가 산출물이다.
      try {
        fs.writeFileSync(problemMdPath(dir), buildProblemMarkdown(problem));
      } catch (err) {
        getOutputChannel().appendLine(`[problem.md] 저장 실패: ${(err as Error).message}`);
      }

      state.setConnection('ok');
      await state.setCurrentProblem({
        id: problem.id,
        title: problem.title,
        dir,
        url: problemUrl(problem.id),
      });
      await addRecentProblem(context.globalState, { id: problem.id, title: problem.title });

      const doc = await vscode.workspace.openTextDocument(solutionFile);
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
  );
}

let autoRunInFlight = false;
let autoRunPending = false;

/**
 * runs.jsonl 기록. 로그가 실패해도 테스트 결과 자체는 이미 나왔으므로
 * 사용자 흐름을 막지 않고 출력 채널에만 남긴다.
 */
function recordRun(problemDirPath: string, event: ReturnType<typeof buildRunEvent>): void {
  try {
    appendRunEvent(runsLogPath(problemDirPath), event);
  } catch (err) {
    getOutputChannel().appendLine(`[runs.jsonl] 기록 실패: ${(err as Error).message}`);
  }
}

function readSolutionForHash(problemDirPath: string): string | undefined {
  try {
    return fs.readFileSync(solutionPath(problemDirPath), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * 전체 통과 뒤 처리: 위키 노트를 만들고 커밋한다.
 *
 * export를 먼저 돌리는 이유는 생성된 노트까지 같은 커밋에 담기 위해서다.
 * export가 실패해도 풀이 자체는 커밋한다 — 위키는 부가 가치이지 필수가 아니다.
 */
function readExportConfig(): WikiExportConfig {
  const config = vscode.workspace.getConfiguration('programmers');
  return {
    enabled: config.get<boolean>('export.onPass', false),
    command: config.get<string>('export.command', DEFAULT_EXPORT_COMMAND) || DEFAULT_EXPORT_COMMAND,
  };
}

async function finishPass(problem: { id: string; title: string; dir: string }): Promise<void> {
  const extraPaths: string[] = [];
  const config = readExportConfig();

  if (config.enabled) {
    const repoRoot = await gitSync.repoRoot(problem.dir);
    if (repoRoot) {
      const channel = getOutputChannel();
      try {
        const output = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Window, title: '위키 노트 생성 중...' },
          () => runExport({ cwd: repoRoot, problemId: problem.id, command: config.command })
        );
        channel.appendLine(`[wiki] ${problem.id}\n${output}`);
        const vault = path.join(repoRoot, 'vault');
        if (fs.existsSync(vault)) extraPaths.push(vault);
      } catch (err) {
        channel.appendLine(`[wiki] export 실패: ${(err as Error).message}`);
        vscode.window.showWarningMessage(`위키 노트 생성 실패: ${(err as Error).message}`);
      }
    }
  }

  await gitSync.commitOnPass(problem.dir, { id: problem.id, title: problem.title }, extraPaths);
}

async function runTestsForCurrentProblem(trigger: RunTrigger): Promise<void> {
  const reveal = trigger === 'manual';
  const problem = state.currentProblem;
  if (!problem) {
    if (reveal) {
      vscode.window.showErrorMessage('먼저 "Programmers: Open Problem"으로 문제를 여세요.');
    }
    return;
  }
  const solutionFile = solutionPath(problem.dir);
  const casesFile = casesPath(problem.dir);
  const runContext: RunContext = { trigger, code: readSolutionForHash(problem.dir) };

  try {
    const { results, debugOutput } = await vscode.window.withProgress(
      {
        location: reveal ? vscode.ProgressLocation.Notification : vscode.ProgressLocation.Window,
        title: '샘플 테스트 실행 중...',
        cancellable: reveal,
      },
      (_progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        return runSampleTests(solutionFile, casesFile, { signal: controller.signal });
      }
    );
    state.setLastRun({ results, debugOutput });
    recordRun(problem.dir, buildRunEvent(results, runContext));
    const passed = results.filter((r) => r.pass).length;
    // 전체 통과했을 때만 위키로 내보내고 커밋한다 — 풀다 만 코드로 히스토리를 채우지 않는다.
    if (results.length > 0 && passed === results.length) {
      void finishPass(problem);
    }
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
    if (reveal) {
      channel.show();
    }
  } catch (err) {
    if (err instanceof TestRunCancelledError) {
      vscode.window.showInformationMessage('테스트 실행을 취소했습니다.');
      return;
    }
    // 취소는 시도가 아니지만, 실행 실패(문법 오류·타임아웃)는 기록할 가치가 있는 시행착오다.
    recordRun(problem.dir, buildErrorRunEvent(runContext));
    if (reveal) {
      vscode.window.showErrorMessage(`테스트 실행 실패: ${(err as Error).message}`);
    } else {
      getOutputChannel().appendLine(`[자동 실행] 테스트 실행 실패: ${(err as Error).message}`);
      vscode.window.showWarningMessage(`자동 테스트 실행 실패: ${(err as Error).message}`);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  state = new ExtensionState(context.workspaceState);
  state.restore((p) => fs.existsSync(solutionPath(p.dir)));

  gitSync = new GitSync((message) => getOutputChannel().appendLine(message));
  context.subscriptions.push(gitSync);

  const treeProvider = new ProblemsTreeProvider(state, context.globalState, context.subscriptions);
  context.subscriptions.push(
    vscode.window.createTreeView('programmersProblems', { treeDataProvider: treeProvider })
  );

  createStatusBarItems(state, context.subscriptions);
  new InlineResultsProvider(state, context.subscriptions);

  // 시작 시 백그라운드로 연결 상태 확인 (실패 시 unknown 유지)
  void (async () => {
    const cookie = await getCookie(context.secrets);
    if (!cookie) {
      state.setConnection('none');
      return;
    }
    try {
      state.setConnection((await checkSession(cookie)) ? 'ok' : 'expired');
    } catch (err) {
      // 네트워크 오류 등 — unknown 유지, 원인만 기록
      getOutputChannel().appendLine(`[startup] 연결 확인 실패: ${(err as Error).message}`);
    }
  })();

  context.subscriptions.push(
    vscode.commands.registerCommand('programmers.openProblemById', async (id: string) => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('먼저 워크스페이스 폴더를 여세요.');
        return;
      }
      await openProblemOnce(context, workspaceFolder, id, true);
    }),

    vscode.commands.registerCommand('programmers.revealSolution', async () => {
      const problem = state.currentProblem;
      if (!problem) return;
      try {
        const doc = await vscode.workspace.openTextDocument(solutionPath(problem.dir));
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      } catch {
        vscode.window.showErrorMessage(
          'solution.py를 열지 못했습니다. 파일이 삭제되었으면 "Programmers: Open Problem"으로 다시 여세요.'
        );
      }
    })
  );

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
        items.push({
          label: '$(clippy) 클립보드에서 감지됨',
          description: clipboardCandidate,
          id: clipboardCandidate,
        });
      }
      for (const p of recent) {
        items.push({ label: `$(history) ${p.title}`, description: p.id, id: p.id });
      }
      items.push({ label: '$(edit) 직접 입력...', manualEntry: true });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: '클립보드 감지, 최근 목록에서 선택하거나 직접 입력하세요',
        matchOnDescription: true,
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
      await runTestsForCurrentProblem('manual');
    }),

    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!vscode.workspace.getConfiguration('programmers').get<boolean>('runTestsOnSave', true)) {
        return;
      }
      const problem = state.currentProblem;
      if (!problem || doc.uri.fsPath !== solutionPath(problem.dir)) return;
      if (autoRunInFlight) {
        autoRunPending = true;
        return;
      }
      autoRunInFlight = true;
      try {
        do {
          autoRunPending = false;
          await runTestsForCurrentProblem('save');
        } while (autoRunPending);
      } finally {
        autoRunInFlight = false;
      }
    }),

    vscode.commands.registerCommand('programmers.addTestCase', async () => {
      const problem = state.currentProblem;
      if (!problem) {
        vscode.window.showErrorMessage('먼저 "Programmers: Open Problem"으로 문제를 여세요.');
        return;
      }
      const casesFile = casesPath(problem.dir);

      const inputsText = await vscode.window.showInputBox({
        prompt: '입력값을 쉼표로 구분해 입력하세요 (예: [1, 2, 3], "abc")',
        ignoreFocusOut: true,
      });
      if (inputsText === undefined) return;
      const parsedInputs = parseCaseValue(`[${inputsText}]`);
      if (!parsedInputs.ok || !Array.isArray(parsedInputs.value)) {
        vscode.window.showErrorMessage('입력값을 해석하지 못했습니다. JSON/파이썬 리터럴 형식으로 입력하세요.');
        return;
      }

      const outputText = await vscode.window.showInputBox({
        prompt: '기대 출력값을 입력하세요 (예: "leo" 또는 [1, 2])',
        ignoreFocusOut: true,
      });
      if (outputText === undefined) return;
      const parsedOutput = parseCaseValue(outputText);
      if (!parsedOutput.ok) {
        vscode.window.showErrorMessage('출력값을 해석하지 못했습니다. JSON/파이썬 리터럴 형식으로 입력하세요.');
        return;
      }

      let cases: StoredCase[] = [];
      try {
        const parsed = JSON.parse(fs.readFileSync(casesFile, 'utf-8'));
        if (Array.isArray(parsed)) cases = parsed;
      } catch {
        // 파일이 없거나 손상됨 — 새 배열로 시작
      }
      cases.push({ inputs: parsedInputs.value, output: parsedOutput.value, source: 'custom' });
      try {
        fs.mkdirSync(problem.dir, { recursive: true });
        fs.writeFileSync(casesFile, JSON.stringify(cases, null, 2));
      } catch (err) {
        vscode.window.showErrorMessage(`cases.json을 저장하지 못했습니다: ${(err as Error).message}`);
        return;
      }

      const choice = await vscode.window.showInformationMessage(
        `커스텀 테스트 케이스를 추가했습니다 (총 ${cases.length}개).`,
        '테스트 실행'
      );
      if (choice === '테스트 실행') {
        await vscode.commands.executeCommand('programmers.runSampleTests');
      }
    }),

    vscode.commands.registerCommand('programmers.copySolutionForSubmit', async () => {
      const problem = state.currentProblem;
      if (!problem) {
        vscode.window.showErrorMessage('먼저 "Programmers: Open Problem"으로 문제를 여세요.');
        return;
      }

      let code: string;
      try {
        code = fs.readFileSync(solutionPath(problem.dir), 'utf-8');
      } catch (err) {
        vscode.window.showErrorMessage(`코드를 읽지 못했습니다: ${(err as Error).message}`);
        return;
      }

      await vscode.env.clipboard.writeText(code);
      const choice = await vscode.window.showInformationMessage(
        '제출용 코드를 클립보드에 복사했습니다.',
        '웹사이트에서 열기'
      );
      if (choice === '웹사이트에서 열기') {
        await vscode.env.openExternal(vscode.Uri.parse(problem.url));
      }
    })
  );
}

export async function deactivate(): Promise<void> {
  // 디바운스 대기 중인 push가 있으면 창이 닫히기 전에 보낸다.
  if (gitSync && lastDataRoot) {
    await gitSync.flush(lastDataRoot);
  }
}

function extractProblemId(input: string): string {
  const match = input.match(/lessons\/(\d+)/);
  return match ? match[1] : input.trim();
}
