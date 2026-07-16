# Programmers Helper

[Programmers](https://school.programmers.co.kr) 코딩테스트 문제를 VS Code에서 바로 풀 수 있게 해주는 확장입니다. 문제 페이지를 스크래핑해 워크스페이스에 `solution.py`를 만들어주고, 문제에 주어진 예제 케이스로 로컬에서 바로 채점해볼 수 있습니다.

Programmers는 공식 API가 없어 인증된 사용자만 볼 수 있는 문제 페이지를 세션 쿠키로 직접 요청하는 방식으로 동작합니다.

## 주요 기능

- 문제 번호/URL만 입력하면 문제 설명 + 예제 케이스 + 스켈레톤 코드를 워크스페이스로 가져오기
- 사이드 패널(Webview)에 문제 설명 표시
- 예제 케이스만으로 로컬 Python 채점 (`solution()` 함수 호출 → pass/fail 비교)
- 세션 인증: Chrome 자동 로그인(기본) 또는 브라우저 쿠키 수동 붙여넣기(폴백)

**범위 밖 (아직 미지원):** 실제 채점 서버 제출(Phase 2, 채점 API 리버싱 필요), Python 외 언어, 사용자 커스텀 테스트 케이스.

## 요구 사항

- VS Code `^1.85.0` 이상
- Node.js, npm
- Python 3 (로컬 채점 실행용 — `python3 --version`으로 확인)
- (선택) 자동 로그인 기능을 쓰려면 시스템에 Chrome이 설치되어 있고, 화면(디스플레이)이 있는 로컬 환경이어야 합니다. Remote-SSH 등 디스플레이 없는 원격 환경에서는 자동 로그인이 동작하지 않고, 대신 수동 쿠키 입력으로 자동 안내됩니다.
- **자동 로그인은 구글 등 소셜 로그인이 아닌, 이메일/비밀번호로 로그인하는 Programmers 계정에서만 동작합니다.** 구글은 자동화된 브라우저에서의 로그인을 자체적으로 차단하기 때문입니다("This browser or app may not be secure"). 구글 계정으로 로그인하는 경우 `Set Session Cookie`로 수동 입력해주세요.

## 개발 환경 설정

```bash
npm install
npm run compile
npm test
```

VS Code에서 이 프로젝트를 열고 `F5`를 누르면 "Extension Development Host" 창이 뜨고, 그 창에서 아래 명령들을 바로 테스트해볼 수 있습니다.

## 사용법

명령 팔레트(`Cmd+Shift+P` / `Ctrl+Shift+P`)에서 다음 명령을 사용합니다.

| 명령 | 설명 |
|---|---|
| `Programmers: Login (Auto)` | Chrome 창이 자동으로 열리고, 로그인을 마치면 세션 쿠키를 자동으로 추출/저장합니다 |
| `Programmers: Set Session Cookie` | 브라우저 개발자도구에서 직접 복사한 Cookie 헤더 값을 붙여넣어 저장합니다 (자동 로그인이 안 되는 환경의 폴백) |
| `Programmers: Check Connection` | 저장된 쿠키가 아직 유효한지 확인합니다 |
| `Programmers: Open Problem` | 문제 번호 또는 URL을 입력하면 `.programmers/<id>/`에 `solution.py`/`cases.json`을 생성하고 사이드 패널에 문제를 띄웁니다 |
| `Programmers: Run Sample Tests` | 현재 열린 문제의 예제 케이스로 `solution.py`를 로컬 실행해 pass/fail을 출력 채널에 보여줍니다 |

`Check Connection`이나 `Open Problem`이 인증 오류로 실패하면 알림에 뜨는 **[로그인]** 버튼으로 바로 자동 로그인을 실행하고, 성공하면 원래 하려던 동작을 한 번 자동으로 재시도합니다.

## 인증 저장 방식

세션 쿠키는 VS Code `SecretStorage`에 저장되며, 평문 설정 파일에는 저장되지 않습니다.

## 개발 문서

- 스펙: `docs/superpowers/specs/`
- 구현 플랜: `docs/superpowers/plans/`
