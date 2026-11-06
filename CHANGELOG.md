# Changelog

## 0.1.2

- `aptly set env OPENAI_API_KEY --check`로 키 입력·저장 전에 실행 경로를 진단합니다. 초기 진단에서 호스트 하나라도 실패하면 CLI는 키를 입력받지 않고 모든 대상 설정을 유지합니다. 하위 API의 호스트별 부분 결과는 유지합니다.
- 호스트 하나를 지정한 `aptly setup --client claude --migrate-launcher --dry-run`으로 이전 내용을 확인하고, `--dry-run` 없이 명시적으로 적용할 수 있습니다. 소유권 기록과 일치하는 표준 등록만 갱신하며 사용자 지정 래퍼·변경된 등록을 자동 채택하지 않습니다.
- 키 설정 중 관측된 설정 변경을 거절하고, 복구 시 다른 프로세스의 키를 덮어쓰지 않습니다. 복구를 확인할 수 없으면 `credential_rollback_failed`를 반환합니다. 설정 파일과 OS 저장소 사이의 완전한 원자적 트랜잭션은 보장하지 않습니다.
- 영속 원장의 잠금을 Node.js 내장 SQLite의 프로세스 수명 잠금으로 전환합니다. SIGTERM·SIGKILL 뒤에도 기존 `unknown`·비용 예약·완료 캐시를 보존하며 새 요청 처리를 재개합니다. 원장 저장용 임시 파일은 PID 대신 고유 nonce를 사용합니다.
- **원장 업그레이드 시 모든 관련 호스트·MCP·CLI writer를 먼저 중지하고 함께 새 버전으로 전환해야 합니다.** 새 `.lock`은 정상 종료 후에도 유지됩니다. 기존 빈/미확인 잠금은 자동 삭제·초기화하지 않으며 확인된 legacy 잠금만 오프라인 절차로 격리합니다. JSON 원장과 비용·요청 기록을 초기화하지 않습니다.
- 분류 요청에서 작업의 허용 필드를 명시적으로 선택합니다. 기존 기본 공유 방식은 유지하며, 실제 전송 항목·비활성화 방법·민감 패턴 검사의 한계를 명시하고 합성 payload·메타데이터·로그 비노출 검사를 보강합니다. 더 넓은 공유 정책과 confidence 정책 결정은 #15·#14에 남아 있습니다.
- 빠른 시작과 일반 설치를 `npm install -g aptly@latest`로 통일하고, 부제에 OpenAI Decisions API 사용을 명시합니다. 릴리즈 기록과 기능별 최소 지원 버전은 유지합니다.
- Windows 잠금 CI에서 PowerShell을 사전 구동하고 테스트 파일을 직렬 실행합니다. 실제 다중 프로세스 경쟁 검사와 제품의 ACL 검증·제한 시간은 유지합니다.

## 0.1.1

- `aptly set default`와 `aptly set env ENV_KEY`로 Claude Code·Codex의 기본 환경 및 후보 모델을 설정할 수 있습니다. 기존 실행 명령·명시적 설정·advisory 정책을 보존합니다.
- API 키를 macOS Keychain·Windows Credential Manager·Linux Secret Service(`secret-tool`)에 호스트별로 저장하고 MCP 시작 시 읽습니다. 설정 파일에는 참조만 남기며, 저장소 오류가 나도 다른 환경 키로 대체하지 않습니다. 설정 실패 시 가능한 범위에서 이전 키를 복구합니다.
- Windows에서 UTF-8 입력·실제 PowerShell 실행 경로·설정 파일 ACL 보존을 보완했습니다. 키 입력과 실패 결과에 비밀 값이 노출되지 않도록 처리합니다.
- 인증 키가 없을 때 유료 제공자 호출과 원장 예산 예약을 시작하지 않도록 수정했습니다.
- lifecycle script를 실행하는 설치 시험은 별도 일회성 job으로 분리하고, 릴리즈 패키징은 새 runner에서 잠긴 의존성을 설치해 독립적으로 수행합니다. 시험 job의 파일·캐시·산출물은 릴리즈 패키징에 전달하지 않습니다.
- 설치한 npm archive의 compiled CLI·MCP를 Linux·macOS·Windows에서 시험하는 CI를 추가했습니다. 합성 Windows 자격 저장소·격리 설정 시험을 포함하며, Windows의 실제 Claude Code·Codex 세션 지원을 인증한 것은 아닙니다.
- 한국어·영어·중국어 간체·일본어의 설치 및 환경변수 안내, npm 전역 설치, 제한된 비용 실측 결과와 현재/과거 Hook 계약의 구분을 정리했습니다.
- 기존 사용자 지정·구버전 실행 경로는 자동 교체하지 않습니다. OS 키 연결에는 현재 패키지와 호환되는 표준 실행 경로가 필요합니다.

## 0.1.0 — 2026-11-05

- 기본 후보를 Claude Haiku/Sonnet/Opus와 Codex Luna(max)/Terra(high)/Sol(medium)의 세 단계로 구성했어요.
- 제공사별 JSON 문자열 환경변수로 후보를 선택하거나 비활성화하고, 모델명·effort·공식 특성을 Decisions 설명에 포함해요.
- 고정 공식 Markdown의 명시적 catalog refresh와 시작 시 읽는 7일 캐시, 동봉 설명 fallback을 추가해요.
- 추천과 Hook의 보존 경계·unknown 유료 요청 재호출 방지는 유지해요. 호스트 내부 패치는 계속 보류예요.
- 최초 공개 npm 버전입니다. 아래의 초안·preview 이력은 당시 검증 범위를 보존한 기록입니다.
- 이전 preview 검증 기록은 아래에 보존하며 새 카탈로그의 성공 근거로 재표시하지 않아요.

## 0.1.0-preview.0 — unreleased

- 추천 전용 advise 경로를 Hook 증거 조건과 분리하고 최소 요청·예제·사용 안내를 추가했어요. 기존 Hook gate·원장 unknown 재호출 방지는 유지해요.
- 최신 제품 MCP의 실제 Decisions smoke3회·초기 추천 평가8회를 기록하고, 사용 안내를 npm archive에 동봉했어요.

- Codex 고정 릴리스용 내부 provenance capture Rust 패치와 native 회귀를 추가했어요. 설정 결과를 유지하며 제품 자동 적용 경로에는 연결하지 않아요.

- 새 호스트 resolver·원자적 dispatch 계약과 fixture reference model을 추가했어요. 현재 Codex RPC나 제품 자동 적용 경로는 아니에요.

- 개발용 Codex 설정 관측 prototype과 무유료 회귀를 추가했어요. 파일/CLI 출처를 관측하지만 전체 native 세션의 증거는 인증하지 않아요.

- 표시명을 Aptly, 패키지·CLI·MCP 식별자를 aptly로 통일했어요. 새 진입점은 bin/aptly.ts예요.
- 새 진단은 aptly로 생성하고 이전 이름의 보고서는 원래 식별자를 보존해 읽어요.
- 이전 CLI 빌드 파일이 패키지에 섞이면 릴리스 검사를 실패시켜요.

- 소스·테스트·도구를 TypeScript로 전환하고 strict 검사·JavaScript/타입 선언 배포를 구성했어요.
- AGENTS.md를 로컬 지침으로 유지하고 Git·공개 소스에서 제외했어요.

- 로컬 진단 결과를 동일 report_id의 Markdown·JSON으로 내보내는 report와 GitHub 첨부 양식을 추가했어요.
- 공통 로컬 stdio MCP·명시적 advisory CLI·fixture smoke를 준비했어요.
- 일반 작업의 설정 우선순위·고정 선택·미확인 출처 진단을 추가했어요.
- host evidence를 session/cwd/call/input digest/version/time에 결합하고 source 변경 시 보수적으로 거부해요.
- 제품 코드와 합성 PoC·개인 실행 자료를 분리했어요.
- MIT·이식 가능한 회귀·무유료 CI·npm 파일 allowlist·공개 준비 검사를 추가했어요.

일반 업무의 품질·총비용 평가나 모든 호스트의 자동 적용 지원을 의미하지 않아요.
