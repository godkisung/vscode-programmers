# Programmers VS Code 확장 — UI 개선 3종 — Design

## 배경 / 목적

Task 11-14(UX 편의성 개선 4종) 완료 후 UI 쪽을 다시 훑어보며 발견한 개선 여지 중, GPT 설계 리뷰(`gpt-consult.sh plan`)와 사용자 확인을 거쳐 이번 라운드에 포함하기로 확정한 3가지를 다룬다.

**이번 범위에서 명시적으로 제외한 것 (사용자 확인 완료):**
- 웹뷰 패널 아이콘 — `resources/`에 아이콘 에셋이 전혀 없고 `package.json`에도 `icon` 필드가 없어, 새 이미지 에셋 제작이 필요한 별개 작업이라 판단해 이번 라운드에서 뺐다. 다음에 필요해지면 별도 스펙으로 다룬다.
- 실패 시 OutputChannel로 상세 에러 로그 유도 — 범위를 UI 폴리시 3건에만 집중하기 위해 제외. 별도 이슈로 다룬다.
- 문제 설명 본문 HTML 재구성 — GPT가 대안으로 띄웠으나(원본 HTML 직접 렌더링 대신 필요한 구조만 재구성), 실사이트 마크업이 아직 Task 9에서 검증되지 않은 상태(메인 플랜의 Global Constraints 참고)라 지금 재구성하는 건 범위 밖의 위험한 변경으로 판단. 이번엔 sanitize-html이 만드는 기존 구조를 그대로 두고 CSS만 입힌다.

## 범위

1. 웹뷰 테마 통합(VS Code CSS 변수) + CSP(Content-Security-Policy) 메타 태그 추가
2. Open Problem 실행 중 로딩 피드백 (단일 진행률 메시지)
3. Open Problem QuickPick 항목의 codicon + `description` 필드 폴리시

## 1. 웹뷰 테마 통합 + CSP

**현재:** `src/webview/render.ts`가 만드는 HTML에 `<style>` 태그가 전혀 없어, VS Code가 다크 테마여도 웹뷰는 브라우저 기본(흰 배경/검은 글씨)으로 렌더링된다. CSP도 없어 sanitize-html 하나에만 의존하고 있다.

**변경 후:** `renderProblemHtml`이 반환하는 HTML에 `<head>`가 없으므로(현재는 `<h1>`/`<div>`/`<p>`만 있는 본문 조각) `<style>` 블록과 `<meta http-equiv="Content-Security-Policy">`를 본문 맨 앞에 추가한다.

**CSP 정책 (문자열 그대로):**
```
default-src 'none'; img-src https://school.programmers.co.kr https:; style-src 'unsafe-inline';
```
- `default-src 'none'`이 스크립트를 포함한 모든 걸 기본 차단
- `img-src`는 원본 사이트 도메인 + 일반 https만 허용 (문제 설명 안 이미지는 `toAbsoluteUrl`로 이미 절대경로화되어 있고, 대부분 `school.programmers.co.kr`을 가리킴)
- `style-src 'unsafe-inline'`은 아래 `<style>` 블록 자체를 허용하기 위함 — sanitize-html 설정(`allowedTags`/`allowedAttributes`, `render.ts:7-14`)이 `style` 태그와 `style` 속성을 둘 다 허용 목록에 넣지 않으므로, 문제 설명 본문(사용자/사이트 유래 HTML)이 이 완화를 악용해 임의 스타일을 주입할 방법이 없다.

**CSS 변수 매핑 (VS Code 테마와 자동 동기화):**

| 선택자 | 스타일 |
|---|---|
| `body` | `background: var(--vscode-editor-background)`; `color: var(--vscode-editor-foreground)`; `font-family: var(--vscode-font-family)`; `font-size: var(--vscode-font-size)`; `line-height: 1.6`; `max-width: 800px`; `margin: 0 auto`; `padding: 16px` |
| `a` | `color: var(--vscode-textLink-foreground)`; `a:hover { color: var(--vscode-textLink-activeForeground) }`; `a:focus-visible { outline: 1px solid var(--vscode-focusBorder) }` |
| `code` (인라인) | `background: var(--vscode-textCodeBlock-background)`; `font-family: var(--vscode-editor-font-family)`; `padding: 0.1em 0.4em`; `border-radius: 3px` |
| `pre` | `background: var(--vscode-textCodeBlock-background)`; `padding: 12px`; `overflow-x: auto`; `border-radius: 4px` |
| `pre code` | `background: transparent`; `padding: 0` (인라인 code 스타일과 겹치지 않게) |
| `table` | `border-collapse: collapse`; `width: 100%` |
| `th`, `td` | `border: 1px solid var(--vscode-panel-border)`; `padding: 6px 10px` |
| `blockquote` | `border-left: 3px solid var(--vscode-textBlockQuote-border)`; `background: var(--vscode-textBlockQuote-background)`; `padding: 8px 12px`; `margin: 8px 0` |
| `hr` | `border: none`; `border-top: 1px solid var(--vscode-panel-border)` |
| `img` | `max-width: 100%`; `height: auto` |
| `ul`, `ol` | `padding-left: 24px` |

`renderProblemHtml`의 나머지 로직(sanitize-html 설정, `toAbsoluteUrl`, `escapeHtml`)은 그대로 둔다. `<style>`/CSP `<meta>`는 반환 문자열 맨 앞, `<h1>` 이전에 추가한다.

**참고 (구현 시 헷갈리지 않도록):** `renderProblemHtml`은 지금도 `<html>`/`<head>`/`<body>` 없이 조각(fragment) 문자열만 반환하고 있고(`currentPanel.webview.html`에 그대로 대입됨), 이 스펙도 그 구조를 바꾸지 않는다. `<meta http-equiv="Content-Security-Policy">`는 정석대로라면 `<head>` 안에 있어야 하지만, VS Code 웹뷰(Electron/Chromium)는 `<head>` 없이 문서 최상단에 있는 CSP `<meta>`도 인식해 적용한다 — 별도로 `<head>`를 새로 만들 필요 없다.

## 2. Open Problem 로딩 피드백

**현재:** `openProblemOnce`(`src/extension.ts:130` 부근)는 QuickPick에서 항목을 고른 직후 아무 피드백 없이 실행되다가, HTTP fetch + HTML 파싱 + 파일 스캐폴딩이 끝나야 에디터/웹뷰가 뜬다. 네트워크가 느리면 사용자가 커맨드가 씹혔다고 오해할 수 있다.

**변경 후:** `openProblemOnce`의 본문 전체를 `vscode.window.withProgress`로 감싼다. 기존 `runLoginFlow`(`extension.ts:36`)가 이미 쓰는 것과 동일한 패턴이다.

```typescript
await vscode.window.withProgress(
  { location: vscode.ProgressLocation.Notification, title: '문제를 불러오는 중...' },
  async () => {
    // openProblemOnce의 기존 본문 그대로 (cookie 확인부터 웹뷰 reveal까지)
  }
);
```

취소 옵션(`cancellable`)은 넣지 않는다 — 로그인 흐름과 달리 사용자가 중간에 취소해도 정리할 장기 실행 리소스(브라우저 프로세스 등)가 없고, 단일 HTTP 요청 + 로컬 파일 쓰기라 몇 초 내 자연히 끝난다. 단계별 메시지("문제 정보 가져오는 중 → 템플릿 생성 중 → 웹뷰 여는 중")도 넣지 않는다 — 전체 흐름이 짧고 순차적이라 단일 메시지로 충분하다는 판단, 사용자 확인 완료.

## 3. QuickPick 폴리시

**현재:** `programmers.openProblem` 핸들러(`extension.ts:224` 부근)가 이모지 하나로 항목을 구분한다:
- `📋 클립보드에서 감지됨: <id>`
- `<id> — <title>`
- `✏️ 직접 입력...`

**변경 후:** 이모지 대신 VS Code 표준 codicon(`$(icon-name)` 문법)을 쓰고, id/부가정보는 `label`이 아니라 `description` 필드로 분리한다.

| 항목 | `label` | `description` |
|---|---|---|
| 클립보드 감지 | `$(clippy) 클립보드에서 감지됨` | 감지된 id (예: `42840`) |
| 최근 목록 | `$(history) ${title}` | 해당 id |
| 직접 입력 | `$(edit) 직접 입력...` | (없음) |

`showQuickPick` 호출에 `matchOnDescription: true`를 추가해 문제 번호로도 필터링 가능하게 하고, `placeHolder`를 `'클립보드 감지, 최근 목록에서 선택하거나 직접 입력하세요'`로 바꾼다 (기존: `'Programmers 문제를 선택하거나 직접 입력하세요'`).

QuickPick 항목 선택 후의 로직(`picked.id`/`picked.manualEntry` 분기, 클립보드 값으로 입력창 프리필)은 그대로 둔다 — 이번 변경은 표시 방식(label/description 구성)에만 한정된다.

## 컴포넌트 변경 요약

- `src/webview/render.ts`: `renderProblemHtml`이 반환하는 문자열 앞부분에 `<style>` + CSP `<meta>` 추가
- `src/extension.ts`:
  - `openProblemOnce` 본문을 `vscode.window.withProgress`로 감싸기
  - `programmers.openProblem` 핸들러의 QuickPick 항목 구성을 codicon + `description` 방식으로 교체, `matchOnDescription: true` 및 새 placeholder 추가

## 에러 처리

이번 3건 모두 기존 에러 처리 경로를 바꾸지 않는다:
- 웹뷰 CSP/스타일 추가는 실패할 수 있는 새 동작이 없다 (정적 문자열 삽입)
- `withProgress`는 감싸는 로직의 예외를 그대로 던지므로, 기존 `openProblemOnce`의 에러 처리(쿠키 만료 시 재로그인 유도 등)는 변경 없이 동일하게 동작
- QuickPick 폴리시는 표시 방식만 바뀌므로 기존 에러 메시지("문제 번호를 인식하지 못했습니다" 등) 그대로 유지

## 테스트 전략

- `test/webview/render.test.ts`: 기존 테스트에 추가 —
  - 반환된 HTML에 `Content-Security-Policy`와 `img-src https://school.programmers.co.kr`가 포함되는지
  - `<style>` 태그와 대표 CSS 변수(예: `var(--vscode-editor-background)`) 문자열이 포함되는지
  - 기존 escaping/sanitize 테스트들이 CSP/스타일 삽입 이후에도 여전히 통과하는지 (본문 구조에 영향 없음을 확인)
- `openProblemOnce`의 `withProgress` 래핑과 QuickPick 폴리시는 `extension.ts`이므로 이 코드베이스의 기존 관례대로 단위 테스트를 추가하지 않는다 (VS Code 글루 코드, Task 13/14와 동일한 테스트 전략). Extension Development Host에서 수동 검증:
  - 문제를 열 때 "문제를 불러오는 중..." 알림이 뜨고 완료 후 사라지는지
  - QuickPick에 codicon이 정상 렌더링되는지, `description`에 id가 표시되는지, 문제 번호로 타이핑해도 필터링되는지(`matchOnDescription`)
  - 다크/라이트 테마를 전환하며 웹뷰가 테마에 맞춰 배경/글자색이 바뀌는지, 코드블록/표/링크가 읽기 편한지

## 향후 확장 (범위 밖, 참고용)

- 웹뷰 패널 아이콘 (이미지 에셋 제작 필요)
- 실패 시 OutputChannel로 상세 에러 로그 유도
- 문제 설명 본문 HTML을 원본 그대로 두지 않고 필요한 구조만 재구성 (Task 9의 실사이트 마크업 검증 이후 재검토)
- 로딩 피드백 단계별 메시지 세분화
