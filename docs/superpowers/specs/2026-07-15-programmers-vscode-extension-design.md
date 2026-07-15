# Programmers VS Code Extension — Design

## 배경 / 목적

Programmers(school.programmers.co.kr) 코딩테스트 문제를 웹 에디터가 아닌 VS Code에서 풀 수 있게 해주는 확장. Programmers는 공식 공개 API가 없으므로, 문제 페이지 스크래핑과(가능하다면) 리버싱한 채점 API 호출로 동작한다.

## 범위 결정 사항

- **대상 언어**: Python만 지원 (1차)
- **인터페이스**: VS Code 확장 (TypeScript)
- **인증**: 사용자가 브라우저 devtools에서 복사한 Cookie 헤더 값을 확장에 붙여넣는 방식. 자동 브라우저 쿠키 추출/복호화는 하지 않음
- **문제 설명 표시**: 사이드 패널 Webview
- **로컬 테스트 범위**: 문제에 주어진 예제 케이스만 자동 실행 (사용자 커스텀 케이스는 미지원, 향후 확장 가능)
- **자동 제출(Phase 2)**: 채점 API 스펙을 사용자가 브라우저 Network 탭에서 직접 확인해 공유하면 그 시점에 설계/구현. 그 전까지는 로컬 테스트까지만 지원하는 도구로 완결됨 (제출은 웹사이트에서 수동으로 진행)

## 전체 아키텍처 & 단계 구성

**Phase 1 (즉시 구현)**
1. 문제 ID/URL 입력 → 문제 페이지 fetch (Cookie 헤더 포함) → 파싱 → 워크스페이스에 `solution.py` 생성 + 사이드 Webview에 문제 설명 표시
2. 예제 입출력 케이스를 파싱해 `cases.json`으로 저장
3. "Run Sample Tests" 명령 → 로컬 Python 프로세스로 `solution()` 함수를 예제 케이스에 대해 실행, pass/fail 비교 결과 표시

**Phase 2 (사용자가 채점 API를 리버싱해서 공유하면 추가)**
- "Submit" 명령 → 리버싱된 채점 API로 코드 제출, 폴링 후 결과(정답/오답/부분점수) 표시

**핵심 원칙**: 인증(쿠키) · 파싱 · 제출을 분리된 모듈로 둬서, Programmers가 HTML 구조를 바꾸거나 제출 API를 알아내지 못해도 나머지 기능은 계속 동작.

## 컴포넌트 구성

- **Problem Fetcher**: `school.programmers.co.kr/learn/courses/30/lessons/{id}` GET (Cookie 헤더 포함). 파싱 우선순위: 페이지 내 임베디드 구조화 데이터(예: `__NEXT_DATA__` 또는 유사 초기 상태 JSON)를 우선 탐색해 사용하고, 없으면 cheerio로 HTML을 직접 파싱하는 방식으로 fallback. 제목/설명/초기 코드 스켈레톤/예제 표를 추출
- **Webview Panel**: 파싱된 설명을 사이드 패널에 렌더링. `sanitize-html`로 정제 후 표시, 상대경로 이미지/리소스는 절대 URL로 재작성, 패널 하단에 "원본 페이지에서 보기" 링크 제공 (파싱 누락/렌더링 문제 시 폴백 경로)
- **Workspace Scaffold**: `.programmers/<id>-<slug>/solution.py`(스켈레톤 코드 프리필) + `cases.json`(예제 케이스) 생성
- **Test Runner**: Python 서브프로세스로 하니스 스크립트 실행. `solution()`을 각 예제에 대해 위치 인자로 호출하고 결과를 비교, pass/fail과 케이스별 diff 표시
- **(Phase 2) Submit 모듈**: 완전히 분리된 파일. 리버싱된 API 호출. 이 모듈이 없거나 실패해도 나머지 기능(fetch/local test)에는 영향 없음

## 인증 / 설정

- 쿠키 값은 VS Code `SecretStorage`에 저장 (평문 `settings.json`에 저장하지 않음)
- 저장/갱신은 커맨드 팔레트 명령("Programmers: Set Session Cookie")으로 입력받음
- 모든 요청에 저장된 쿠키와 함께 일관된 User-Agent 헤더를 첨부 (브라우저 요청과의 차이로 인한 실패 방지)
- "Programmers: Check Connection" 명령으로 쿠키 유효성을 미리 검증 가능
- 요청이 401/로그인 리다이렉트를 받으면 "쿠키가 만료된 것 같습니다. 브라우저에서 다시 복사해 설정해주세요" 알림 표시

## 예제 케이스 파싱 & 테스트 하니스

- 예제 표(또는 임베디드 JSON 내 example 필드) 값 파싱은 다단계로 처리:
  1. JSON으로 직접 파싱 시도
  2. 실패 시 JS 리터럴 표기(`true/false`, 홑따옴표 등)를 정규화한 뒤 Python `ast.literal_eval`로 파싱
  3. 그래도 실패하면 해당 케이스는 자동 테스트에서 제외하고 "수동 확인 필요"로 표시 (조용히 틀린 결과를 만들지 않음)
- 표 헤더 또는 임베디드 데이터에서 파라미터 이름을 추출해 `solution()` 호출 시 위치 인자 순서로 전달
- 하니스는 stdout으로 JSON 결과 배열을 반환하고, 확장이 이를 파싱해 pass/fail 개수와 케이스별 실제값/기대값을 표시

**로컬 테스트 지원 범위의 한계 (명시적 문서화)**: 이 하니스는 단순 `solution(...)` 함수 호출로 검증 가능한 문제만 지원한다. 클래스 기반 문제, 전역 상태에 의존하는 문제, 또는 Programmers 서버의 hidden judge 로직에 의존하는 문제는 로컬 결과가 실제 채점 결과와 다를 수 있으며, 이는 MVP 범위 밖으로 둔다.

## 에러 처리

- 네트워크 오류/잘못된 문제 ID → 알림 + 재시도 안내
- HTML/임베디드 데이터 구조 변경으로 파싱 실패 → try/catch로 감싸고 원본 페이지 링크로 폴백 표시
- 로컬 실행 중 문법 오류/런타임 예외 → stderr를 그대로 결과 패널에 노출
- python3 미설치/버전 문제 → 최초 실행 시 `python3 --version` 체크 후 안내 메시지

## 테스트 전략

- **파서**: 실제 문제 페이지 HTML/임베디드 JSON 샘플을 fixture로 저장해 유닛 테스트 (제목/설명/예제 추출 정확성)
- **하니스**: int/str/list/nested list/bool/None 등 다양한 타입 조합에 대한 비교 로직 유닛 테스트, 다단계 파싱 fallback 경로 테스트
- **통합**: 실제 쉬운 문제 1~2개로 수동 end-to-end 확인 (fetch → 로컬 실행 → 결과 비교)

## 향후 확장 (범위 밖, 참고용)

- 다중 언어 지원 (Java, JS/TS 등)
- 사용자 커스텀 테스트 케이스 추가
- Phase 2 자동 제출 기능 (채점 API 리버싱 완료 후)
