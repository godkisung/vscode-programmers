# Programmers Helper

[Programmers](https://school.programmers.co.kr) 코딩테스트 문제를 VS Code에서 바로 풀 수 있게 해주는 확장입니다. 문제 페이지를 스크래핑해 워크스페이스에 `solution.py`를 만들어주고, 문제에 주어진 예제 케이스로 로컬에서 바로 채점해볼 수 있습니다.

Programmers는 공식 API가 없어 인증된 사용자만 볼 수 있는 문제 페이지를 세션 쿠키로 직접 요청하는 방식으로 동작합니다.

## 주요 기능

- 문제 번호/URL만 입력하면 문제 설명 + 예제 케이스 + 스켈레톤 코드를 워크스페이스로 가져오기
- 사이드 패널(Webview)에 문제 설명 표시 (VS Code 테마에 맞춰 렌더링)
- 예제 케이스만으로 로컬 Python 채점 (`solution()` 함수 호출 → pass/fail 비교), 취소 가능한 진행 표시
- 예제 케이스 외에 **직접 만든 커스텀 테스트 케이스 추가** (`Add Test Case`) — 문제를 다시 열어도 보존됨
- 활동 바 **사이드바**: 현재 문제(통과 요약 포함)와 최근 문제 목록, 클릭 한 번으로 열기/실행
- **상태 바**: 연결 상태(클릭 시 재확인)와 현재 문제 통과 요약(클릭 시 재실행)을 항상 표시
- `solution.py`에 **인라인 테스트 결과** — 실행/재실행 CodeLens 버튼, 실패 케이스는 노란 밑줄(Diagnostics)로 expected/actual 표시
- **저장 시 자동 테스트 실행** (설정으로 끌 수 있음: `programmers.runTestsOnSave`)
- 문제 설명을 `problem.md`로, 테스트 실행 기록을 `runs.jsonl`로 저장 — 저장 위치는 `programmers.dataRoot`로 바꿀 수 있습니다
- 키보드 단축키: 테스트 실행(`Cmd/Ctrl+Alt+T`), 문제 열기(`Cmd/Ctrl+Alt+O`)
- 세션 인증: Chrome 자동 로그인(기본) 또는 브라우저 쿠키 수동 붙여넣기(폴백)

**범위 밖 (아직 미지원):** 실제 채점 서버 제출/자동 채점 회수(채점 API 리버싱 필요), Python 외 언어.

## 요구 사항

- VS Code `^1.85.0` 이상
- Node.js, npm
- Python 3 (로컬 채점 실행용 — `python3 --version`으로 확인)
- (선택) 자동 로그인 기능을 쓰려면 시스템에 Chrome이 설치되어 있고, 화면(디스플레이)이 있는 로컬 환경이어야 합니다. Remote-SSH 등 디스플레이 없는 원격 환경에서는 자동 로그인이 동작하지 않고, 대신 수동 쿠키 입력으로 자동 안내됩니다.
- **자동 로그인은 구글 등 소셜 로그인이 아닌, 이메일/비밀번호로 로그인하는 Programmers 계정에서만 동작합니다.** 구글은 자동화된 브라우저에서의 로그인을 자체적으로 차단하기 때문입니다("This browser or app may not be secure"). 구글 계정으로 로그인하는 경우 `Set Session Cookie`로 수동 입력해주세요.

## 개발 환경 설정

```bash
npm install
npm run build      # esbuild로 out/extension.js 번들링
npm run typecheck  # tsc --noEmit
npm test
```

VS Code에서 이 프로젝트를 열고 `F5`를 누르면 "Extension Development Host" 창이 뜨고, 그 창에서 아래 명령들을 바로 테스트해볼 수 있습니다.

## 사용법

명령 팔레트(`Cmd+Shift+P` / `Ctrl+Shift+P`)에서 다음 명령을 사용합니다.

| 명령 | 단축키 | 설명 |
|---|---|---|
| `Programmers: Login (Auto)` | | Chrome 창이 자동으로 열리고, 로그인을 마치면 세션 쿠키를 자동으로 추출/저장합니다 |
| `Programmers: Set Session Cookie` | | 브라우저 개발자도구에서 직접 복사한 Cookie 헤더 값을 붙여넣어 저장합니다 (자동 로그인이 안 되는 환경의 폴백) |
| `Programmers: Check Connection` | | 저장된 쿠키가 아직 유효한지 확인합니다 (상태 바 클릭으로도 실행) |
| `Programmers: Open Problem` | `Cmd/Ctrl+Alt+O` | 문제 번호 또는 URL을 입력하면 `.programmers/<id>/`에 `solution.py`/`cases.json`을 생성하고 사이드 패널에 문제를 띄웁니다 |
| `Programmers: Run Sample Tests` | `Cmd/Ctrl+Alt+T` | 예제(+커스텀) 케이스로 `solution.py`를 로컬 실행해 pass/fail을 출력 채널·인라인 CodeLens·상태 바에 보여줍니다. 진행 중 취소 가능 |
| `Programmers: Add Test Case` | | 입력값/기대 출력값을 직접 입력해 `cases.json`에 커스텀 케이스를 추가합니다 (문제를 다시 열어도 유지됨) |
| `Programmers: Copy Solution for Submission` | | 현재 `solution.py` 내용을 클립보드에 복사하고, 원하면 제출 페이지를 웹브라우저로 엽니다 |

`Check Connection`이나 `Open Problem`이 인증 오류로 실패하면 알림에 뜨는 **[로그인]** 버튼으로 바로 자동 로그인을 실행하고, 성공하면 원래 하려던 동작을 한 번 자동으로 재시도합니다.

### 사이드바 / 상태 바 / 인라인 결과

- 활동 바의 Programmers 아이콘을 누르면 사이드바에 **현재 문제**(통과 요약 포함)와 **최근 문제 목록**이 보입니다. 항목을 클릭하면 바로 열립니다.
- 하단 상태 바에는 연결 상태와 현재 문제의 최근 통과 요약이 항상 표시됩니다. 클릭하면 각각 연결 재확인 / 테스트 재실행으로 이어집니다.
- `solution.py`의 `def solution(...)` 줄 위에 **테스트 실행 CodeLens**와 **최근 통과 요약**이 표시되고, 실패한 케이스는 해당 줄에 경고(Diagnostics)로 expected/actual이 표시됩니다.
- `programmers.runTestsOnSave` 설정(기본 켜짐)이 켜져 있으면 `solution.py`를 저장할 때마다 자동으로 샘플 테스트가 실행됩니다. `settings.json`에서 끌 수 있습니다.

### 저장되는 파일

문제 하나당 폴더 하나가 만들어집니다.

| 파일 | 내용 |
|---|---|
| `solution.py` | 풀이 (스켈레톤 코드로 시작) |
| `cases.json` | 예제 + 커스텀 테스트 케이스 |
| `problem.md` | 문제 설명을 Markdown으로 변환한 것 + 입출력 예 원본 표 |
| `runs.jsonl` | 테스트 실행 기록 (실행마다 한 줄 append) |

`problem.md`는 예제 파싱에 실패한 케이스도 **원본 문자열 그대로** 남깁니다. 이 경우 `cases.json`에서는 해당 케이스가 빠지므로, 값을 잃지 않으려면 `problem.md`가 필요합니다.

`runs.jsonl`은 덮어쓰지 않고 줄만 추가합니다. 여러 기기에서 같은 문제를 풀어도 git의 union merge로 안전하게 합쳐지도록 하기 위해서입니다.

```jsonl
{"ts":"2026-07-31T02:10:00.000Z","host":"macbook","trigger":"save","result":"fail","passed":1,"total":2,"code_hash":"9f2a1c4d7e01"}
```

### 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `programmers.runTestsOnSave` | `true` | `solution.py` 저장 시 샘플 테스트 자동 실행 |
| `programmers.dataRoot` | `""` | 문제 데이터를 저장할 폴더. 비우면 워크스페이스 안의 `.programmers` |
| `programmers.git.autoSync` | `false` | `dataRoot`가 속한 git 저장소를 자동 동기화 |

`programmers.dataRoot`는 `~`, 절대 경로, 워크스페이스 기준 상대 경로를 받습니다. 풀이를 이 저장소 밖(예: 개인 private 저장소)에 두고 싶을 때 사용합니다. 설정을 바꾼 뒤에는 문제를 다시 열어야 새 위치가 적용됩니다.

```json
{ "programmers.dataRoot": "~/workspace/algo-wiki/solutions" }
```

### 여러 기기에서 풀기

`programmers.git.autoSync`를 켜면 `dataRoot`가 속한 git 저장소를 확장이 대신 동기화합니다.

| 시점 | 동작 |
|---|---|
| 문제를 열 때 | `git pull --rebase --autostash` |
| 전체 케이스 통과 시 | `solve(12973): 짝지어 제거하기` 형태로 커밋 |
| 커밋 후 잠시 뒤 / 창을 닫을 때 | `git push` |

- **충돌은 자동으로 해결하지 않습니다.** rebase를 되돌리고 알림만 띄웁니다 — 자동화의 목적은 마찰 제거이지 판단 대행이 아닙니다.
- 커밋은 **문제 폴더 아래 파일만** 대상으로 합니다. 같은 저장소에서 작업 중이던 다른 변경은 스테이징하지 않습니다.
- 오프라인이면 조용히 넘어갑니다. 로컬 커밋은 쌓이고 다음에 함께 올라갑니다.
- 전체 케이스를 통과했을 때만 커밋하므로, 풀다 만 코드가 히스토리에 쌓이지 않습니다.

## 인증 저장 방식

세션 쿠키는 VS Code `SecretStorage`에 저장되며, 평문 설정 파일에는 저장되지 않습니다.

## 개발 문서

- 스펙: `docs/superpowers/specs/`
- 구현 플랜: `docs/superpowers/plans/`
