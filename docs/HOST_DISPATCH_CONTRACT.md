# 호스트 resolver·dispatch 인터페이스 제안

> **보류 — 2026-11-05 사용자 결정.** 이 문서는 기존 확장 연구·검증 기록을 보존한 자료예요. 호스트 내부 패치·추가 native 시험·broker/dispatch 구현은 명시적 재개 전까지 진행하지 않아요. 현재 MCP+Decisions 추천 preview의 출시 전제나 다음 작업이 아니에요. 현재 순서는 [ROADMAP](ROADMAP.md)을 따라요.

2026-11-05 설계예요. 아래 API 이름·DTO·revision·ticket은 **Aptly가 요구하는 새 호스트 계약 제안**이며 현재 Codex app-server의 지원 RPC가 아니에요. 기존 `config/read`, `thread/settings/updated`로 이 계약을 제공한다고 간주하지 않아요. 설치 버전에서 확인한 범위는 [Codex prototype](CODEX_HOST_PROBE.md)에 있어요.

이 계약의 목적은 같은 native 세션의 출처별 설정을 관측하고, 그 관측과 호출이 여전히 유효할 때만 모델 필드를 반영해 native 실행 큐에 한 번 넣는 거예요. 구현은 세션과 resolver·tool dispatch를 소유하는 호스트 내부에 있어야 해요. 현재 제품 MCP·private envelope v1에 자동 적용 경로를 추가한 문서가 아니에요.

## 제어 채널과 권한

호스트 adapter와 Aptly broker는 작업 실행 채널과 분리한 인증된 로컬 제어 채널을 사용해요. 연결 시 호스트 identity, adapter identity/version, host version, 계약 version, process epoch와 지원 coverage를 고정해요. 연결 후 identity를 메시지 필드만으로 바꾸지 못하게 해요. broker는 승인한 adapter·host version·계약 조합만 사용하고 capability의 자기 선언을 실제 관측의 증명으로 취급하지 않아요.

작업 텍스트·MCP tool argument·provider 응답이 control identity, coverage, revision, ticket, `verified`를 발급할 수 없어야 해요. 인증 수단이나 ticket writer capability는 작업 프로세스에 넘기지 않아요. 같은 OS UID와 private 파일 권한만으로 동일 사용자 프로세스에 대한 격리가 성립한다고 주장하지 않아요. 선택한 OS·호스트의 채널 인증과 작업 sandbox가 이 경계를 보장하지 못하면 shadow만 지원해요.

호스트는 자식 실행과 기존 인증·문맥·권한을 계속 소유해요. 이 채널은 agent spawn 권한을 추가하지 않고, 다른 Hook의 deny·승인·샌드박스·고정 역할·fork·resume을 우회하지 않아요. 제어 메시지는 task 원문·API 키·원시 오류·실제 설정값을 진단 출력으로 내보내지 않아요.

## 제안 데이터 계약

다음 TypeScript는 wire 설계를 설명하는 예예요. 구현 시 길이·개수·형식·unknown field와 중복 키를 엄격히 검사하는 versioned schema가 필요해요. `request_id`·`ticket_id`는 추측 불가능한 opaque 값이고, 공개 보고서에는 원본을 노출하지 않아요.

```ts
type CallBinding = {
  session_id: string;
  turn_id: string;
  captured_step_id: string;     // 새 host 발급 handle; 기존 RPC 필드가 아님
  captured_step_revision: string; // 호출이 실제로 캡처한 immutable settings
  cwd: string;                 // host가 정규화한 현재 cwd
  tool_call_id: string;
  tool_input_sha256: string;   // digestToolInput 규칙의 원래 입력 digest
};
type Snapshot = {
  contract_version: 1;
  host_identity: string;       // 인증된 연결에 고정된 identity
  adapter_identity: string;
  adapter_version: string;
  host_version: string;
  epoch: string;               // host 재시작·resolver 재생성 시 새 값
  resolver_revision: string;   // epoch 안에서 단조 증가하는 정수 문자열
  ticket_id: string;
  request_id: string;
  binding: CallBinding;
  issued_at_ms: number;
  expires_at_ms: number;
  coverage: {
    layers: Array<{ source: string; model: 'unset'|'pinned'|'unknown';
      effort: 'unset'|'pinned'|'unknown' }>;
    environment: Record<string, 'unset'|'set'|'unknown'>;
    adapter_observed: boolean;
    other_extensions: 'observed'|'unknown';
  };
  policy_version: string;
  catalog_version: string;
};
type RecommendationBinding = {
  request_id: string;
  ticket_id: string;
  epoch: string;
  resolver_revision: string;
  binding: CallBinding;
  policy_version: string;
  catalog_version: string;
  profile_id: string;          // host·operator가 허용한 catalog 안에서만 선택
};
```

정확한 coverage의 source·환경 이름은 [provenanceRequirements](../src/provenance.ts)가 기준이에요. 출처의 `unset`은 resolver가 그 출처의 부재를 관측한 경우에만 사용해요. 미관측·불완전한 coverage는 `unknown`이고 snapshot을 발급하더라도 적용 가능한 ticket으로 승격하지 않아요. 출처별 pin과 명시 인자는 기존 보존 정책을 그대로 적용해요.

별도 adapter 자체의 identity·관측과 그 외 확장의 coverage를 구분해요. adapter가 설치돼 있는데 기존 v1의 `host_extensions: none`이라고 기록해 우회하지 않아요. 새 계약을 v1 JSON의 추가 필드나 자기 선언 `evidence_verified`로 흉내 내지 않아요.

소스 추적으로 확인한 native 의미는 **현재 호출의 frozen StepContext.settings**를 기준으로 자식을 준비하는 것이에요. ticket은 그 step snapshot identity/revision에 결합하고, 나중에 바뀐 최신 thread 모델로 교체하지 않아요. `captured_step_id/revision`은 새로 요구하는 host 식별자이며 현재 Codex RPC에 이미 있다는 뜻이 아니에요. 준비 중 읽는 role 파일·managed policy·확장 등 가변 의존성은 별도 generation/digest로 재검증해요. 모든 thread 변경을 보수적으로 invalidate할 수는 있지만, invalidate 뒤 최신 설정을 자식에 강제로 복사해서는 안 돼요.

`resolver_revision`은 설정 파일 hash가 아니에요. invocation/session/turn override, role·agent 정의, subagent defaults, profile, project/user/system/managed 계층, 관련 환경, 추가 디렉터리·확장과 정책·catalog 등 자식 해석에 영향을 주는 상태가 바뀌면 증가해야 해요. 값이 A→B→A로 돌아와도 revision은 돌아가지 않아요. 관측하지 못한 변경이 가능하거나 revision을 읽는 순간과 resolver 상태가 일치하지 않으면 적용 불가예요. overflow·resolver 재초기화는 새 epoch로 전환하고 기존 ticket을 폐기해요.

## 제안 API와 수명주기

| 제안 API | 입력·응답 | 호스트의 보장 |
|---|---|---|
| `captureSpawnSnapshot` | host 내부의 현재 call handle·request ID → immutable snapshot 또는 고정 보류 코드 | 같은 resolver revision에서 호출 binding과 전체 coverage를 읽고 ticket 발급 |
| `compareAndEnqueue` | ticket에 결합한 추천 → queued receipt 또는 유지·deny·만료·취소·unknown | 아래 최종 검증과 ticket 소비·native enqueue를 한 경계에서 처리 |
| `getDispatchResult` | 같은 identity/epoch의 request ID·ticket ID → 기존 receipt/상태 | 실제 enqueue를 반복하지 않고 기존 결과만 조회 |
| `cancelTicket` | 같은 ticket·call → 취소 결과 또는 기존 terminal receipt | 아직 소비하지 않은 ticket을 취소하고 지연 응답을 차단 |

`captureSpawnSnapshot`은 agent가 보낸 `CallBinding`을 그대로 믿지 않고 host 내부의 해당 tool invocation으로 값을 얻어요. digest는 현재 `digestToolInput`의 정규화 규칙을 사용하고, native alias·문자열 transport를 다르게 해석해 재사용하지 않아요. snapshot을 발급한 뒤 실제 분류를 기다리는 동안 resolver lock을 잡아 두지 않아요.

예를 들어 host 내부 호출을 제어 채널로 직렬화할 때 아래 이름을 사용할 수 있어요. **현재 Codex에 보내는 실행 예제가 아니에요.**

```json
{
  "proposal_method": "compareAndEnqueue",
  "contract_version": 1,
  "ticket_id": "opaque-ticket",
  "request_id": "opaque-request",
  "epoch": "host-epoch",
  "resolver_revision": "42",
  "profile_id": "codex-routine",
  "policy_version": "bound-policy",
  "catalog_version": "bound-catalog"
}
```

이 축약 예의 binding은 서버가 보관한 immutable ticket과 일치해야 하며, wire에서 binding을 생략할 수 있는지는 인증 채널·ticket 조회 계약으로 명시해야 해요. 다른 session/turn/cwd/call/digest의 추천을 같은 ticket에 덮어쓸 수 없어요. provider가 자유로운 model·effort나 실행 명령을 주는 경로도 만들지 않아요.

## 최종 검증과 원자적 enqueue

호스트는 먼저 추천된 profile을 현재 신뢰된 catalog에서 해석하고 원래 입력의 **허용 모델 필드만** 바꾼 candidate를 만들어요. 기존 pin·role·fork·resume 보존 판정과 모델/effort 조합 검증을 다시 수행해요. 작업·권한·sandbox·기타 인자는 그대로 보존해요.

모든 보안 Hook과 승인 경로는 최종 candidate를 대상으로 실행해야 해요. 마지막 권한 결정이 deny면 자식은 0개이고 추천을 적용하지 않아요. 권한·Hook 결과가 원래 입력에만 묶여 있다면 candidate를 승인했다고 재사용하지 않아요. 보안 Hook이 입력을 추가로 바꾸면 최종 digest를 다시 계산하고, ticket이 허용한 모델 필드 변경 외의 차이가 생겼으면 ticket을 무효화해요. 모델 필드가 달라져도 추천 candidate와 다르면 재사용하지 않아요.

그 뒤 호스트의 dispatch 경계에서 아래를 **하나의 원자적 처리**로 검증하고 ticket을 소비하며 enqueue해요. await·외부 callback 사이에 검증과 소비·enqueue를 나누어서는 안 돼요.

1. 인증 identity·adapter/host version·epoch·세션/turn/cwd/call ID와 원래 input digest가 ticket과 같고, 현재 호출이 취소·완료되지 않았는지 확인해요.
2. 현재 resolver revision, policy/catalog version, coverage와 보존 판정이 capture 당시와 여전히 유효한지 확인해요. expiry는 host의 단조 시간으로 재확인하고 외부 시계 값을 신뢰하지 않아요.
3. 추천이 같은 ticket·request·snapshot에 결합돼 있고 profile이 여전히 허용되는지 확인해요. 다른 보안 Hook의 최종 결과와 최종 candidate digest가 현재 호출에 결합돼 있어야 해요.
4. ticket을 한 번만 소비하고, native dispatch queue에 동일 call의 실행 의도를 한 번만 넣고 receipt를 기록해요. native 실행 자체는 기존 호스트 경로를 사용해요.

권한 확인 이후에도 resolver·policy·Hook 상태가 바뀔 수 있다면 이 경계에서 다시 확인하거나 최종 보안 결정도 revision에 결합해야 해요. 외부 thread 설정 알림이나 파일 재조회만으로 이 직렬화를 대체할 수 없어요. 구현이 native enqueue와 ticket 소비를 원자적으로 결합하지 못하면 운영 apply를 지원하지 않아요.

추천을 유지·보류하는 결과는 별도 spawn 명령이 아니에요. 원래 호출을 실행할지, 보안 deny로 차단할지는 같은 native 호출의 기존 dispatch가 한 번만 결정해요. Aptly가 fallback 자식을 추가 생성하지 않아요.

## 상태·중복·실패 처리

권장 상태는 `captured` → `queued`, `preserved`, `denied`, `cancelled`, `expired`, `stale`, `unknown`이에요. 뒤의 일곱 상태는 terminal이며 다시 `captured`로 바꾸지 않아요. `queued`는 enqueue receipt를 받았다는 뜻이고 자식 완료·품질 성공을 뜻하지 않아요. 실제 resolved 모델·effort와 실행 완료는 후속 child metadata로 관측해요.

동일 request/ticket의 중복 요청은 기존 결과를 반환해요. 같은 request ID에 다른 binding·추천 내용이 오면 conflict로 보류하고 원래 요청 기록을 덮어쓰지 않아요. 취소가 먼저 완료되면 지연 추천은 소비할 수 없어요. enqueue가 먼저 완료됐으면 cancel은 이미 기록한 queued receipt를 반환하며 실행을 없던 일로 표시하지 않아요.

채널 종료·host restart는 기존 epoch의 ticket을 무효화해요. enqueue가 이미 발생했는지 불명확한 경우 `unknown`으로 기록하고 **새 request ID로 자동 재시도하지 않아요**. 기존 실행 ledger에서 동일 request ID의 결과만 확인해요. 이미 enqueue된 실행이 crash 뒤 다시 실행되지 않도록 host의 native call ledger와 같은 복구 경계를 사용해야 해요. 새 epoch가 old ticket을 거부한다는 사실만으로 crash 전 실행이 없었다고 결론내리면 안 돼요.

ledger는 크기·ticket TTL·동시성 한도를 갖고 원문 대신 opaque ID·binding digest·고정 상태·receipt만 보관해요. capacity가 부족하면 새 capture를 보류해요. 진행 중이거나 unknown인 기록을 버려 ID가 다시 실행 가능해지게 해서는 안 돼요. terminal 기록을 정리한 뒤에도 같은 epoch에서 ID를 재사용하지 않는 host 발급 규칙과 replay 거부 경계가 필요해요. live 분류 원장의 unknown/완료 재사용 규칙과 별도로 관리하되 두 요청의 결합을 유지해요.

## 구현 수용 조건

- 같은 snapshot·revision·call과 허용 profile, 유효한 최종 보안 결정은 한 번만 enqueue돼요. 동시에 같은 ticket을 소비하려는 두 요청도 receipt 하나를 공유해요.
- 계층·환경·role·extension·policy·catalog 변경, A→B→A, cwd/turn/input 변경, 만료·취소·restart·지원 버전 불일치는 적용을 보류해요. 값이 같은 설정 변경이라도 revision이 증가하면 이전 ticket을 재사용하지 않아요.
- 다른 세션·호스트·epoch·call에 ticket을 재생하지 못해요. ID가 같아도 binding이나 추천이 다르면 conflict예요.
- 보안 Hook deny 시 enqueue는 0개예요. Hook이 최종 입력이나 권한을 바꾼 뒤 이전 approval/digest로 enqueue하지 못해요.
- 분류 지연 중에는 lock을 유지하지 않아요. 지연 응답·연결 종료·provider 오류가 native 호출을 중복 생성하지 않아요. enqueue 결과 unknown은 자동 retry하지 않아요.
- coverage 누락·unknown·pin·고정 역할·fork·resume·untrusted adapter는 preserve/unknown이며 `verified:true`로 승격하지 않아요.
- raw path·설정값·task·자격·원시 오류가 공개 결과·로그·fixture 요약에 남지 않아요.

현재 작업의 fixture reference model은 상태 전이와 binding·revision·중복 거부 규칙을 시험하기 위한 것이에요. 그 시험 통과는 실제 Codex resolver의 완전성, OS 인증 채널, native queue의 crash 원자성이나 다른 Hook 체인의 동작을 증명하지 않아요.

## 현재 fixture와 제안 계약의 차이

[test-support/host-dispatch-contract.ts](../test-support/host-dispatch-contract.ts)의 `ReferenceDispatchHost`는 이 제안의 일부를 실행 가능한 in-memory reference model로 표현해요. 제품 서버가 import하거나 현재 호스트를 제어하는 adapter가 아니에요.

| fixture 표면 | 모델링하는 규칙 | 제공하지 않는 보장 |
|---|---|---|
| `captureSpawnSnapshot(event, ttlMs)` | private ledger에 event·digest·snapshot 결합, 중복 capture의 같은 ticket 재사용, 충돌·capacity 거부 | 인증된 native call handle, 실제 resolver 자동 수집 |
| `updateResolver` | 값이 같아도 revision 증가, ABA 시 이전 ticket 거부 | 실제 설정 변경을 누락 없이 감지하는 watcher/resolver hook |
| `compareAndEnqueue` | 현재 epoch/revision/call/expiry·기존 provenance와 catalog 재검증, 동기 queue callback 전 소비 상태 설정 | native queue 원자성·실제 자식 실행 |
| `authorize(candidate) → allow/deny/ask` 동기 fixture callback | catalog로 만든 candidate의 복사본을 검증하고 deny·미승인·오류이면 enqueue 차단 | 실제 보안 Hook 체인·인증된 승인 결과·비동기 Hook의 원자적 결합 |
| `getDispatchResult`/`cancelTicket` | terminal 결과 재사용·취소 후 지연 적용 차단 | 인증 채널·영속 복구·실행 완료 조회 |
| `restart` | epoch 교체, 진행 중 요청을 unknown으로 전환하며 기존 ledger 유지 | 프로세스 crash 뒤 영속 ledger 복구 |

fixture는 간소화한 `ticket`, `epoch`, 숫자 `resolver_revision`, `input_digest`, `expires_at`를 반환해요. 나머지 binding과 synthetic v1 context는 내부에 보관해요. synthetic `evidence_verified`는 시험 내부 값이며 밖으로 내보내지 않아요. 이 방식으로 실제 adapter 확장을 `host_extensions: none`이라고 보고해도 된다는 뜻은 아니에요.

fixture의 terminal 상태 `enqueued`는 위 제안의 `queued`에, `preserve`는 보류·만료·stale 등의 유지 결과에 대응해요. 에러·중복 결과는 고정 코드로만 반환해요. fixture는 동기 authorize 동안 변경을 잠그고, enqueue callback 진입 전에 unknown을 저장해 reentry에서 같은 결과를 돌려줘 중복 enqueue를 방지해요. 잠금 중 다른 capture·resolver 변경·restart는 거부하고, 아직 terminal이 아닌 호출의 cancel·commit은 busy로 보류해요. 같은 terminal ticket에 대한 다른 추천도 실행하지 않고 기존 결과만 돌려줘요. 정식 wire 구현의 충돌 식별·호스트 identity·adapter 인증·policy 변경 revision·원자적 최종 candidate 보안 확인은 별도로 구현해야 해요.

## 호스트 확장 구현의 선행 조건

호스트 측에서 (1) 실제 자식 resolver가 해석한 출처별 상태를 같은 revision으로 읽는 지점, (2) 영향을 주는 모든 변경의 revision 증가, (3) 최종 보안 Hook·입력과 native enqueue를 직렬화할 지점, (4) crash 후 동일 call 결과를 조회할 native ledger, (5) 작업 프로세스와 분리한 인증 제어 채널을 제공해야 해요.

이 지점을 확보한 호스트·버전부터 adapter를 구현하고 native 수용 시험을 수행해요. 현재 공개 app-server 계약에 없는 보장을 broker에서 추정해 채우지 않아요. 현재 v1 loader·제품 도구·기본 fixture/shadow는 이 제안 때문에 변경되지 않아요. 실무 apply 평가와 설치·배포 지원 확정은 native 통합 검증 뒤에 진행해요.

동일 릴리스 소스에서 찾은 실제 함수·파일과 패치 지점은 [Codex 소스 경로 지도](CODEX_SOURCE_MAP.md)에 있어요. 출처 trace는 최종 Config에서 역산하지 않고 child resolver의 각 merge 단계에서 수집해야 해요.
