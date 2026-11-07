# Changelog

## 0.1.5 — 릴리즈 준비

- `needs_context`에서 작업 설명을 한 번 보충하는 `retry_spawn_recommendation`을 추가합니다. 활성 `defaults` Hook은 해당 스폰을 보류하고 부모에게 복구 ID와 안내를 전달합니다. 미래 native 호출 ID를 만들 필요 없이 같은 MCP 프로세스에서 5분 안에 보충할 수 있습니다. (#70, PR #71)
- 재추천 응답에 미지정 필드만 담은 `next_call.set_if_unspecified`를 제공합니다. `context_retry_allowed: false`는 추가 설명 보충의 종료를 뜻하며 기존 위임 권한이나 호스트 권한 검사를 대체하지 않습니다. 중복 캐시·고정 요청 ID·설명 해시·예산·결과 불명·취소·만료 보호를 유지합니다.
- 활성화된 유효한 `defaults` 경로는 적용 불가·분류 실패·예산 초과·결과 불명에서 안전한 사유와 `deny`를 반환합니다. 부모 기본 모델로 조용히 실행하지 않습니다. 상속 적용은 계속 미검증이며 이력이나 fork를 자동 변경하지 않습니다. `advisory`와 명시 선택·고정 역할·resume의 보존 경계는 유지합니다. (#69, PR #72)
- `get_spawn_routing_observation`이 정확한 `{client,event}` 또는 `{retry_id}`를 받습니다. 원래 사전 검사·복구 분류·최근 거절을 구분하고 입력 스키마 노출과 동일 이벤트 재처리 시 관측 보존을 보완합니다. 서버의 실행 관측은 계속 `not_observed`입니다.
- README 4개에서 빠른 시작에 `aptly set env OPENAI_API_KEY`를 명시하고 최초 설치와 업데이트 절차를 분리합니다. 신규 안내는 0.1.5 최소 지원으로 표시하며 기존 기능의 최소 버전은 유지합니다. (#67, PR #68)
- PR #72가 스택 기반 브랜치에 병합돼 main에서 누락된 상태를 확인하고 릴리즈 준비 PR에서 이미 승인된 소스를 통합합니다. 준비는 #73에서 추적하며 아직 태그 생성·npm 게시·provenance 검증을 수행하지 않았습니다.

## 0.1.4 — 2026-11-06

- 설치된 `PreToolUse` Hook의 사전 검사에서 Codex의 상속·생략 fork도 추천을 평가합니다. 모델·effort 중 일부만 지정한 경우 일치하는 허용 튜플로 후보를 제한하고 미지정 필드만 채웁니다. 고정 역할·resume·기존 선택과 이력은 보존합니다. (#59, PR #60)
- 암호화된 Codex 본문을 해독·전송하지 않고 `cleanup_merged_worktrees` 같은 구체적인 짧은 작업명을 제한된 허용 목록으로 분류할 수 있습니다. 입력이 부족하면 로컬 `insufficient_context` 또는 제공자의 `provider_needs_context`로 보류할 수 있으며 추천을 보장하지 않습니다.
- Codex의 실제 인자 변경은 계속 명시적 `fork_turns: "none"`에 한정합니다. 상속·생략 호출의 `inherited_context_application_unverified`는 제품의 적용 차단 경계이며, 모든 호스트에서 override가 불가능하다는 뜻은 아닙니다. 추천·Hook 인자 출력·실제 자식 실행을 구분합니다.
- 프로세스 공용 `automatic_hook.last_result`를 제거하고 `get_spawn_routing_observation({client,event})`을 추가합니다. 동일 MCP 프로세스에서 정확히 일치하는 호출을 최근 128개·10분 범위로 조회합니다. `arguments_updated`는 인자를 출력했다는 뜻이며 실행 메타데이터 관측을 뜻하지 않습니다.
- `prepare_spawn_context`·`cancel_spawn_context`로 정확한 예정 호출에 짧은 설명을 등록·취소할 수 있습니다. 실제 client/session/call ID와 원본 이벤트를 알고 같은 MCP 프로세스에 연결하는 호출자용 프로토콜입니다. 기본 Hook의 자동 설명 생성이나 호출 ID 배정 기능은 포함하지 않습니다. (#61, PR #62)
- 설명 연결은 불변이며 5분 뒤 만료됩니다. 프로세스당 128개 한도에서 취소·만료 tombstone을 유지하고, 설명 해시를 입력·정책·후보의 영속 요청 결합에 포함합니다. 새 ID로 결과 불명인 유료 요청을 우회하거나 자동으로 더 풍부한 설명을 재시도하지 않습니다.
- 상속·부분 지정 호출에서도 제한된 작업 요약을 전송할 수 있습니다. 명시적 설명을 사용하면 설명만 작업 텍스트로 전달하고 암호문·이력·파일은 추가하지 않으며 URL을 자동 조회하지 않습니다. 정책의 `enabled: false` 공유 거부, 알려진 민감 패턴 검사와 예산·캐시·취소·중복 요청 보호는 유지합니다. 더 넓은 공유 정책과 confidence 결정은 #15·#14에 남아 있습니다.
- `v0.1.4` 태그의 Actions OIDC 게시와 registry 파일·서명·provenance 검증을 완료했습니다. 준비는 #63·PR #64, 실제 게시 근거는 #65와 [0.1.4 검증 기록](docs/releases/0.1.4.md)에 기록합니다. 기능별 0.1.3 최소 지원 버전과 기존 원장 전환 경계는 유지합니다.

## 0.1.3 — 2026-11-06

- `--migrate-launcher --include-existing`으로 기존에 보존한 표준 MCP 등록의 실행 경로를 명시적으로 갱신할 수 있습니다. 유효한 소유 기록과 관리 환경변수·Hook·정책 일치를 확인하며, `mcp_created: false`를 유지해 MCP 전체를 새로 소유하지 않습니다. 기본 이전 명령·자동 설치의 거절 조건과 사용자 래퍼 보존은 유지합니다. (#45, #47)
- 기본 설치 명령을 `npm install -g aptly@latest --allow-scripts=aptly`로 안내합니다. npm의 미검토 스크립트 경고와 실제 실행 차단을 구분하고, 옵션 미지원 시 `--ignore-scripts` 설치 후 명시적 `setup`을 사용하는 대안을 제공합니다. 사용자 전체의 npm 허용 설정은 변경하지 않습니다. (#46, #50)
- `aptly update`를 추가합니다. 실행 중인 패키지와 일치하는 전역 npm 설치만 동일 prefix에서 갱신하며 설치 스크립트는 실행하지 않습니다. 업데이트 후 `setup`과 호스트 재시작이 필요하고 기존 사용자 실행 경로는 자동 이전하지 않습니다. 유효한 npm 설정이 `dry-run=true`이면 `update_dry_run_enabled`로 거절하고 설정 조회가 불명확하면 중단합니다. (#48, #51)
- 대화형 일반 CLI에서 새 안정 버전 알림을 stderr로 표시합니다. 모든 표준 스트림이 터미널일 때만 확인하며 MCP·자동 setup·추천/분류 경로·파이프·CI는 제외합니다. 공개 버전 메타데이터 조회를 800ms·16KiB로 제한하고 24시간 캐시·실패 후 1시간 대기를 적용합니다. `APTLY_NO_UPDATE_NOTIFIER=1`로 끌 수 있으며 자동 설치는 하지 않습니다. (#49, #52)
- 스택 PR #52가 기존 작업 브랜치에만 병합돼 main에서 누락된 알림 변경을 PR #54로 통합했습니다. (#53, #54)
- `v0.1.3` 태그의 Actions OIDC 게시와 registry 파일·서명·provenance 검증을 완료했습니다. 준비는 #55·PR #56, 실제 게시 근거는 #57과 [0.1.3 검증 기록](docs/releases/0.1.3.md)에 기록합니다.

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
