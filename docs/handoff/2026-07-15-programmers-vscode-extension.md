# 핸드오프: Programmers VS Code 확장 개발

**날짜:** 2026-07-15
**상태:** Task 1-8 구현 완료 및 리뷰 통과. Task 9(실사이트 검증)는 사용자와 함께 진행 중 — 사용자가 F5로 Extension Development Host를 띄우고 쿠키를 설정하는 단계에서 응답 대기 중.

---

## 배경

한국 코딩테스트 사이트 Programmers(school.programmers.co.kr)를 VS Code에서 직접 풀 수 있게 해주는 VS Code 확장("Programmers Helper")을 개발 중. Programmers는 공식 API가 없어 문제 페이지 스크래핑 + 로컬 Python 테스트 실행으로 동작(Phase 1). 자동 제출(Phase 2)은 채점 API 리버싱 전까지 범위 밖.

브레인스토밍 → 스펙 작성 → 플랜 작성 → subagent-driven-development로 Task별 구현 순서로 진행했고, 사용자 요청에 따라 **매 태스크 구현마다 `/gpt-review` 스타일 GPT 리뷰를 실행하고, 발견된 실질적 버그는 수정 후 재검토하는 루프**를 태스크 리뷰어 서브에이전트 검토와 함께 병행했다.

## 완료된 작업

- 스펙: `docs/superpowers/specs/2026-07-15-programmers-vscode-extension-design.md`
- 플랜: `docs/superpowers/plans/2026-07-15-programmers-vscode-extension-plan.md` (Task 1-9 정의)
- Task 1-8 전부 구현 완료, 코드 리뷰어 서브에이전트 승인(Approved), GPT 리뷰 게이트 통과. 최신 커밋: `c3689cc` (HEAD)
  - Task 1: 프로젝트 스캐폴딩 (`package.json`, `tsconfig.json`, `jest.config.js`, `src/extension.ts`)
  - Task 2: 예제 케이스 값 파서 `src/core/caseParser.ts` — JSON 우선 + 따옴표 인식 fallback (버그 수정 이력 있음, quote-aware)
  - Task 3: 문제 HTML 파서 `src/core/parser.ts` — cheerio 기반, **CSS 셀렉터는 추측값(placeholder)**, Task 9에서 실제 마크업 보고 보정 필요
  - Task 4: 워크스페이스 스캐폴딩 `src/core/scaffold.ts` — `solution.py`/`cases.json` 생성, 파싱 실패 케이스는 경고 주석으로 표시
  - Task 5: Python 테스트 하니스 `resources/runner.py` + `src/core/testRunner.ts` — stdout 마지막 줄만 파싱(디버그 print 대응), 10초 타임아웃(무한루프 대응)
  - Task 6: 인증/fetch `src/core/httpHeaders.ts`, `src/core/fetchProblem.ts` — 쿠키 헤더, `AuthExpiredError`, `checkSession`
  - Task 7: Webview 렌더러 `src/webview/render.ts` — sanitize-html, `javascript:` 스킴 차단, 앵커 링크 보존
  - Task 8: 커맨드 연결 `src/extension.ts`, `src/secretsStore.ts` — 4개 커맨드(`setSessionCookie`, `checkConnection`, `openProblem`, `runSampleTests`) 등록. solution.py 덮어쓰기 방지, output 채널 재사용, 에러 처리 일관화, webview reveal 등 3라운드 버그 수정 완료
- 진행 원장: `.superpowers/sdd/progress.md` (gitignore 처리됨, 로컬 스크래치 — git에는 없음, 아래 "Git 상태" 참고)
- 전체 테스트: 7 suites, 37 tests, 전부 통과 (`npm test`)

## 수동 작업 필요 (진행 중)

⚠️ **Task 9(실사이트 검증)는 사람의 브라우저 로그인 + VS Code GUI가 필요해 서브에이전트가 대신할 수 없음.** 사용자와 함께 진행하기로 하고 다음 단계까지 안내한 상태:

1. 프로젝트를 VS Code로 열고 `F5` → Extension Development Host 실행
2. 브라우저에서 `school.programmers.co.kr` 로그인 → DevTools Network 탭 → 문제 페이지(예: `.../learn/courses/30/lessons/42840`) 새로고침 → Cookie 헤더 값 복사
3. Extension Development Host에서 "Programmers: Set Session Cookie" 실행 → 쿠키 붙여넣기

**다음 세션이 이어받을 때**: 사용자가 위 3단계까지 진행했는지, 성공/실패 메시지가 무엇이었는지 먼저 물어볼 것. 이후 플랜 문서의 Task 9 체크리스트(`docs/superpowers/plans/2026-07-15-programmers-vscode-extension-plan.md`의 "## Task 9" 섹션, Step 3~9)를 그대로 따라가면 됨:
   - Step 3: "Check Connection" 실행 → 정상 확인
   - Step 4: "Open Problem" → `42840` 입력
   - Step 5: 실제 페이지와 파싱 결과(제목/설명/스켈레톤 코드/예제 케이스) 비교
   - Step 6: 불일치 시 `src/core/parser.ts`의 `TITLE_SELECTORS`/`DESCRIPTION_SELECTORS`/`SKELETON_SELECTORS`/`EXAMPLE_TABLE_SELECTORS` 상수를 실제 DOM 구조에 맞게 보정 (사용자가 "Inspect Element"로 확인한 실제 태그/클래스명을 알려주면 내가 코드 수정)
   - Step 7: "Run Sample Tests"로 정답/오답 케이스 모두 확인
   - Step 8: `test/fixtures/sample-problem.html` + `test/core/parser.test.ts`를 실제 구조로 업데이트 (개인정보/세션 관련 내용은 익명화해서)
   - Step 9: 커밋

검증 명령: 셀렉터 수정 후 `npx jest test/core/parser.test.ts`로 회귀 확인.

## 다음 세션 작업 (우선순위 순)

1. **Task 9 이어받기** — 위 "수동 작업 필요" 섹션 그대로 진행. 사용자가 이미 쿠키 설정을 완료했다면 바로 Step 3(Check Connection)부터.
2. Task 9 완료 후 → **Task 10: 최종 브랜치 전체 리뷰** — `superpowers:requesting-code-review`의 `code-reviewer.md` 템플릿 사용, `scripts/review-package`로 전체 diff(`git merge-base main HEAD`부터) 패키징해서 가장 강력한 모델로 리뷰
3. 최종 리뷰 후 → `superpowers:finishing-a-development-branch` 스킬로 마무리 (현재 `master` 브랜치에서 바로 작업 중이라는 점 — 사용자가 "master에서 바로 진행"을 명시적으로 선택했으므로 별도 브랜치/PR 없이 그대로 완료 처리 가능성 높음, 마무리 단계에서 사용자에게 확인)

## 중단된 워크플로우

없음 — Workflow 도구는 이번 세션에서 사용하지 않았고, 전부 Agent(서브에이전트) + subagent-driven-development 스킬의 수동 오케스트레이션으로 진행함. `resumeFromRunId` 해당 없음.

## 핵심 결정사항

- **GPT 리뷰 게이트 추가**: 사용자가 "코드 구현할 때마다 gpt review 실행하고 통과하면 구현"이라고 명시적으로 요청. 이에 따라 매 태스크마다 `~/.claude/gpt-consult.sh`를 재활용한 커스텀 스크립트로 커밋 범위 diff를 GPT에 보내 리뷰받고, 실질적 버그만 골라 수정 → 재검토하는 루프를 추가함.
  - ⚠️ **중요**: 이 커스텀 스크립트(`gpt-review-range.sh`)는 세션 스크래치패드 경로(`/tmp/claude-1000/-home-kisung-workspace-2-applications-programmers/5d04d91a-d3c9-455e-aa8b-048ba33fd5b8/scratchpad/gpt-review-range.sh`)에 있어 **이번 세션이 끝나면 사라질 가능성이 높음**. 다음 세션에서 GPT 리뷰 루프를 계속하려면 아래 스크립트를 다시 만들어야 함 (내용은 `~/.claude/gpt-consult.sh`의 `review` 모드를 커밋 범위(`git diff base..head`)에 대해 동작하도록 변형한 것 — lockfile 제외, 60000자 초과 시 truncate 처리 포함).
- **plan-mandated 버그는 사용자 확인 후 수정**: Task 2에서 계획서에 직접 적어넣은 정규식 코드 자체에 버그가 있었음(따옴표 비인식 전역 치환이 문자열 내용을 오염시킴) — 이런 경우 스킬 규칙에 따라 사용자에게 확인 후 진행. 사용자는 "따옴표 인식 로직으로 수정"을 선택했고, 이후 GPT가 제기한 더 깊은 Python 리터럴 커버리지(dict/tuple/set, 백슬래시 이스케이프)는 "현재 수준으로 마무리"를 선택 — 과설계 방지.
- **의도적으로 배제한 것들** (Task 9에서 실사이트 확인 후 필요하면 재고):
  - `currentProblemDir` 전역 단일 상태 (다중 문제 동시 세션 추적 미지원) — 스펙이 요구하지 않음, MVP 범위 밖으로 명시적 배제
  - `fetchProblemHtml`이 모든 3xx를 인증 만료로 처리 (실제로는 로그인 리다이렉트만일 수도 있음) — 실제 사이트 리다이렉트 동작을 몰라서 지금은 안전하게(조용히 틀리지 않고 명확한 에러로) 실패하는 쪽으로 둠
  - 동기 `fs.*Sync` 파일 I/O — 파일 크기가 작아 실질적 영향 없음
  - Windows에서 `python3` 대신 `python` 커맨드 필요한 환경 — 크로스플랫폼 요구사항이 스펙에 없었음
- **Task 3의 CSS 셀렉터는 전부 추측값**: 실제 Programmers 페이지에 인증된 접근 권한이 없어 실제 마크업을 확인하지 못했음. `TITLE_SELECTORS` 등 4개 상수 배열이 한 곳에 모여있어 Task 9에서 쉽게 교정 가능하도록 설계함.

## Git 상태

작업 트리 깨끗함 (커밋되지 않은 변경 없음). HEAD: `c3689cc` (master 브랜치, 원격 없음). 마지막 커밋에서 `docs/superpowers/plans/` 문서 커밋 누락을 발견해 커밋 완료함.

커밋 금지 — 이미 전부 커밋됨. 앞으로도 사용자 명시 요청 시에만 커밋할 것.
