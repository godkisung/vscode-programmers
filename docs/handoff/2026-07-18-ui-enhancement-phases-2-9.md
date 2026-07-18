# 2026-07-18 Handoff: 고도화 Phase 2-9 구현 완료

## 완료된 작업 (이번 세션)

이전 핸드오프(`2026-07-18-bundling-and-improvement-plan.md`)의 Phase 2-8 전체 +
사용자 선택 추가 기능(Phase 9)을 구현했다. 각 Phase마다 gpt-review 스킬로
GPT 코드 리뷰를 받고 타당한 지적만 반영했다.

| Phase | 내용 | 커밋 |
|-------|------|------|
| 2 | 비동기 테스트 러너 — spawnSync→spawn, AbortSignal 취소, cancellable withProgress | feat: async test runner |
| 3 | 공유 상태 모듈 — src/state.ts (EventEmitter), workspaceState 영속화/복원 | feat: shared state module |
| 4 | 사이드바 TreeView — 활동 바 컨테이너(media/icon.svg), 현재+최근 문제, 인라인 액션 | feat: sidebar TreeView |
| 5 | 상태 바 — 연결 상태(클릭→checkConnection) + 현재 문제(클릭→테스트), onStartupFinished + 백그라운드 세션 확인 | feat: status bar items |
| 6 | 인라인 결과 — CodeLens(실행 버튼+통과 요약), DiagnosticCollection(실패 케이스), solutionLocator 순수 함수 | feat: inline test results |
| 7 | 커스텀 케이스 — StoredCase.source('sample'/'custom'), mergeCasesFile로 re-fetch 시 custom 보존, Add Test Case 커맨드 | feat: custom test cases |
| 8 | 단축키 — ctrl/cmd+alt+t(테스트), ctrl/cmd+alt+o(문제 열기). 계획의 ctrl+shift+t는 "닫은 편집기 다시 열기"와 충돌해 변경 | feat: keyboard shortcuts |
| 9 | 저장 시 자동 테스트 — programmers.runTestsOnSave(기본 on), 조용한 모드(Window progress), pending 병합, 실패 시 warning | feat: auto-run on save |

## 주요 설계 결정
- 상세 계획 파일(.claude/plans/lexical-brewing-hoare.md)이 유실되어 핸드오프 요약으로 재구성
- state.ts는 vscode 런타임 의존 없음(type-only import + 자체 Emitter) → jest 테스트 가능
- 자동 실행(Phase 9): 출력 채널을 강제로 열지 않고 CodeLens/상태 바/Diagnostics로 결과 노출
- 레거시 cases.json(source 필드 없음)은 샘플로 간주되어 re-fetch 시 교체됨 (의도된 트레이드오프)

## 테스트 상태
- 12 test suites, 89 tests 전체 통과 (기존 71 → 89)
- typecheck 통과, esbuild 번들 성공, vsce package 성공 (3.89MB/572파일)

## 남은 아이디어 (미구현, 사용자 미선택)
- 실패 케이스 expected/actual diff 뷰
- .programmers 폴더 스캔 아카이브 뷰
- Playwright 자동 제출 + 채점 결과 회수
- fetch 타임아웃 (fetchProblem/checkSession에 AbortSignal.timeout)
- runner.py 케이스별 타임아웃, float 비교 허용 오차

## 신규/수정 파일
- 신규: src/state.ts, src/sidebar.ts, src/statusBar.ts, src/inlineResults.ts,
  src/core/solutionLocator.ts, media/icon.svg, test/state.test.ts, test/core/solutionLocator.test.ts
- 수정: src/extension.ts(대폭), src/core/testRunner.ts(async), src/core/scaffold.ts(merge),
  package.json(views/menus/keybindings/configuration/activationEvents)
