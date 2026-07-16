# Programmers VS Code Extension — 자동 로그인 (Playwright) — Design

## 배경 / 목적

현재 세션 쿠키는 사용자가 브라우저 DevTools Network 탭에서 `Cookie` 헤더 값을 수동으로 복사해 "Programmers: Set Session Cookie" 명령에 붙여넣는 방식으로만 설정할 수 있다. 이 과정을 자동화해 사용자가 브라우저 로그인만 하면 쿠키가 자동으로 추출/저장되도록 한다.

이 설계는 기존 스펙(`2026-07-15-programmers-vscode-extension-design.md`)의 "인증 / 설정" 섹션을 대체하지 않고 보완한다 — 기존 스펙은 "자동 브라우저 쿠키 추출/복호화는 하지 않음"이라고 명시했으나, 이번 논의에서 사용자가 방향을 자동 로그인 우선으로 전환하기로 결정했다. 수동 입력 경로는 폴백으로 유지한다.

## 범위 결정 사항

- **기본 경로**: 자동 로그인(Playwright 기반 브라우저 자동화)으로 쿠키 획득
- **폴백 경로**: 기존 "Set Session Cookie" 수동 입력은 그대로 유지. 완전 대체 아님
- **브라우저 엔진**: `playwright-core` + `channel: 'chrome'` — 사용자 PC에 이미 설치된 시스템 Chrome을 그대로 구동. 브라우저 바이너리를 별도로 다운로드하지 않음
- **로그인 완료 판정**: 별도의 URL/DOM 패턴 추측 없이, 기존 `checkSession()`(Task 6)을 재사용한 폴링 방식. Programmers의 실제 로그인 후 리다이렉트 구조를 아직 모르는 상태(Task 9 미완료)이므로, 서버에 직접 검증을 요청하는 이 방식이 마크업 추측보다 더 견고함
- **프로파일 유지**: 확장 전용 영구 브라우저 프로파일(`launchPersistentContext`)을 사용해 세션이 만료되기 전까지 재로그인 불필요. 사용자의 실제 Chrome 프로파일과는 완전히 분리
- **동작 환경 제약**: 로컬 GUI 브라우저를 실행할 수 없는 환경(원격 개발/컨테이너/WSL 등)에서는 자동 로그인을 시도하지 않고 즉시 수동 입력으로 안내

## 컴포넌트 구성

### `src/core/autoLogin.ts` (신규)

- `runAutoLogin(profileDir: string, onProgress: (msg: string) => void, signal: AbortSignal): Promise<string>`
  - `playwright-core`로 `channel: 'chrome'`, `launchPersistentContext(profileDir, { headless: false })` 실행
  - `https://school.programmers.co.kr`로 이동 (사용자가 필요 시 사이트 내 로그인 링크를 직접 클릭해 로그인 진행)
  - 2~3초 간격으로 폴링:
    1. `context.cookies()`로 쿠키 배열을 가져와 `school.programmers.co.kr` / `.programmers.co.kr` 도메인에 속한 항목만 필터링
    2. 필터링된 쿠키를 `"name=value; name2=value2"` 헤더 문자열로 변환
    3. 기존 `checkSession(cookieString)`으로 유효성 검증
    4. 성공하면 **곧바로 종료하지 않고 짧게(예: 2회) 추가 폴링**해 판정을 재확인한 뒤(리다이렉트 직후 세션 미확정 상태 방지) 브라우저를 닫고 쿠키 문자열 반환
  - `signal`이 abort되면(취소/타임아웃) 즉시 브라우저를 닫고 에러 throw
  - 브라우저 실행 자체가 실패하면(Chrome 미설치, GUI 없는 환경, 프로파일 lock 등) 구분된 에러 타입으로 즉시 throw

- 쿠키 배열 → 헤더 문자열 변환은 `filterAndFormatCookies(cookies: PlaywrightCookie[], domains: string[]): string`라는 순수 함수로 분리 (단위 테스트 대상)

- 에러 타입:
  - `BrowserLaunchError` — Chrome 미설치, 지원되지 않는 환경(GUI 없음), 또는 프로파일 lock 등 실행 자체 실패. 메시지에 원인 구분 포함
  - `LoginCancelledError` — 사용자 취소 또는 타임아웃

### `extension.ts` 변경

- 새 커맨드 `programmers.login` 등록:
  - `vscode.window.withProgress({ location: ProgressLocation.Notification, cancellable: true }, ...)`로 진행률 표시, "브라우저에서 로그인해주세요..." 메시지
  - 취소 버튼 클릭 시 `AbortController.abort()` 호출
  - 5분 타임아웃 타이머도 동일하게 abort 트리거
  - `BrowserLaunchError` 발생 시: "이 환경에서는 자동 로그인을 사용할 수 없습니다. 'Set Session Cookie'로 수동 입력해주세요" 안내. 프로파일 lock이 원인으로 추정되면 "프로파일 초기화 후 다시 시도" 액션 버튼 추가(프로파일 디렉토리 삭제 후 재시도)
  - 성공 시 `setCookie()`로 저장, "로그인 성공" 메시지
- 기존 `checkConnection`/`openProblem`의 에러 처리부에서, 쿠키 없음 또는 `AuthExpiredError` 발생 시 에러 메시지에 **[로그인]** 액션 버튼 추가 → 클릭 시 `programmers.login` 실행 → 성공하면 원래 동작(연결 확인/문제 열기)을 **정확히 1회만** 자동 재시도 (무한 재시도 방지)

### `package.json` 변경

- `dependencies`에 `playwright-core` 추가
- `contributes.commands`에 `{ "command": "programmers.login", "title": "Programmers: Login (Auto)" }` 추가

## 데이터 흐름

```
사용자가 "Programmers: Login" 실행 (또는 에러 메시지의 [로그인] 클릭)
  → withProgress 시작, AbortController 생성, 5분 타임아웃 타이머 설정
  → runAutoLogin(profileDir, onProgress, signal)
      → launchPersistentContext(channel: 'chrome', headless: false)
          → 실패 시 BrowserLaunchError throw → 폴백 안내 표시 → 종료
      → page.goto('https://school.programmers.co.kr')
      → loop until signal.aborted:
          cookies = context.cookies()
          filtered = filterAndFormatCookies(cookies, ['school.programmers.co.kr', '.programmers.co.kr'])
          if filtered && await checkSession(filtered):
            consecutiveSuccess++
            if consecutiveSuccess >= 2: break
          else:
            consecutiveSuccess = 0
          sleep(2~3s)
      → signal.aborted 상태로 루프 종료 시 LoginCancelledError throw
      → 브라우저 종료
      → 쿠키 문자열 반환
  → setCookie(context.secrets, cookieString)
  → 성공 메시지 표시
  → (원래 실행하려던 동작이 있었다면) 1회 재시도
```

## 에러 처리

| 상황 | 처리 |
|---|---|
| Chrome 미설치 / GUI 없는 환경(원격·컨테이너·WSL) | `BrowserLaunchError` → 수동 입력 폴백 안내 |
| 이전 비정상 종료로 프로파일 lock 파일 존재 | `BrowserLaunchError`(lock 감지) → "프로파일 초기화 후 재시도" 액션 버튼 |
| 사용자가 진행률 알림에서 취소 클릭 | `AbortController.abort()` → `LoginCancelledError` → 브라우저 종료, 조용히 종료(에러 알림 없음) |
| 5분 타임아웃 | 취소와 동일하게 처리하되 "시간 초과" 메시지 표시 |
| 로그인 후 폴링 중 네트워크 오류 등 예외 | 폴백 메시지로 종료 (자동 로그인 포기, 수동 입력 안내) |
| 로그인 성공 후 원래 동작(openProblem 등)이 인증 외 사유로 재실패 | 1회만 재시도하고 그 결과(성공/실패)를 그대로 사용자에게 표시 — 추가 재시도 없음 |

## 테스트 전략

- **단위 테스트**: `filterAndFormatCookies()` — 여러 도메인이 섞인 쿠키 배열 입력 시 대상 도메인만 필터링되는지, 빈 배열/매칭 없음 케이스 등을 Jest로 검증
- **수동 검증 (자동화 불가 영역)**: 실제 브라우저 구동, 실제 로그인 완료 감지, 영구 프로파일 재사용 확인, 취소/타임아웃 동작은 Task 9와 마찬가지로 사람이 직접 실행해 확인. 검증 항목:
  1. 최초 실행 시 Chrome 창이 뜨고 로그인 후 자동으로 쿠키가 저장되는지
  2. 재실행 시 이미 로그인된 상태로 즉시(또는 거의 즉시) 종료되는지 (영구 프로파일 확인)
  3. 로그인 중 취소 버튼을 누르면 브라우저가 정상 종료되는지
  4. `checkConnection` 실패 후 에러 메시지의 [로그인] 버튼이 자동 로그인 플로우로 이어지고, 성공 시 `checkConnection`이 1회 자동 재시도되는지

## 향후 확장 (범위 밖, 참고용)

- 다중 계정 전환(계정별 별도 프로파일 관리)
- Chrome 외 Edge/Firefox 등 다른 채널 자동 탐색 fallback
