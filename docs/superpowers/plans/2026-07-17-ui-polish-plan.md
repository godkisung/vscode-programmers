# UI Polish (3 features) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish three UI surfaces of the Programmers VS Code extension: theme the problem webview with VS Code CSS variables and lock it down with a CSP, show progress feedback while a problem loads, and replace the Open Problem QuickPick's emoji markers with codicons + `description` fields.

**Architecture:** No new modules. Two existing files change: `src/webview/render.ts` (pure, unit-testable — gains a `<style>` block and a CSP `<meta>` tag prepended to its existing returned HTML fragment) and `src/extension.ts` (VS Code glue code, no unit tests in this codebase — `openProblemOnce` gains a `withProgress` wrapper, and the `programmers.openProblem` QuickPick item construction changes its `label`/`description` fields).

**Tech Stack:** TypeScript, VS Code Extension API, Jest + ts-jest, sanitize-html.

## Global Constraints

- Do not change `renderProblemHtml`'s existing HTML structure or its `sanitizeHtml` configuration (`allowedTags`/`allowedAttributes`/`transformTags`) — this plan only adds a `<style>` block and a CSP `<meta>` tag on top of the existing output. Restructuring the problem-description markup is explicitly out of scope (real site markup is still unverified per the main plan's Task 9).
- The CSP policy string is exact and must be reproduced verbatim: `default-src 'none'; img-src https://school.programmers.co.kr https:; style-src 'unsafe-inline';`
- `openProblemOnce`'s progress indicator is a single non-cancellable message (`'문제를 불러오는 중...'`) — no staged/multi-step progress text, no `cancellable: true`.
- No new error-handling behavior in this plan — do not add OutputChannel logging for failures (explicitly deferred, per `docs/superpowers/specs/2026-07-17-ui-polish-design.md`).
- Webview panel icon is out of scope for this plan (no icon asset exists in the repo yet; deferred to a future spec).

---

## Task 15: Webview theming + CSP

**Files:**
- Modify: `src/webview/render.ts`
- Modify: `test/webview/render.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderProblemHtml(problem: ProblemData): string` — signature unchanged; only the returned string's content changes (gains a leading CSP `<meta>` and `<style>` block). No other task in this plan consumes this function.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the existing `describe('renderProblemHtml', ...)` block in `test/webview/render.test.ts` (add them after the last existing test, before the closing `});`):

```typescript
  test('includes a Content-Security-Policy meta tag restricting scripts and images', () => {
    const html = renderProblemHtml(problem);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('img-src https://school.programmers.co.kr https:');
    expect(html).toContain("style-src 'unsafe-inline'");
  });

  test('includes a style block themed with VS Code CSS variables', () => {
    const html = renderProblemHtml(problem);
    expect(html).toContain('<style>');
    expect(html).toContain('var(--vscode-editor-background)');
    expect(html).toContain('var(--vscode-editor-foreground)');
  });
```

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `npx jest test/webview/render.test.ts`
Expected: FAIL — 2 failing (the new CSP/style tests), 6 passing (the existing tests, unaffected).

- [ ] **Step 3: Add the CSP meta tag and themed style block**

Replace the full contents of `src/webview/render.ts` with:

```typescript
import sanitizeHtml from 'sanitize-html';
import { ProblemData } from '../core/types';

const ORIGIN = 'https://school.programmers.co.kr';

const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https://school.programmers.co.kr https:; style-src \'unsafe-inline\';">';

const STYLE = `
  <style>
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 16px;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }
    a:hover {
      color: var(--vscode-textLink-activeForeground);
    }
    a:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family);
      padding: 0.1em 0.4em;
      border-radius: 3px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      overflow-x: auto;
      border-radius: 4px;
    }
    pre code {
      background: transparent;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 10px;
    }
    blockquote {
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      background: var(--vscode-textBlockQuote-background);
      padding: 8px 12px;
      margin: 8px 0;
    }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
    }
    img {
      max-width: 100%;
      height: auto;
    }
    ul, ol {
      padding-left: 24px;
    }
  </style>
`;

export function renderProblemHtml(problem: ProblemData): string {
  const sanitized = sanitizeHtml(problem.descriptionHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedSchemes: ['http', 'https'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt'],
      a: ['href', 'rel'],
    },
    transformTags: {
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, src: toAbsoluteUrl(attribs.src) },
      }),
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, href: toAbsoluteUrl(attribs.href), rel: 'noopener noreferrer' },
      }),
    },
  });

  const originalUrl = `${ORIGIN}/learn/courses/30/lessons/${problem.id}`;

  return `
    ${CSP_META}
    ${STYLE}
    <h1>${escapeHtml(problem.title)}</h1>
    <div>${sanitized}</div>
    <p><a href="${originalUrl}">원본 페이지에서 보기</a></p>
  `;
}

function toAbsoluteUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('#')) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  return new URL(url, ORIGIN).toString();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

Note: `renderProblemHtml` still returns a bare fragment (no `<html>`/`<head>`/`<body>`), matching its existing contract — the CSP `<meta>` and `<style>` are simply prepended before the `<h1>`. VS Code's webview (Chromium) applies a CSP `<meta>` tag wherever it appears in the document, so no `<head>` wrapper is needed.

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx jest test/webview/render.test.ts`
Expected: PASS (8 tests — the original 6 plus the 2 new ones)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (71 tests, 10 suites — the existing 69 plus the 2 new ones)

- [ ] **Step 6: Verify compilation**

Run: `npm run compile`
Expected: exits 0

- [ ] **Step 7: Commit**

```bash
git add src/webview/render.ts test/webview/render.test.ts
git commit -m "feat: theme the problem webview with VS Code CSS variables and add a CSP"
```

---

## Task 16: Open Problem loading feedback + QuickPick polish

Implements design sections 2 and 3 of `docs/superpowers/specs/2026-07-17-ui-polish-design.md`. No new automated tests — `extension.ts` has no existing unit-test coverage in this codebase (VS Code glue code); this task follows the same manual-verification pattern already used for Tasks 13/14.

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Wrap `openProblemOnce`'s fetch/scaffold/render logic in a progress notification**

In `src/extension.ts`, replace the full body of `openProblemOnce` (everything from the function signature through its closing `}`) — currently:

```typescript
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
  currentProblemUrl = `https://school.programmers.co.kr/learn/courses/30/lessons/${problem.id}`;
  await context.workspaceState.update(CURRENT_PROBLEM_URL_KEY, currentProblemUrl);
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
```

with:

```typescript
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

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '문제를 불러오는 중...' },
    async () => {
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
      currentProblemUrl = `https://school.programmers.co.kr/learn/courses/30/lessons/${problem.id}`;
      await context.workspaceState.update(CURRENT_PROBLEM_URL_KEY, currentProblemUrl);
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
  );
}
```

Only the cookie-check branch (which shows its own dialog/prompt immediately, before any network activity) stays outside the progress notification — everything from the network fetch through the webview reveal is wrapped. `cancellable` is intentionally omitted (defaults to `false`): unlike the login flow, there is no long-running external process to cancel here, just a single HTTP request and local file writes.

- [ ] **Step 2: Replace the QuickPick item construction with codicons + `description`**

In `src/extension.ts`, inside the `programmers.openProblem` command handler, change:

```typescript
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
```

to:

```typescript
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
```

The rest of the handler (the `picked.manualEntry`/`picked.id` branching below this block) is unchanged — `ProblemQuickPickItem` already types `id`/`manualEntry` as optional fields alongside the standard `vscode.QuickPickItem` (which already includes `description`), so no type changes are needed.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (71 tests, 10 suites — unchanged from Task 15; this task adds no new unit tests)

- [ ] **Step 4: Verify compilation**

Run: `npm run compile`
Expected: exits 0

- [ ] **Step 5: Manual verification in the Extension Development Host**

1. Press `F5`, open a workspace folder in the Extension Development Host.
2. Run "Programmers: Open Problem" and select a problem — expect a "문제를 불러오는 중..." notification to appear immediately after picking, and disappear once the editor/webview opens. It should not be cancellable (no "Cancel" affordance on the notification).
3. In the same QuickPick, confirm the clipboard-detected item (if any) renders with a clipboard icon (not `📋`) followed by "클립보드에서 감지됨", with the detected id shown as dimmed description text to its right — not appended to the label text.
4. Confirm recent-list items render with a history-clock icon and the title as the label, id as the dimmed description.
5. Confirm "직접 입력..." renders with a pencil/edit icon.
6. Type a problem's numeric id (not its title) into the QuickPick filter box and confirm it still matches the corresponding recent-list item (verifies `matchOnDescription`).
7. Open a problem, then toggle VS Code between a dark and a light theme (`Ctrl+K Ctrl+T` / Command Palette → "Preferences: Color Theme") while the webview panel is visible — confirm the background/text color, links, and any code blocks or tables in the description switch to match the active theme without a manual reload.
8. In the same webview, open DevTools (Help → Toggle Developer Tools, or right-click the webview → Inspect) and confirm no CSP violation errors are logged to the console for the images that do load; confirm no inline `<script>` executes (there shouldn't be any in the sanitized content to begin with, but this confirms the CSP isn't itself breaking legitimate content).

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add loading progress to Open Problem and codicon-based QuickPick items"
```
