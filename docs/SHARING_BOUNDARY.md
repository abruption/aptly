# 분류 정보 공유 경계 — 현재 계약과 남은 결정

이 문서는 [Issue #15](https://github.com/abruption/aptly/issues/15)의 명세·검증 단계인 [Issue #33](https://github.com/abruption/aptly/issues/33)과 이후 추가된 설명 전달·재추천 경로를 다룹니다. 후속 구현은 신규 등록의 첫 자동 전송 전에 범위를 선택하도록 하고 기존 v1의 발췌 동작을 보존합니다. 추천 품질 개선을 주장하지 않습니다. 현재 동작을 명시하고 provider의 전송 필드를 명시적으로 제한하며 합성 데이터로 검증합니다. 여기서 전송은 OpenAI Decisions API로 작업 정보를 보내는 것이며 Aptly 개발자에게 보내는 기능이 아닙니다.

## 외부 전송 계약

실제 분류는 `https://api.openai.com/v1/decisions`에 POST하며 redirect를 허용하지 않습니다. fixture provider는 네트워크를 사용하지 않습니다. 아래 표는 Aptly가 구성하는 애플리케이션 payload입니다.

| 위치 | 전송하는 값 |
|---|---|
| HTTP body `model` | 분류 모델 식별자 |
| HTTP body `input` | 아래 `client`·`task` 객체를 직렬화한 JSON 문자열 |
| `input.client` | `codex` 또는 `claude` |
| `input.task.summary` | 현재 경로에서 선택한 작업 설명 |
| `input.task.operation` | 작업 종류. 자동 Hook은 `analysis`를 사용합니다 |
| `input.task.context_sufficient` | 요청 계약의 문맥 충분 여부. 자동 Hook은 `true`를 사용하며 품질 보증이 아닙니다 |
| HTTP body `questions` | 고정 질문·지침, 허용 후보 ID·모델/effort 설명과 `keep_current`·`needs_context` 선택지 |
| `Authorization` header | 명시적으로 구성한 분류용 API 키의 Bearer 인증 |
| `X-Client-Request-Id` header | 자동 Hook은 로컬 결합값의 hash, 직접 추천은 호출자가 지정한 요청 ID |
| `Content-Type` header | `application/json` |

provider는 `task` 전체 객체가 아니라 `summary`, `operation`, `context_sufficient`만 골라 직렬화합니다. 세션 ID·호출 ID·cwd·전체 native 인자·권한 설정·역할·이력은 별도 전송 필드로 추가하지 않습니다. 다만 공유하는 설명이나 후보 설명 안에 그런 문자열이 있으면 텍스트의 일부로 전송될 수 있습니다. 요청 ID에도 비밀을 넣지 마십시오.

후보 설명에는 지원하는 모델·effort와 구성된 모델 정보의 설명이 들어갑니다. 설명이나 operator가 선택한 문자열이 항상 공개 정보라고 가정하지 않습니다. 파일 경로 자체나 설정 파일 전체를 전송하는 것은 아니며, 작업에 적힌 URL이나 저장소 파일을 provider가 자동으로 내려받는 기능도 없습니다.

## 자동 작업 설명의 실제 구성

- 유효한 `prepare_spawn_context` 등록이 있으면 호출자가 작성한 설명에 고정 출처 접두사를 붙여 native 발췌 대신 사용합니다. 등록 자체는 분류 요청을 보내지 않으며, 실제 Hook이 이 설명을 선택해 분류할 때 provider로 전송합니다. 정확한 예정 호출과 같은 MCP 프로세스에 결합되고 5분 동안 유효합니다. 만료·취소·불일치한 등록은 native 발췌로 되돌아가지 않고 경유를 중단합니다.
- 등록된 설명이 없는 평문 native 작업은 허용 크기의 label을 `Task: ...` 접두사로 붙이고, 작업 본문의 첫 문단을 UTF-8 경계에서 잘라 사용합니다. 후속 문단은 전송 설명에 포함하지 않습니다. 이는 의미를 요약하거나 익명화하는 과정이 아닙니다.
- 불투명 메시지 형식과 일치하는 Codex 입력은 원문을 해독·전송하지 않습니다. 현재의 구체성 조건을 만족한 평문 `task_name`만 출처를 표시하여 사용합니다. label도 민감할 수 있으며 label만으로 추천이 충분하다는 일반적 품질 검증은 없습니다.
- `retry_spawn_recommendation`은 Hook의 `insufficient_context` 또는 `provider_needs_context` 이후 호출자가 작성한 보충 설명으로 한 번 재추천할 수 있습니다. native 원문이나 이전 설명을 덧붙이지 않고 고정 접두사와 보충 설명을 전송합니다. 로컬 문맥 부족은 최초 분류 전일 수 있고 provider의 문맥 부족은 이미 한 번 전송한 뒤일 수 있습니다. 완료된 결과는 같은 설명의 반복에 캐시를 재사용합니다. 결과가 불명이면 `outcome_unknown`으로 유지하며 변경된 설명·불명 결과를 새 유료 ID로 우회하지 않습니다.
- 등록·재추천의 원시 설명은 `min(3800, max_summary_bytes - 96)` 바이트 이하이고, 접두사를 포함한 설명도 `min(4000, max_summary_bytes)` 바이트 이하여야 합니다. 두 경로는 구체성 및 알려진 민감 패턴을 검사하지만 비민감성을 인증하지 않습니다.
- 자동 설명은 `min(4000, max_summary_bytes)` **바이트** 이내입니다. 이 값은 전체 HTTP 요청 크기 제한이 아닙니다. 직접 추천의 설명은 Router의 유효 `max_summary_bytes`를 따릅니다.
- native 발췌 경로의 민감 패턴 검사는 label과 제한된 native 본문 전체에 적용한 뒤 발췌합니다. 따라서 전송에서 빠지는 후속 문단이나 잘리는 끝부분에 알려진 키 패턴이 있어도 요청을 보존합니다.

작업 설명·자동 label/본문 검사는 알려진 `sk-...`·Bearer 토큰 형태에 대한 방어 수단입니다. 후보 설명과 요청 ID에는 이 작업 텍스트 검사가 적용되지 않으며 구성된 값이 공유됩니다. 일반 개인정보·업무상 비밀·모든 자격 형식을 탐지하지 못하며, label·설명·후보 정보·요청 ID가 비민감하다는 인증이 아닙니다. 실제 키나 비공개 작업을 필터 시험에 사용하지 않습니다.

## 운영자의 Decisions API 전송 범위 선택

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

변경 명령은 대안이므로 원하는 하나만 실행하십시오. `--client codex|claude|all`로 대상을 고릅니다. `defaults/advisory`는 적용 모드이며 전송 범위와 별개입니다.

| 범위 | 자동 분류 동작 |
|---|---|
| 신규 v2 `unselected` | 선택 전 전송·호출 결합·복구 ticket 없이 원래 호출을 보존합니다 |
| `none` | 자동 전송을 끄고 원래 호출을 보존합니다. 명시적 직접 추천은 별개입니다 |
| `description` | 유효한 호출자 설명만 사용합니다. 없으면 유료 요청 전 보충 안내를 제공하며 native 발췌로 대체하지 않습니다 |
| `excerpt` | 기존 native 발췌 또는 명시 설명을 허용합니다 |

대화형 `aptly set default`는 미선택 호스트에만 묻고 Enter는 `none`입니다. 비대화형 setup·postinstall은 선택하지 않습니다. 기존 v1 정책은 바이트를 유지하고 `legacy`의 `excerpt`로 표시합니다. 명시 변경 시 v2 정책·소유권 기록을 함께 갱신하며 키·원장·불명 기록은 보존합니다. 수정된 정책을 임의로 인수하거나 영수증을 직접 편집해 통과시키지 않습니다. 한 호스트의 변경 실패는 해당 호스트에서 롤백하며 두 호스트의 디스크 쓰기를 하나의 전역 트랜잭션으로 보장하지 않습니다.

`description`에서 설명이 없으면 `defaults`는 보충 전 스폰을 차단하고 `advisory`는 안내만 제공합니다. 에이전트가 실제 보충 도구를 호출하는지는 호스트 동작이며 Aptly가 자동 작성·실행을 소유하지 않습니다. 미선택·none과 달리 description은 허용된 설명으로 분류를 수행하려는 상태입니다.

## 수동 비활성화와 변경 중인 요청

`APTLY_HOOK_POLICY_PATH`가 가리키는 기존 비공개 정책 파일의 다른 필드를 유지하고 `enabled`만 `false`로 설정합니다. 한 필드짜리 새 정책으로 파일을 교체하거나 issuer·state 경로·소유권 기록을 수정하지 않습니다.

| 설정 또는 경로 | 공유에 미치는 영향 |
|---|---|
| 정책 `enabled: false` | 이후 자동 Hook은 원래 호출을 유지하며 분류 요청·새 결합 기록을 만들지 않습니다 |
| 정책 `mode: advisory`, `enabled: true` | 전송 범위가 허용한 입력은 분류에 전송하며 자동 적용 대신 조언을 반환합니다 |
| `APTLY_HOOK_POLICY_PATH` 제거 | legacy strict Hook 경로가 남을 수 있으므로 공유 해제를 뜻하지 않습니다 |
| 명시적 `recommend_agent`·`aptly recommend` | 자동 정책과 별개인 명시적 요청입니다. 호출자가 선택한 설명을 전송합니다 |

이미 전송된 내용이나 진행 중인 네트워크 요청을 회수하는 기능은 아닙니다. 중단과 재활성화를 엄격히 관리해야 하면 관련 호스트를 정지하고 정책을 검토합니다. 명시적인 모델·effort·고정 역할·fork·resume·권한 결정은 기존 계약대로 보존합니다.

생성된 정책을 수정하면 기존 소유권 기록과 달라집니다. 현재 설치·기본 설정은 `policy_conflict`, 제거는 `managed_policy_changed`로 거절될 수 있으며 비활성화 선택을 덮어쓰지 않습니다. 소유권 기록을 편집해 통과시키지 마십시오. 일반적인 범위 변경에는 위 명령을 사용하십시오. 변경 후 MCP를 재시작하십시오. 진행 중 전송은 회수하지 못하지만 결과 적용·retry·fresh는 현재 정책 fingerprint를 확인하고 변경되면 중단합니다. 이전 native 호출의 결합 충돌이나 불명 유료 결과는 새 ID로 우회하지 않습니다.

## 로컬 보관과 호스트 전달의 구분

JSON 원장은 요청 ID·digest·완료/불명 상태·선택 프로필·사용량·지연·추정 비용 등을 보관합니다. 자동 Hook 결합 파일에는 호출·payload·정책·catalog의 hash와 요청 ID가 들어갑니다. 작업 설명·세션 원문·native 본문은 이 메타데이터에 복사하지 않습니다. 사전 등록 설명은 같은 MCP 프로세스의 메모리에 보관하며 만료 조회 또는 취소 시 설명을 제거합니다. 재추천·fresh 준비의 영구 결합 파일에도 설명 대신 fingerprint를 기록합니다. 이는 호스트 transcript나 MCP 도구 인자 자체가 원문을 보관하지 않는다는 보장은 아닙니다. hash와 메타데이터는 익명화를 보장하지 않으며 연결·추정 가능성이 있으므로 비공개 보관과 보존 기간 관리가 필요합니다.

진단 JSON·Markdown은 허용된 상태 코드와 도구·환경 분류만 내보내며 작업 설명·설정값·개인 경로·키·원시 오류를 포함하지 않습니다. 자동 Hook의 관측 결과도 상태·사유·프로필·요청 ID로 제한합니다. 반면 native Hook의 `updatedInput`은 **로컬 호스트가 작업을 실행하도록 원래 task를 유지**합니다. 이 응답이나 호스트의 transcript를 외부 분류 요청 또는 진단 보관과 혼동하지 않습니다. 호스트와 외부 시스템의 로깅을 Aptly가 제어한다고 주장하지 않습니다.

`prepare_fresh_delegation`은 완료된 추천을 재사용하며 추가 분류를 호출하지 않습니다. `standalone_task`는 로컬 `next_call.arguments.message`로 반환되는 새 호출용 지시입니다. 이 준비 응답만으로 native 실행이나 이후 호출의 외부 전송을 인증하지 않습니다. 반환 인자에는 모델·effort가 명시되므로 그대로 제출한 Codex 호출은 현재 Hook에서 `explicit_model`로 분류 없이 보존됩니다. 이후 호출을 검사한다는 표현은 추가 분류가 반드시 발생한다는 뜻이 아닙니다. 설명 등록·재추천·별도 호출의 조건은 [맥락 전달 계약](SPAWN_CONTEXT.md)을 확인하십시오.

## 구현한 범위와 추가 평가 항목

| 대안 | 장점과 한계 | 이번 단계 |
|---|---|---|
| 현재 label·첫 문단 발췌 | 자동 분류 맥락을 제공하지만 본문에 비공개 정보가 포함될 수 있습니다 | 기존 v1 및 선택한 `excerpt`에 한정해 유지합니다 |
| 모든 작업에 label만 사용 | 전송 본문은 줄어들 수 있으나 label도 민감할 수 있고 문맥 부족 위험이 있습니다 | 불투명 Codex의 기존 제한적 fallback 외에는 적용하지 않습니다 |
| 운영자 작성 설명 | 무엇을 공유할지 직접 선택할 수 있습니다. 작업과 무관하거나 불충분한 설명은 추천 유용성을 낮출 수 있습니다 | 명시적 추천 외에 정확한 예정 호출의 설명 등록과 needs-context 후 한 번의 보충을 지원합니다. `description`은 이를 유일한 자동 분류 입력으로 제한합니다. 설명 생성이나 사용자의 건별 동의를 인증하지 않습니다 |
| 원래 선택 유지 | 자동 분류 전송을 막고 호스트 기본 선택을 유지합니다. 자동 추천은 수행하지 않습니다 | `none` 또는 미선택에서 보존합니다. 수동 `enabled: false`도 자동 분류를 중단합니다 |

합성 wire·노출 경계 검사는 이 대안들의 추천 품질·비용 동등성을 측정하지 않습니다. 이 구현은 신규 설치의 미선택 무전송과 기존 v1 호환, 명시적 정책 전환을 제공합니다. 더 좁은 전송 범위가 동일한 품질을 낸다는 주장이나 label-only 추가, confidence 임계값은 별도 평가 사항입니다. 정책 명령이 과거 호스트 transcript·MCP 도구 인자·이미 전송된 내용을 지우는 기능은 아닙니다.
