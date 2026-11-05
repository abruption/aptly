# Codex 자식 설정 provenance capture 패치

> **보류 — 2026-11-05 사용자 결정.** 이 문서는 기존 확장 연구·검증 기록을 보존한 자료예요. 호스트 내부 패치·추가 native 시험·broker/dispatch 구현은 명시적 재개 전까지 진행하지 않아요. 현재 MCP+Decisions 추천 preview의 출시 전제나 다음 작업이 아니에요. 현재 순서는 [ROADMAP](ROADMAP.md)을 따라요.

기준은 `rust-v0.166.0`, commit `6ff1e1ca3b30fc8b914720681fcf5fe62e95f856`예요. 수정한 개발용 소스는 Git에서 제외한 `.local/codex-host`에 보존하고, 공개 검토용 변경은 [패치](../scripts/codex-host-patch/provenance-capture.patch)와 [manifest](../scripts/codex-host-patch/manifest.json)에 따로 보관해요. 설치된 CLI·사용자 설정·Aptly 제품 서버는 변경하지 않았어요.

## 구현 범위

`PreparedSpawnConfig`가 원래 `config`·`role_name`에 더해 내부 `SpawnProvenance`와 `Arc<ResolvedStepSettings>`를 반환해요. Arc는 호출이 실제 사용한 immutable step을 잡으며 최신 thread 설정으로 대체하지 않아요. 모델·effort 선택·검증·role 적용·tier·runtime 권한 재적용 순서는 유지해요.

출처 label은 CapturedStep, ExplicitSpawn, SubagentDefault, ModelDefault, Role예요. CapturedStep은 원래 선택의 하위 출처가 모두 확인됐다는 뜻이 아니에요. model-only 선택 뒤 metadata 기본 effort와 명시/기본 effort도 구분해요.

역할 적용에는 기존 API를 보존한 관측 wrapper를 추가했어요. 실제로 읽은 같은 UTF-8 bytes에서 SHA-256을 계산하고, builtin/file 구분과 파싱된 model·effort 필드 존재 여부를 기록해요. 역할 파일을 다시 읽거나 최종 Config 값의 차이로 출처를 추정하지 않아요. 같은 값을 명시한 role과 빈/comment-only role도 관측돼요. 원문·경로·role 이름·실제 모델값은 provenance 구조에 넣지 않으며 이 구조에 Debug·Serialize를 제공하지 않아요. 기존 오류 처리·로그 동작은 바꾸지 않아요.

patch는 core의 기존 workspace sha2 0.10.9 의존성과 lockfile 참조를 추가해요. 기존 role 적용 API의 반환형은 유지하고 내부 관측 함수에서만 trace를 돌려줘요. upstream release의 Cargo.toml은 workspace 0.166.0인데 원래 lockfile의 workspace 항목은 0.0.0이어서, locked 검사에 필요한 로컬 package 버전 정규화도 포함했어요. registry/git 의존성 항목은 원본과 동일함을 별도로 비교했어요.

## 아직 연결하지 않은 범위

현재 native 호출자는 PreparedSpawnConfig의 config와 role_name만 소비해요. 이번 변경은 **resolver 내부의 수집·반환까지**이며 외부 observer·backend·MCP·진단 파일에 trace를 전달하지 않아요. 자동 라우팅·전체 effective host evidence·captured step ID/revision 발급·변경 watcher·인증 채널·native enqueue 원자성·영속 dedup을 구현한 패치가 아니에요. 이 데이터만으로 `eligible`이나 `verified`를 부여하면 안 돼요.

관측 trace를 전달할 후속 adapter도 실제 자식 설정 선택과 기존 보안 Hook을 보존해야 해요. 준비 중 발생한 role 파일 변경·policy generation 결합과 native queue 검증은 [호스트 계약](HOST_DISPATCH_CONTRACT.md)에 따른 별도 작업이에요.

## 검토·적용·검증

manifest의 commit·patch SHA-256을 먼저 확인해요. 깨끗한 동일 commit checkout에서 `git apply --check` 후 패치를 적용할 수 있어요. 개발용 `.local/codex-host`에는 이미 적용돼 있으므로 다시 적용하지 않아요. upstream 소스 자체는 Apache-2.0이고 원본 LICENSE·NOTICE를 패치 옆에 보존했어요.

새 unit/mock 시험은 13개예요.

| 범위 | 추가 시험 | 확인할 사항 |
|---|---:|---|
| standalone provenance 타입 | 3 | 초기 CapturedStep, 독립적인 model/effort role 존재, 파일 없는 role |
| 실제 role loader/적용 | 6 | exact read digest, 같은 값·빈 파일·comment 변경·builtin·오류·기존 Config 결과 |
| native child resolver mock | 4 | frozen Arc/전체 Config 보존, 인자/기본값/metadata 구분, role digest·권한·default role, V1/V2 fork |

Rust 1.95.0의 공식 archive checksum을 확인하고 프로젝트 내부 `.local/rust-1.95.0`에 도구를 준비했어요. 전역 PATH·셸 설정·기존 Rust 설치를 변경하지 않았어요. Rust installer가 공백 있는 prefix를 처리하지 못해 archive의 선택한 rustc/std/cargo/rustfmt component를 로컬 prefix에 직접 배치했어요. 다운로드·빌드 임시물은 작업 볼륨의 전용 codex 디렉터리를 사용해요.

full workspace 검사는 Codex core와 그 test target의 의존성을 포함하므로 git/submodule·native build 도구가 필요해요. 외부 의존성 단계에서 멈추면 standalone 타입 시험 통과를 native 통합 통과로 표시하지 않아요. 정확한 이번 실행 상태는 아래 검증 기록과 인계를 기준으로 확인해요.


## 이번 검증 결과

- Rust 1.95.0에서 Codex core library와 test target 전체의 `cargo check --locked -p codex-core --lib --tests` 통과
- 추가한 13개를 포함한 관련 native unit/mock **40/40 통과**: provenance 15, 기존 role 22, captured step 기존 회귀 2, runtime sandbox 기존 회귀 1
- upstream `justfile`의 **RUST_MIN_STACK=8388608** 조건 사용. 기본 스택으로 실행한 sandbox 시험은 stack overflow였고 이 조건으로 재실행해 통과했어요
- 독립 Rust provenance 모듈 3개 시험 통과, 수정 Rust 파일 rustfmt check·git diff check 통과
- patch SHA-256·원본 index 적용 검사·현재 변경의 역적용 검사 통과
- Aptly 기존 **177/177** 시험·typecheck/build·fixture MCP smoke·공개 파일 검사 통과

안정 Rust의 rustfmt는 upstream의 nightly 전용 imports_granularity 옵션을 무시한다는 경고를 출력했어요. 실제 parse/format check는 통과했어요. core의 미사용 관측 필드 경고는 아직 native 호출자가 이 필드를 소비하지 않기 때문이며 숨기지 않았어요.

첫 Cargo 시도는 V8 submodule 다운로드의 SecureTransport 연결 종료로 중단됐어요. Git CLI 전송으로 pinned source를 받아 재시도했고 이후 검사·시험은 통과했어요. 전체 core 2,884개 시험을 실행한 것은 아니며 위 관련 40개만 실행했어요. native 시험은 mock 설정·모델 metadata를 사용하고 실제 모델 turn·자식 실행·분류 API를 호출하지 않았어요.

개발용 소스·Rust 도구체인·공개 의존성 cache는 `.local/`에 보존했어요. 작업 전용 tmp의 target은 후속 빌드용 cache로 보존하고 불필요한 archive·추출본·독립 시험 binary·잔여 fixture는 정리해요. 로컬 경로는 `.local/codex-host-development.json`에, hash와 검증 요약은 `.release/aptly-codex-provenance-capture-verification.json`에 기록해요. 이 둘은 Git·공개 archive에 넣지 않아요.

재현은 manifest의 exact commit에 patch를 적용한 뒤 Rust 1.95.0에서 진행해요. TMPDIR와 CARGO_TARGET_DIR는 작업 볼륨의 전용 임시 경로로, CARGO_HOME은 자격 없는 전용 의존성 cache로 지정해요. 프로젝트 내부 portable 도구체인을 사용한다면 RUSTC/RUSTDOC도 해당 prefix로 지정해야 해요.

```sh
# 패치한 Codex checkout의 codex-rs에서, 위 환경을 준비한 뒤 실행해요.
cargo check --locked -p codex-core --lib --tests
RUST_MIN_STACK=8388608 cargo test --locked -p codex-core --lib provenance
RUST_MIN_STACK=8388608 cargo test --locked -p codex-core --lib agent::role::tests
RUST_MIN_STACK=8388608 cargo test --locked -p codex-core --lib build_agent_spawn_config_uses_captured_step_settings_and_turn_context_values
RUST_MIN_STACK=8388608 cargo test --locked -p codex-core --lib spawn_agent_reapplies_runtime_sandbox_after_role_config
```
