# 핸드오프: 자동 로그인 안정화 + 사용자 편의성 개선 4종

**날짜:** 2026-07-16
**상태:** 자동 로그인은 실사용 테스트로 검증 완료(비-구글 계정). 사용자 편의성 개선 4종은 브레인스토밍+GPT 리뷰까지 끝나고 스펙 문서 작성 완료, **구현 플랜(writing-plans) 작성 전 단계에서 세션 종료**.

---

## 배경

지난 세션에서 만든 Task 10(Playwright 자동 로그인)을 사용자가 직접 로컬 환경에서 실사용 테스트했고, 그 과정에서 발견된 버그 3건을 순차적으로 진단·수정해 로그인 흐름을 완전히 정상화했다. 이어서 사용자가 "링크 붙여넣기가 불편하다"는 피드백을 계기로 편의성 개선 4종을 브레인스토밍하고 GPT 리뷰까지 마쳐 스펙 문서를 작성했다.

## 완료된 작업

### 1. 원격 개발 서버 환경 정비
- `.vscode/launch.json`, `.vscode/tasks.json` 추가 (Task 1 스캐폴딩 때 누락됐던 것 — F5로 Extension Development Host가 안 뜨던 문제 해결). 커밋 `82bb256`
- GitHub 저장소 신규 생성 및 최초 푸시: https://github.com/godkisung/vscode-programmers (public)
- `README.md` 추가. 커밋 `726bc12`

### 2. 구글 OAuth 로그인 차단 이슈 — 조사 및 최종 결정
- 실사용 테스트 중 Task 10의 `launchPersistentContext` 방식이 구글 계정 연동 로그인 시 "This browser or app may not be secure"로 차단되는 것을 발견
- 리서치 후 "Chrome을 순수 프로세스로 spawn하고 로그인 후에만 CDP로 붙는" 아키텍처(**Task 10.1**)로 전환 — `src/core/autoLogin.ts` 전면 재작성. 커밋 `67eef59`, 리뷰 후 수정 `72c3e02`
- 그런데도 여전히 차단됨 → 추가 조사 결과 `--remote-debugging-port=0` 자체가 (MDN 문서 확인) `navigator.webdriver=true`를 만든다는 걸 확인. 고정 포트로 우회하는 방법도 확인했으나, **"구글 봇 탐지 우회"의 경계에 걸친다고 판단해 채택하지 않음** (세이프티 필터도 이 지점에서 제동을 걸었고, 타당하다고 판단해 되돌림)
- **최종 결정 (영구):** 자동 로그인은 이메일/비밀번호 Programmers 계정에서만 지원. 구글 계정 연동 사용자는 `Set Session Cookie` 수동 입력을 계속 사용해야 함. 이 제약을 로그인 진행률 알림/타임아웃 메시지에 명시. 커밋 `b5b91e4`
- 상세 경위는 `docs/superpowers/specs/2026-07-16-auto-login-design.md`의 "확인된 제한사항"/"개정" 섹션에 전부 기록됨

### 3. 진단 로깅 추가 → 실제 로그인 버그 2건 발견 및 수정
- 이메일/비밀번호 로그인인데도 성공/실패 알림이 안 뜨는 문제 발생 → `src/core/autoLogin.ts`에 `onLog` 콜백 추가해 단계별 진단 로그를 "Programmers" 출력 채널에 표시하도록 계측(커밋 `8b4efc1`), `checkSession`에도 HTTP 상태/리다이렉트 대상 로깅 추가(커밋 `3530ca8`)
- 그 로그로 원인 확정: **`checkSession()`이 확인하던 URL(`school.programmers.co.kr/learn/courses/30/lessons`)이 로그인 여부와 무관하게 404인 완전히 잘못된 URL**이었음 (Task 6 때 실사이트 검증 없이 추측한 값). `programmers.co.kr/users/profile`(루트 도메인 주의)로 교체해 해결. 커밋 `a046c1a`. **사용자가 실제로 로그인 성공 확인함.**
- 문제 페이지가 C 언어 스켈레톤으로 뜨는 버그도 발견 → 원인은 셀렉터가 아니라 **URL에 `?language=python3` 쿼리 파라미터가 빠져있던 것** (언어 선택이 클라이언트 탭 전환이 아니라 서버 쿼리 파라미터 방식). 수정 커밋 `0b1d641`

### 4. Run Sample Tests에 print() 출력 표시 기능 추가
- 기존엔 디버그 `print()` 출력이 파싱 안정성을 위해 조용히 버려지고 있었음 → `runSampleTests()`가 `{ results, debugOutput }`을 반환하도록 변경, 출력 채널에 "--- 프로그램 출력 (print) ---" 섹션으로 표시. 커밋 `c6f3b1d`

### 5. 사용자 편의성 개선 4종 — 브레인스토밍 + GPT 리뷰 + 스펙 작성 완료
- 스펙 문서: `docs/superpowers/specs/2026-07-16-ux-convenience-design.md` (커밋 `92aca3d`)
- 범위: (1) "Open Problem"을 QuickPick 기반으로 통합(클립보드 자동 감지 + 최근 열어본 문제 목록 최대 10개), (2) 제출용 코드 클립보드 복사 신규 명령, (3) 샘플 테스트 케이스별 실행 시간 표시
- GPT 리뷰(`gpt-consult.sh plan` 경유) 완료, 지적사항(클립보드 오탐 방지 4~6자리 숫자 제한, dedupe, globalState 저장 시점 명확화, workspaceState로 URL 복구 가능하게, 타이밍 수치에 "참고용" 안내 문구) 전부 반영해 스펙에 이미 기록됨. 충돌 없음 — 별도 조정 불필요

## 수동 작업 필요

⚠️ 없음 — 이번 세션에서 발견된 버그는 전부 사용자가 로컬 실사용 테스트로 재현/검증해줬고, 원인 확정 후 코드로 수정 완료됐다. Task 9(실사이트 검증)의 나머지 항목(예제 케이스 파싱 정확도, 문제별 예제 개수 일치 등)은 여전히 사람이 실제 문제를 열어보며 확인해야 하는 항목으로 남아있음 — 사용자가 "문제도 다 뜨고 정상"이라고 확인했으나 예제 케이스 자체의 정확성까지 별도로 검증한 적은 없음.

## 다음 세션 작업 (우선순위 순)

1. **사용자 편의성 개선 4종 구현** — 스펙 문서(`docs/superpowers/specs/2026-07-16-ux-convenience-design.md`)는 완성됐고, 사용자가 "이대로 진행해서 구현 플랜 작성 → subagent 구현으로 넘어갈까요?"에 아직 답하지 않은 채 세션 종료. 다음 세션 시작 시:
   - `superpowers:writing-plans` 스킬로 `docs/superpowers/plans/2026-07-15-programmers-vscode-extension-plan.md`에 새 Task(예: Task 11)로 플랜 추가
   - 이후 `superpowers:subagent-driven-development`로 구현 (이번 세션에서 Task 10/10.1과 동일한 패턴: implementer → task-reviewer → fix round → re-review → 진행 원장 갱신)
   - 진행 원장: `.superpowers/sdd/progress.md` (gitignore됨, 로컬에만 있음 — Task 1-10.1까지 complete 상태로 기록되어 있음)
2. **Task 9(실사이트 검증) 잔여 항목** — 예제 케이스 파싱이 실제 문제의 예제 개수/값과 정확히 일치하는지, 여러 문제(난이도/유형 다양하게)로 추가 확인 필요. `docs/superpowers/plans/2026-07-15-programmers-vscode-extension-plan.md`의 "Task 9" 섹션 Step 5~8 참고
3. Task 9, 편의성 개선 4종 모두 끝난 뒤 → **Task 10(플랜 문서 상의 "최종 브랜치 전체 리뷰", 핸드오프 관례상 다음 번호) → `superpowers:finishing-a-development-branch`**로 마무리. 현재 `master` 브랜치에서 바로 작업 중이며 원격이 생겼으니(이전엔 없었음), 마무리 단계에서 브랜치/PR 전략을 사용자에게 다시 확인할 것

## 중단된 워크플로우

없음 — 이번 세션도 Workflow 도구는 쓰지 않았고, Agent(서브에이전트) + subagent-driven-development 스킬의 수동 오케스트레이션만 사용함. `resumeFromRunId` 해당 없음.

## 핵심 결정사항

- **구글 계정 연동은 자동 로그인 영구 미지원** — 근본 원인(`--remote-debugging-port=0`가 `navigator.webdriver`를 켬)을 확인했고, 고정 포트로 우회하는 방법도 알아냈지만 **의도적으로 채택하지 않음**. 이유: 구글의 봇 탐지를 우회하는 것과 실질적으로 동일한 결과이며, 세이프티 필터도 이 지점에서 제동을 걸었음 — 코드 품질/안정성 문제가 아니라 정책적 결정이니 향후 세션에서 "그냥 고정 포트로 바꾸면 되지 않냐"는 질문이 나오면 이 핸드오프와 `docs/superpowers/specs/2026-07-16-auto-login-design.md`의 관련 섹션을 먼저 참고할 것
- **`checkSession()`/`fetchProblemHtml()`의 엔드포인트는 이제 실사이트로 검증됨** (`programmers.co.kr/users/profile`, `?language=python3` 쿼리) — 더 이상 추측값이 아님. 단, Task 9의 나머지 파서 관련 부분(예제 케이스 파싱 등)은 여전히 미검증 상태로 남아있으니 혼동하지 말 것
- **진단 로깅(`onLog`, `checkSession`의 `onResponse`)은 임시 디버깅용이 아니라 유지하기로 결정** — 코드 품질 저해 없이 유용하다고 판단해 제거하지 않음. 다음 세션에서 "왜 이런 로그가 있냐"는 의문이 들면 이 핸드오프 참고

## Git 상태

작업 트리 깨끗함, 커밋되지 않은 변경 없음. HEAD: `92aca3d` (master 브랜치). 원격 `origin` = https://github.com/godkisung/vscode-programmers.git, 로컬과 완전히 동기화됨 (푸시 완료).

커밋 금지 — 이미 전부 커밋/푸시됨. 앞으로도 사용자 명시 요청 시에만 커밋할 것.
