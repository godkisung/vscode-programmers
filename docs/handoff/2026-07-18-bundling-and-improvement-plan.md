# 2026-07-18 Handoff: esbuild 번들링 완료 + 고도화 계획

## 완료된 작업

### Phase 1: esbuild 번들링
- `esbuild` 추가 (devDependency)
- `esbuild.mjs` 빌드 스크립트 생성 (external: vscode, playwright-core)
- `package.json` scripts 변경:
  - `vscode:prepublish`: `tsc --noEmit && node esbuild.mjs`
  - `build`: `node esbuild.mjs`
  - `typecheck`: `tsc --noEmit`
  - `watch`: `node esbuild.mjs --watch`
  - `compile`: 유지 (하위 호환)
- `.vscodeignore` 업데이트: node_modules 제외 (playwright-core만 포함)
- `testRunner.ts`: 번들/테스트 환경 모두 동작하도록 `resolveRunnerPath()` 도입
- **결과**: 4.88MB/1529파일 → 3.68MB/504파일 (주로 playwright-core)

### vsix 패키징 테스트
- `npx @vscode/vsce package` 성공
- `publisher: "godkisng"` 추가됨

## 테스트 상태
- 10 test suites, 71 tests 전체 통과

## 남은 작업 (고도화 계획)

아래 Phase 2-8 구현 대기 중:

| Phase | 내용 | 상태 |
|-------|------|------|
| 2 | 비동기 테스트 러너 (spawn + withProgress + 취소) | pending |
| 3 | 공유 상태 모듈 (src/state.ts, EventEmitter) | pending |
| 4 | 사이드바 TreeView (활동 바 아이콘, 문제 목록) | pending |
| 5 | 상태 바 (연결 상태 + 현재 문제) | pending |
| 6 | 인라인 테스트 결과 (CodeLens, Diagnostics, 데코레이션) | pending |
| 7 | 커스텀 테스트 케이스 (source 필드, 보존 로직) | pending |
| 8 | 키보드 단축키 (Cmd+Shift+T, Cmd+Alt+O) | pending |

### 구현 순서
```
Phase 2 → Phase 3 → Phase 4 + 5 (병렬) → Phase 6 → Phase 7 → Phase 8
```

### 핵심 설계 결정
- Python 전용 유지 (다국어 미지원)
- 공유 상태 모듈(Phase 3): TreeView, StatusBar, CodeLens 모두 구독하는 EventEmitter 패턴
- 인라인 결과(Phase 6): CodeLens + DiagnosticCollection 조합
- 커스텀 테스트(Phase 7): `source: 'sample' | 'custom'` 필드로 구분, re-fetch 시 custom 보존

## 수정된 파일 목록
- `package.json` (publisher, scripts, esbuild dep)
- `.vscodeignore` (node_modules 제외, playwright-core 포함)
- `src/core/testRunner.ts` (resolveRunnerPath)
- `esbuild.mjs` (신규)

## 다음 세션 시작 가이드
1. `npm test` → 전체 통과 확인
2. Phase 2부터 구현 시작 (testRunner.ts를 async로 전환)
3. 상세 계획: `.claude/plans/lexical-brewing-hoare.md` 참조
