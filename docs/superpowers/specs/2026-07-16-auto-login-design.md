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

## 확인된 제한사항: 구글 계정 연동 로그인 차단 (실사용 테스트 결과)

**증상:** Programmers 계정이 구글(Google) 소셜 로그인으로 연동된 사용자가 자동 로그인 창에서 구글 로그인을 시도하면, 이메일/비밀번호(및 2단계 인증)를 정상적으로 입력해도 구글이 다음 메시지로 로그인 자체를 거부한다:

> Couldn't sign you in — This browser or app may not be secure.

**원인:** `chromium.launchPersistentContext()`로 Playwright가 직접 실행한 Chrome은 CDP(Chrome DevTools Protocol)가 처음부터 연결된 "자동화 제어 브라우저" 상태로 뜬다. 구글은 OAuth 로그인 시 이 상태를 감지해 보안상 이유로 차단한다. 이는 프로필 문제가 아니라 **구글이 자동화 도구로 제어되는 브라우저의 OAuth 로그인을 정책적으로 차단**하는 것이며, Playwright/Puppeteer 기반 자동화에서 널리 보고된 현상이다 ([microsoft/playwright#19420](https://github.com/microsoft/playwright/issues/19420), [microsoft/playwright#3060](https://github.com/microsoft/playwright/issues/3060)).

**채택하지 않는 대응 (명시적 배제):** `navigator.webdriver` 값을 숨기거나 자동화 관련 플래그를 지우는 "스텔스" 기법은 구글의 봇 탐지를 의도적으로 우회하는 것으로, 구글 이용약관 위반 소지가 있고 구글이 탐지 방식을 바꾸면 다시 막히는 등 근본적으로 불안정하다. 이 프로젝트에서는 이런 우회 기법을 사용하지 않는다.

**리서치한 대안:**

1. **로그인은 순수 Chrome으로, 쿠키 읽기만 사후 CDP 연결 (권장 후보)** — Playwright의 `launchPersistentContext`로 Chrome을 "실행"하는 대신, `child_process`로 일반 Chrome 프로세스를 `--remote-debugging-port=<port>`만 열어서 띄운다(Playwright 자체 launch 플래그 없이). 사용자는 이 Chrome 창에서 완전히 정상적인(자동화 감지 트리거 없는) 상태로 로그인한다. 로그인이 끝난 뒤에야 `chromium.connectOverCDP('http://localhost:<port>')`로 붙어서 쿠키만 읽어온다. 로그인 시점에는 CDP가 전혀 개입하지 않으므로 구글의 자동화 감지에 걸리지 않는다 — 이미 커뮤니티에서 검증된 패턴이다 ([Sunwood-ai-labs/logged-in-google-chrome-skill](https://github.com/Sunwood-ai-labs/logged-in-google-chrome-skill)). 다만 Chrome 실행 자체를 Playwright의 `channel: 'chrome'` 해석 없이 직접 관리해야 하고(바이너리 경로 탐색, 포트 충돌 처리, 프로세스 생명주기 관리), 아키텍처 변경 폭이 있어 별도 설계/구현 사이클이 필요하다.
2. **사용자의 실제(기본) Chrome 프로필에서 쿠키 파일을 직접 읽어 복호화** (예: [`@mherod/get-cookie`](https://github.com/mherod/get-cookie), macOS Keychain/Windows DPAPI/Linux 키링 기반 복호화) — 브라우저 자동화 자체가 필요 없어 구글 차단과 무관하지만, (a) 격리된 전용 프로필이 아니라 사용자의 실제 기본 프로필과 OS 키체인에 접근해야 해서 이 프로젝트의 "실제 프로필과 분리" 원칙과 배치되고, (b) 복호화 방식이 OS/Chrome 버전마다 달라 유지보수 부담이 크고, (c) 신뢰도가 검증되지 않은 서드파티 의존성이 키체인 접근 권한까지 요구해 보안 표면이 넓어진다. **권장하지 않음.**

**결론:** 대안 1(사후 CDP 연결)로 전환하기로 결정. 아래 "개정: CDP 사후 연결 방식으로 전환" 섹션이 최종 설계이며, 이 섹션 위의 "컴포넌트 구성"/"데이터 흐름"/"에러 처리" 중 `launchPersistentContext` 관련 서술은 이 개정으로 대체된다 (쿠키 필터링/폴링/재시도 로직 등 나머지는 그대로 유지).

## 개정: CDP 사후 연결 방식으로 전환

**핵심 변경:** `chromium.launchPersistentContext()`로 Playwright가 Chrome을 직접 실행하던 것을, "Chrome을 순수 프로세스로 띄우고 로그인이 끝난 뒤에만 Playwright가 CDP로 붙는" 구조로 바꾼다. 로그인이 진행되는 동안 CDP가 전혀 개입하지 않으므로 구글이 감지할 "자동화 제어 브라우저" 상태 자체가 없다.

**영향 범위:** `runAutoLogin(profileDir, signal): Promise<string>`의 외부 시그니처(입력/출력/에러 타입)는 그대로 유지된다. 따라서 **`src/extension.ts`는 수정 불필요** — 변경은 `src/core/autoLogin.ts` 내부 구현으로 국한된다. 쿠키 도메인 필터링, `checkSession()` 기반 폴링(2회 연속 성공 판정), `signal` 기반 취소/타임아웃 처리는 기존 로직을 그대로 재사용한다.

### 컴포넌트 (모두 `src/core/autoLogin.ts` 내부, 신규/변경)

1. **`resolveChromeExecutable()`** — OS별 후보 경로 배열 중 실제 존재하는 첫 경로를 선택하는 순수 함수. 파일시스템 체크 함수를 인자로 주입해 유닛 테스트 가능하게 한다 (`parser.ts`의 `TITLE_SELECTORS` 등과 동일한 "후보 배열 + 첫 매치" 스타일).
   - Linux: `/opt/google/chrome/chrome`, `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Windows: `%ProgramFiles%/Google/Chrome/Application/chrome.exe`, `%ProgramFiles(x86)%/Google/Chrome/Application/chrome.exe`
   - 세 플랫폼 모두 1순위 후보가 래퍼 스크립트가 아니라 **실제 바이너리 자체**다 (`/usr/bin/google-chrome`류의 쉘 스크립트가 아님). 이 덕분에 종료 시 `child.kill()`이 fork/exec 체인 없이 실제 프로세스를 바로 잡는다 (아래 "종료 처리" 참고).
2. **`spawnChrome(execPath, profileDir)`** — `child_process.spawn`으로 다음 인자만으로 실행: `--user-data-dir=<profileDir> --remote-debugging-port=0 --no-first-run --no-default-browser-check --new-window https://school.programmers.co.kr`. **포트는 하드코딩하지 않고 `0`(OS가 빈 포트 자동 배정)을 사용한다** — 고정 포트 충돌 가능성을 원천 제거.
3. **`waitForDevToolsActivePort(profileDir, timeoutMs=15000)`** — Chrome은 `--remote-debugging-port=0`로 뜨면 실제 배정된 포트 번호를 자기 프로필 디렉토리 안의 `<profileDir>/DevToolsActivePort` 파일 첫 줄에 직접 써준다 (Puppeteer 등 주요 도구가 실제 사용하는 방식). 이 파일이 생성될 때까지 짧은 간격으로 폴링해 포트 번호를 읽어 반환한다. 이 방식은 포트 충돌뿐 아니라 "이게 정말 내가 띄운 Chrome이 맞는가"까지 함께 해결한다 — 그 파일은 우리 전용 프로필 디렉토리 안에만 존재하므로, 거기서 읽은 포트는 정의상 우리가 방금 띄운 프로세스의 것이다. 타임아웃 시 `BrowserLaunchError`.
4. **`runAutoLogin(profileDir, signal)` 재작성:**
   - `resolveChromeExecutable()` 실패 → `BrowserLaunchError`
   - `spawnChrome()` 실패(spawn 자체 에러) → `BrowserLaunchError`
   - `waitForDevToolsActivePort()`로 포트 확보 → 실패/타임아웃 → `BrowserLaunchError`
   - `chromium.connectOverCDP('http://127.0.0.1:<port>')`로 연결 → 컨텍스트(cookies) 획득
   - 이후 쿠키 폴링·판정 로직은 기존 Task 10 구현 그대로
   - **종료 처리:** 성공/취소/에러 등 모든 종료 경로에서 spawn한 child process를 **직접 `kill()`**한다. `connectOverCDP()`로 얻은 `Browser`를 `.close()`해도 Playwright가 이 브라우저의 생명주기를 소유하지 않으므로 실제 프로세스는 안 죽고 연결만 끊어지기 때문이다 (Playwright 공식 동작). 로그인 성공 후 Chrome 프로세스는 **매번 종료**하기로 결정했다 — 백그라운드 유지는 구현 복잡도만 늘리고 이번 범위에서는 이득이 적음.

### 알려진 리스크 (대응 코드 없음, 문서화만)

- 이 방식은 "로그인 시점에 CDP가 개입하지 않는다"는 사실에 의존한다. 구글이 향후 탐지 로직을 강화해 "디버깅 포트가 열려있다는 사실"까지 감지하게 되면 이 방식도 다시 막힐 수 있다. 이 프로젝트는 이런 우회 기법 자체를 "봇 탐지를 속이기 위한 스텔스"로 채택한 게 아니라 "로그인 시점에 자동화가 실제로 개입하지 않는" 구조적 차이에 의존하는 것이지만, 그럼에도 구글 쪽 정책 변화에 취약할 수 있다는 점은 인지하고 있어야 한다.
- 동일 프로파일 디렉토리를 사용하는 Chrome 프로세스가 비정상 종료로 남아있는 경우(잠김) 새로 spawn한 Chrome이 실패할 수 있다. 이는 Task 10에서 이미 만든 "프로파일 초기화 후 재시도" 복구 흐름(`BrowserLaunchError` 발생 시 프로파일 디렉토리 삭제 후 재시도)이 그대로 커버한다 — 새 코드 불필요.

### 추가 실사용 테스트 결과: 여전히 차단됨, 그리고 최종 결정

Task 10.1 구현 후 실사용 테스트에서도 구글 계정 연동 로그인은 동일하게 "This browser or app may not be secure"로 차단되는 것을 확인했다. 원인을 다시 조사한 결과, `--remote-debugging-port=0`을 사용하는 것 자체가 원인이었다 — MDN 공식 문서에 따르면 Chrome은 `--enable-automation`/`--headless`뿐 아니라 **`--remote-debugging-port`를 `0`으로 지정하기만 해도** `navigator.webdriver`를 `true`로 설정한다. CDP 클라이언트가 실제로 붙어있는지와 무관하다. 구글은 로그인 시 이 값을 검사해서 차단하므로, "로그인 시점에 CDP가 개입하지 않는다"는 이 설계의 핵심 전제가 `navigator.webdriver` 앞에서는 성립하지 않았다.

**검토했으나 채택하지 않은 수정:** 포트를 `0`이 아닌 고정값(예: `9339`)으로 바꾸면 `navigator.webdriver`가 `true`가 되지 않아 구글 차단을 피할 수 있다는 것까지 확인했다. 그러나 이는 "구글이 자동화 브라우저를 막으려고 두는 신호를 우리가 회피해서 로그인을 성공시키는" 것과 실질적으로 같은 결과이며, 이 문서 상단의 "채택하지 않는 대응 (명시적 배제)"에서 이미 배제하기로 한 스텔스 기법과 경계가 불분명하다고 판단해 **채택하지 않기로 결정했다.**

**최종 결정:**
- 자동 로그인(`programmers.login`)은 **구글 등 소셜 로그인이 아닌 이메일/비밀번호 로그인 Programmers 계정에 한해 지원**한다. 구글 계정으로 로그인해야 하는 사용자는 자동 로그인을 사용할 수 없으며, 이는 임시 제약이 아니라 **영구적인 지원 범위 결정**이다. Task 10.1의 spawn + 사후 CDP 연결 아키텍처는 그대로 유지한다(포트 충돌 없는 자동 포트 배정 등 다른 이점이 있고, 이메일/비밀번호 계정에는 여전히 정상 동작하며 아무 문제가 없다).
- 향후에도 `navigator.webdriver`나 다른 구글 봇 탐지 신호를 피하기 위한 목적의 launch 플래그/포트 변경은 하지 않는다.
- 사용자에게 이 제약을 미리 알리기 위해, 로그인 진행률 알림과 타임아웃 에러 메시지에 "구글 계정 연동은 지원되지 않으며 이 경우 Set Session Cookie로 수동 입력해야 한다"는 안내를 추가했다 (`src/extension.ts`의 `runLoginFlow`).

### 테스트 (변경분)

- **단위 테스트(신규):** `resolveChromeExecutable`의 후보 선택 로직 — 파일시스템 체크 함수를 주입해 "후보 중 존재하는 첫 경로 선택"/"아무것도 없으면 null" 등을 검증
- **수동 검증 (추가 항목):** 기존 Task 10의 수동 검증 체크리스트에 다음을 추가
  1. 구글 계정으로 연동된 Programmers 계정으로 실제 로그인 시도 시 더 이상 "This browser or app may not be secure" 차단이 발생하지 않는지
  2. 로그인 성공/취소/에러 등 모든 경로에서 Chrome 프로세스가 실제로 완전히 종료되는지 (OS 작업 관리자/`ps`로 확인 — `child.kill()`이 예상대로 동작하는지)

## 향후 확장 (범위 밖, 참고용)

- 다중 계정 전환(계정별 별도 프로파일 관리)
- Chrome 외 Edge/Firefox 등 다른 채널 자동 탐색 fallback
