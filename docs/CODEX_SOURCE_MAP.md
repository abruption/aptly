# Codex 호스트 소스 경로와 변경 지점

> **보류 — 2026-11-05 사용자 결정.** 이 문서는 기존 확장 연구·검증 기록을 보존한 자료예요. 호스트 내부 패치·추가 native 시험·broker/dispatch 구현은 명시적 재개 전까지 진행하지 않아요. 현재 MCP+Decisions 추천 preview의 출시 전제나 다음 작업이 아니에요. 현재 순서는 [ROADMAP](ROADMAP.md)을 따라요.

2026-11-05 읽기 전용 조사예요. 설치 CLI와 package metadata는 `0.166.0`이고, 공식 저장소의 같은 릴리스 태그 `rust-v0.166.0`를 commit **`6ff1e1ca3b30fc8b914720681fcf5fe62e95f856`**에 고정해 조사했어요. 아래 경로·줄 번호는 이 commit 기준이에요. 태그 객체는 `593389380740f7b4762771573c447ccfdc59742f`예요.

설치 binary의 version은 package manifest에서 표시할 수 있으므로 같은 버전명만으로 이 commit과 byte 단위로 일치하는 빌드라고 인증하지 않았어요. 설치 binary SHA-256과 조사한 파일 hash는 로컬 `.release/aptly-codex-source-trace-verification.json`에 기록해요. 공개 원본은 [고정 commit](https://github.com/openai/codex/tree/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856)이에요. 소스·설치 binary·사용자 설정을 변경하거나 native 세션·모델·Rust 빌드를 실행하지 않았어요.

## 자식 설정 resolver

공통 prefix는 `codex-rs/core/src/`예요.

| 위치 | 확인한 역할 | Aptly 변경 지점 |
|---|---|---|
| `tools/handlers/multi_agents_v2/spawn.rs:94` | V2 입력 파싱 → `thread_spawn::spawn` | native 호출 binding 유지 |
| `thread_spawn.rs:97`, `:124`, `:142` | V2 공통 prepare → SpawnRequest → agent control | resolver trace를 실제 요청과 함께 운반 |
| `tools/handlers/multi_agents/spawn.rs:53` | V1도 공통 child resolver 사용 | V1 별도 fork/role 규칙 보존 |
| `agent/child_config.rs:52` | `prepare_agent_spawn_config`가 자식 설정을 실제로 준비 | 각 merge 단계의 출처를 수집할 중심 지점 |
| `session/step_context.rs:22`, `session/step_settings.rs:36` | 해당 호출이 잡은 immutable step 설정 | 최신 thread 값 대신 captured step handle/revision 결합 |
| `agent/role.rs:130` | spawn 준비 중 role 파일을 읽음 | 읽은 bytes의 digest와 role identity를 그 순간 함께 수집 |
| `agent/role.rs:242` | role overlay를 SessionFlags 계층으로 투영 | 최종 layer만 보고 role/CLI 출처를 역추정하지 않음 |

실제 resolver 순서는 다음과 같아요.

1. `child_config.rs:110`은 turn config에서 시작하고 model·effort를 **호출의 StepContext.settings**로 채워요.
2. `:204`는 명시 spawn model/effort를 subagent 기본값보다 먼저 선택해요. model을 선택했으나 effort를 지정하지 않으면 그 모델의 기본 effort를 사용할 수 있어요.
3. `:71`에서 role을 그 뒤에 적용하므로 role model/effort가 명시 spawn 인자보다 나중에 덮어쓸 수 있어요.
4. `:84`에서 root tier 정책을 적용하고, `:175`의 runtime override로 turn의 approval·cwd·permission profile을 다시 적용해요.

V1 full-history fork는 role override를 거부하고 role 적용을 건너뛰어요. V2 fresh spawn은 role을 생략해도 default role 파일이 적용될 수 있어요. V2 full fork는 explicit role이 있을 때 role을 적용할 수 있어요. `fork_turns` 생략은 all이고 none만 fresh예요. Aptly의 기존 role/fork 보존 정책을 이 조사 때문에 느슨하게 바꾸지 않아요.

[공통 resolver 원본](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/core/src/agent/child_config.rs#L52), [role overlay 원본](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/core/src/agent/role.rs#L242)

## frozen step과 변경 revision

`ResolvedStepSettings`는 configured 선택과 effective 값을 구분해 보관하지만 전체 출처 history는 아니에요. 새 settings snapshot을 publication해도 이미 그것을 캡처한 step/action은 바뀌지 않아요. 따라서 adapter가 최신 thread model을 재조회해 자식에 복사하면 native 동작을 바꿀 수 있어요. ticket에는 **captured step identity/revision + 준비 과정에서 실제 사용한 가변 의존성의 generation/digest**가 필요해요.

| 변경 경로 | 위치 | 필요한 처리 |
|---|---|---|
| session 설정 publication | `session/mod.rs:2025`, `:2042`, `:2107` | 검증·publication lock과 결합한 session generation |
| thread 설정 적용 | `session/thread_settings.rs:156` | persistence permit·update·이벤트의 실제 publication에 결합 |
| 다음 step 설정 변경 | `session/step_activation.rs:231`, `:312`, `:376` | next-step generation과 이미 캡처한 step을 구분 |
| config refresh publication | `session/config_refresh.rs:52`, `:123` | owner snapshot과 managed policy를 publication 직전에 재확인 |
| Hook/plugin/skill/MCP refresh | `session/config_refresh.rs:163` | resolver 의존성과 coverage 무효화에 포함 |
| legacy file reload | `session/mod.rs:2389` | 파일 읽기와 publication 사이 변경을 재확인 |
| contributor 알림 | `session/mod.rs:2375` | 같은 effective 값이면 알림이 생략될 수 있으므로 완전한 revision feed로 쓰지 않음 |

`step_activation.rs:332` 이후는 준비를 lock 밖에서 수행하고 실제 publication 직전에 현재 policy를 다시 확인하는 선례예요. 이 패턴은 참고할 수 있지만 provider 분류 동안 기존 state lock을 잡아 두어서는 안 돼요. role 파일 변경은 같은 bytes A→B→A를 포함한 정책을 명확히 정하고, 단순 snapshot hash 비교를 전체 resolver revision으로 부르지 않아요.

[immutable step 원본](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/core/src/session/step_settings.rs#L36)

## 보안 Hook에서 실제 child 시작까지

| 순서 | 위치 | 실제 경계 |
|---|---|---|
| 공통 dispatch | `tools/registry.rs:709` | `dispatch_any_with_state`가 invocation 소유 |
| Hook 실행·deny·입력 교체 | `tools/registry.rs:839`, `hook_runtime.rs:196` | Hook await, block이면 handler 전에 반환, 유효한 updated input 적용 |
| Hook 결과 집계 | `codex-rs/hooks/src/events/pre_tool_use.rs:109`, `:153` | block 하나라도 있으면 rewrite 폐기; 아니면 실제 완료 순서가 마지막인 rewrite 선택 |
| 추가 review | `tools/registry.rs:885` | 해당 tool이 요구하는 경우 rewrite 이후 guardian review |
| 활성 호출 등록·관측 알림 | `tools/registry.rs:891` | reservation 활성화 뒤 `notify_tool_start().await` |
| native 준비·spawn 요청 | `thread_spawn.rs:97`, `:124` | resolver 준비 후 `AgentControl::spawn` |
| local backend | `agent/control/api.rs:58` | `spawn_agent_internal` 진입 |
| 실제 child startup | `agent/control/spawn.rs:609`, `:837` | 용량·residency 예약, child/edge 생성, initial input admission, 상태 조회 뒤 최종 commit |

기존 Hook들은 같은 원래 입력으로 실행된 뒤 rewrite를 합치므로 다른 deny Hook이 **최종 candidate를 재검사했다고 간주하면 안 돼요**. 새 라우팅 gate가 모델 필드를 바꿀 때는 그 candidate에 대한 최종 보안 결정을 별도로 결합해야 해요. side effect가 있는 Hook을 무조건 두 번 실행하는 변경으로 해결하지 않아요.

Hook 뒤에도 관측 알림·resolver 모델 정보 조회·환경과 policy 상속·child 생성·edge persistence·입력 수락 등 await가 있어요. 따라서 `registry.rs`에서 ticket을 한 번 검사하고 종료할 수 없어요. `thread_spawn::spawn`의 fresh 요청에는 원래 tool call ID가 직접 실리지 않고 fork용 call ID만 조건부 전달되므로, native backend까지 ticket/call binding을 전달할 변경이 필요해요.

`agent/control/spawn.rs:837` 이후 child는 initial input을 받은 뒤 상태 조회 await를 거쳐 reservation/residency를 commit하고 PendingSpawn을 해제해요. 이 사이 응답을 잃으면 실행 여부가 불명확해질 수 있어요. `agent/control/spawn_guard.rs`의 PendingSpawn은 정리 장치이며 영속적인 요청 dedup 원장은 아니에요. capacity/path 예약도 exactly-once 실행 증거가 아니에요.

호스트 전용 idle-child 경로인 `agent/host/spawn.rs:193`은 invocation 활성 수명과 최종 publication을 lock으로 결합하는 선례지만, native initial-input 실행 전체의 원자성을 그대로 제공하지는 않아요. 실제 구현은 기존 child/input admission과 복구 가능한 request receipt를 함께 설계해야 해요. source trace만으로 그 원자성을 구현했다고 표시하지 않아요.

[공통 registry](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/core/src/tools/registry.rs#L839), [native input admission](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/core/src/agent/control/spawn.rs#L837)

## 기존 host API의 재사용 범위

- `codex_thread.rs:275`의 `tool_invocation(turn_id, call_id)`와 `agent/host/invocation.rs:46`의 HostToolInvocationLookup는 활성 호출 binding의 재사용 후보예요.
- `codex_thread.rs:288`, `:300`의 create_child/prepare_child와 `ThreadManager::create_prepared_child`는 **동일 프로세스의 public Rust API**예요. 현재 외부 app-server RPC라는 뜻은 아니에요.
- `agent/host/invocation.rs:49`의 map은 weak reference를 사용하는 in-memory 활성 호출 목록이에요. 호출 종료·취소를 확인하는 기능을 crash 후 결과 조회용 영속 원장으로 확대 해석하지 않아요.
- `codex-rs/ext/extension-api/src/contributors.rs:410`의 ToolLifecycleContributor는 관측용이에요. on_tool_start는 Hook이 확정한 입력을 볼 수 있지만 native 인자를 재작성하는 contributor 계약은 아니에요.

[호출 lookup 원본](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/core/src/codex_thread.rs#L275), [관측 contributor 원본](https://github.com/openai/codex/blob/6ff1e1ca3b30fc8b914720681fcf5fe62e95f856/codex-rs/ext/extension-api/src/contributors.rs#L410)

MCP가 이 Rust API를 대신 호출해 자식을 하나 더 만들거나 native tool을 대체하는 방식으로 통합하지 않아요. 기존 active-call/prepare 구조를 재사용하되 실제 native spawn 경로에 resolver trace·제어 gate를 추가해야 해요. 관측 contributor만 설치해 전체 자동 적용이 완성된다고 볼 수 없어요.

## 최소 변경 순서

1. **관측 패치**: `agent/child_config.rs`의 PreparedSpawnConfig에 출처별 trace를 추가하고 `agent/role.rs`에서 실제 읽은 role digest를 전달해요. captured step과 model metadata 기본값도 구분해요. native 설정 선택 결과는 바꾸지 않아요.
2. **revision 패치**: session·step·policy·확장 publication과 trace를 결합해요. thread의 새 기본값을 이미 캡처한 step에 덮어쓰지 않아요. 출처가 미확인이면 unknown으로 남겨요.
3. **dispatch gate 패치**: native 보안 경로와 아래 실제 child publication 경계에 ticket 재검증·한 번의 소비를 결합해요. 새 원자성·취소·결과 불명 회귀가 필요해요.
4. **연결 패치**: `app-server-protocol/src/protocol/common.rs`와 app-server message processor에 새 버전의 제어 채널을 연결해요. 기존 ThreadSettingsUpdate/TurnSettingsUpdate나 experimentalApi opt-in을 adapter 인증으로 취급하지 않아요. active invocation이 생기는 시점과 PreToolUse의 순서를 해결한 뒤에 연결해요.
5. **native 무유료 시험 후 별도 live 시험**: 기존 mock Rust tests를 확장하고 child resolved metadata로 요청값과 실제값을 따로 확인해요. 실제 유료 시험·운영 설정·전역 설치는 이번 조사에 포함하지 않았어요.

기존 회귀 확장 후보는 `multi_agents_tests.rs`의 captured step 설정, role/fork 분기, runtime sandbox 재적용 시험과 `session/config_refresh_tests.rs`, `session/tests.rs`, `agent/host/{invocation_tests,spawn_tests}.rs`예요. V2 handler의 `SubAgentActivity`가 보고하는 resolved model/effort는 후속 실제 적용 관측 후보예요. Rust 빌드·이 시험들은 이번에 실행하지 않았어요.

## 후속 패치의 검증 기준

첫 패치는 **출처 관측만** 수행하는 개발 빌드가 적절해요. 공통 resolver에 trace DTO를 붙여 같은 입력의 native model/effort·권한 결과가 변하지 않는지 mock 시험으로 확인한 뒤 적용 gate를 별도 구현해요. 자동 적용·새 spawn 명령·전역 CLI 교체는 이 단계에 넣지 않아요.

확장할 정확한 시험 후보는 다음과 같아요.

- `core/src/tools/handlers/multi_agents_tests.rs`: `build_agent_spawn_config_uses_captured_step_settings_and_turn_context_values`, `spawn_agent_reapplies_runtime_sandbox_after_role_config`, V1/V2 role/fork 분기
- `core/src/agent/host/invocation_tests.rs`: `dispatch_revokes_access_and_holds_call_id_through_callbacks` — 활성 수명, terminal callback 뒤 같은 ID 재예약 가능성
- `core/src/agent/host/spawn_tests.rs`: `prepared_spawn_captures_policy_after_fork_history`, `same_manager_creation_retains_step_executor_and_shares_exec_policy`
- `core/src/agent/control_tests.rs`: `cancelled_spawn_after_input_admission_discards_child`, `v2_spawn_resolves_reported_effort_without_changing_child_selection`
- `core/tests/suite/hooks.rs`: `pre_tool_use_hook_model_tracks_step_after_a_turn_update`, block/rewrite 시험
- `hooks/src/events/pre_tool_use.rs`: deny 우선, competing rewrite의 completion-order 시험

이 목록은 실행 결과가 아닌 후속 회귀 대상이에요. 새로 추가할 시험은 stage별 출처 일치, role/sessionFlags 구분, frozen-step 유지, ABA/reload 무효화, 최종 candidate 보안 거부, admission 뒤 취소/응답 유실 시 자동 retry 차단이에요.
