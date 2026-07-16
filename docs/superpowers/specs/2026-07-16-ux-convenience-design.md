# Programmers VS Code 확장 — 사용자 편의성 개선 4종 — Design

## 배경 / 목적

"Programmers: Open Problem"이 매번 문제 번호/URL을 손으로 입력창에 타이핑해야 하는 불편함을 계기로, 실사용 흐름을 더 매끄럽게 만드는 4가지 편의 기능을 함께 설계한다. GPT 리뷰를 거쳐 오탐 방지, 상태 저장 방식, 에러 처리 관점의 보강을 반영했다.

## 범위

1. Open Problem을 QuickPick 기반으로 통합 (클립보드 자동 감지 + 최근 열어본 문제 목록)
2. 제출용 코드 클립보드 복사
3. 샘플 테스트 실행 시간 측정 표시

## 1. Open Problem: 클립보드 자동 감지 + 최근 목록 (QuickPick 통합)

**현재:** `showInputBox`로 바로 문제 번호/URL을 입력받음.

**변경 후 흐름:**

1. `programmers.openProblem` 실행 시 `vscode.env.clipboard.readText()`로 클립보드를 먼저 확인
2. 클립보드 후보로 인정하는 조건 (오탐 방지, GPT 리뷰 반영):
   - `lessons/(\d+)` 패턴이 포함된 URL이면 항상 후보로 인정 (URL 형태는 우연히 일치할 가능성이 낮음)
   - 순수 숫자 문자열이면 **4~6자리일 때만** 후보로 인정 (Programmers 문제 ID 관례 범위). 그 외 자리수는 오탐 가능성이 높아 무시
3. `vscode.window.showQuickPick()`으로 다음을 순서대로 표시:
   - (클립보드 후보가 있고, 최근 목록에 이미 없는 id라면) `📋 클립보드에서 감지됨: <id>`
   - 최근 열어본 문제 목록 (최신순, 최대 10개, `<id> — <title>` 형식)
   - `✏️ 직접 입력...` (항상 마지막)
   - 클립보드 후보가 최근 목록에 이미 있는 id와 같으면 중복 표시하지 않음 (dedupe)
4. 목록/클립보드 항목 선택 → 해당 id로 바로 `openProblemOnce` 호출
5. "직접 입력" 선택 → 기존 `showInputBox` (클립보드 후보가 있으면 `value`에 미리 채움, 사용자가 수정 가능)

**저장:** `context.globalState`, 키 `programmers.recentProblems`, 값 `{ id: string; title: string }[]`.
- 워크스페이스가 아니라 **global**로 저장 — 문제 풀이는 워크스페이스와 무관하게 이어지는 경우가 많음
- **`openProblemOnce`가 문제를 성공적으로 파싱해 스캐폴딩까지 마친 시점에만** 해당 항목을 추가 (실패/부분 실패 시 저장 안 함 — GPT 리뷰 반영, 저장 시점을 명확히 함)
- 동일 id가 이미 있으면 제거 후 맨 앞에 재삽입 (최신순 유지, 중복 방지)
- 최대 10개로 자름 (11번째부터 오래된 것 제거)
- 향후 필요해지면 `workspaceState`로 전환하거나 전역/워크스페이스를 사용자가 선택할 수 있게 확장 가능하도록, 저장 접근을 별도 함수(`getRecentProblems`/`addRecentProblem`)로 캡슐화해 둔다 (지금 당장 그 옵션을 만들지는 않음 — YAGNI)

## 2. 제출용 코드 클립보드 복사

새 커맨드 `programmers.copySolutionForSubmit` 추가:

- `currentProblemDir`가 없으면 "먼저 Open Problem으로 문제를 여세요" 에러 표시 후 종료
- `solution.py`를 읽어 `vscode.env.clipboard.writeText()`로 복사
  - 읽기 실패(파일 없음/권한 오류 등) 시 `테스트 실행 실패` 패턴과 동일한 스타일로 명확한 에러 메시지 표시 (GPT 리뷰 반영)
- 성공 메시지에 액션 버튼 `웹사이트에서 열기` 추가 → 클릭 시 `vscode.env.openExternal()`로 실제 문제 URL을 기본 브라우저로 오픈
- **상태 저장 (GPT 리뷰 반영):** 현재 열린 문제의 URL을 모듈 변수 `currentProblemUrl`뿐 아니라 `context.workspaceState`(키: `programmers.currentProblemUrl`)에도 함께 저장. VS Code 창이 리로드되어 모듈 변수가 초기화되어도, `copySolutionForSubmit` 실행 시 `currentProblemDir`가 없으면 `workspaceState`에서 마지막 문제 URL을 복구 시도 — 단, `currentProblemDir`(로컬 파일 경로) 자체는 여전히 메모리 상태로만 유지한다 (다중 문제 동시 세션 미지원은 기존 스펙에서 이미 명시적으로 배제한 범위이며, 이번 변경으로 그 범위를 넓히지 않는다)

## 3. 샘플 테스트 실행 시간 측정

- `resources/runner.py`: 각 케이스마다 `solution(*inputs)` 호출 직전/직후 `time.perf_counter()`로 측정, 결과 dict에 `"timeMs": round((끝 - 시작) * 1000, 2)` 추가 (Python 인터프리터 자체의 시작 시간은 measurement 범위 밖 — 순수 함수 호출 시간만 측정)
- `RunResult` 타입(`src/core/types.ts`)에 `timeMs?: number` 필드 추가
- 출력 채널 표시 형식: `[PASS] case 0 (12.3ms)` / `[FAIL] case 0: ... (8.1ms)`
- **UI 문구에 참고용임을 명시** (GPT 리뷰 반영): 출력 채널 상단에 한 줄 안내 추가 — `(참고: 로컬 측정치이며 실제 채점 서버 성능과 다를 수 있습니다)`

## 컴포넌트 변경 요약

- `src/extension.ts`: `openProblem` 커맨드 핸들러를 QuickPick 기반으로 변경, 새 커맨드 `copySolutionForSubmit` 추가, `currentProblemUrl` 모듈 변수 + workspaceState 동기화 추가
- 신규 헬퍼 모듈 `src/recentProblems.ts`: `getRecentProblems(memento)`, `addRecentProblem(memento, entry)` — globalState 접근을 캡슐화 (extension.ts에서 직접 API 호출하지 않도록 분리)
- `resources/runner.py`: 케이스별 타이밍 측정 추가
- `src/core/types.ts`: `RunResult.timeMs?: number` 추가
- `package.json`: `contributes.commands`에 `{ "command": "programmers.copySolutionForSubmit", "title": "Programmers: Copy Solution for Submission" }` 추가

## 에러 처리

| 상황 | 처리 |
|---|---|
| 클립보드 읽기 실패(권한 등) | 조용히 무시하고 클립보드 후보 없이 QuickPick 진행 |
| `copySolutionForSubmit` 실행 시 `currentProblemDir` 없음, workspaceState에도 기록 없음 | "먼저 Open Problem으로 문제를 여세요" 에러 |
| `solution.py` 읽기 실패 | "코드를 읽지 못했습니다: {메시지}" 에러 |
| 최근 목록에 항목 10개 초과 | 오래된 것부터 잘라냄 (조용히, 에러 아님) |

## 테스트 전략

- `src/recentProblems.ts`의 `getRecentProblems`/`addRecentProblem`: 순수 로직(메모리 내 Memento 목(mock) 객체로 유닛 테스트) — 추가/중복 제거/10개 캡 동작 검증
- 클립보드 후보 판별 로직(URL 패턴 매칭, 4~6자리 숫자 판별)은 순수 함수로 분리해 유닛 테스트
- `resources/runner.py`의 타이밍 측정: `test/core/testRunner.test.ts`에 `timeMs`가 숫자로 존재하고 0 이상인지 확인하는 테스트 추가 (정확한 값은 타이밍이라 검증하지 않음)
- QuickPick UI 자체, `copySolutionForSubmit`의 클립보드/외부 브라우저 연동은 기존 Task 8/10 패턴과 동일하게 Extension Development Host에서 수동 검증

## 향후 확장 (범위 밖, 참고용)

- 최근 목록을 workspace별로 분리하는 옵션 (설정으로 노출)
- 여러 문제를 동시에 열어둔 세션 추적 (다중 `currentProblemDir` 지원)
- QuickPick에 문제 난이도/태그 표시 (실사이트 마크업 확인 필요)
