# 자동 추천

[한국어](../ko/routing.md) · [English](../en/routing.md) · [简体中文](../zh-CN/routing.md) · [日本語](../ja/routing.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [자동 Hook](#guide-automatic-routing)
- [confidence와 추천 보류](#guide-confidence-and-abstention)
- [자동 경유의 보장 범위와 차단 결과 (0.1.5부터)](#guide-routing-guarantees)

<a id="guide-automatic-routing"></a>

## 자동 Hook

**다음 사전 검사·추천·관측 동작은 Aptly 0.1.4부터 지원합니다.** 설치한 `PreToolUse` matcher는 Codex의 `spawn_agent` / `collaborationspawn_agent` / `Agent`와 Claude Code의 `Agent` 호출을 native 실행 전에 로컬 `route_spawn_hook`으로 전달합니다. 호스트가 Hook을 로드·신뢰하고 MCP를 연결해야 합니다. 미설정·미지원 호스트나 MCP 연결 실패까지 Aptly가 가로채도록 강제할 수는 없으며, 실행은 호스트가 담당합니다.

로컬 사전 검사에서 명시 필드·역할·resume·정책·캐시·예산을 평가합니다. 매번 유료 Decisions 요청이 필요한 것은 아닙니다. Codex에서 모델이나 effort만 지정하면 일치하는 허용 튜플로 후보를 제한하고 미지정 필드만 채웁니다. 둘 다 지정하거나 값이 미지원인 경우, 고정 역할과 resume은 분류 없이 보존합니다. 입력 필드만으로 사용자 선택인지 호스트 기본값인지 단정하지 않습니다.

모델·effort가 미지정이면 `fork_turns: "all"`이나 fork 생략도 추천을 평가합니다. **이력 변경은 허용하지 않습니다.** Codex의 모델·effort 적용에는 명시적인 `fork_turns: "none"`이 필요합니다. 그 외에는 `inherited_context_application_unverified`을 알리고 원래 인자를 보존합니다. 다른 이력 필드는 `history_semantics_unverified`로 적용을 차단하며, Claude 적용도 이력 제약 없는 일반 호출로 한정합니다. 추천 성공과 실제 적용은 다릅니다.

Codex 본문이 불투명할 때 `cleanup_merged_worktrees`처럼 구체적인 짧은 작업명만으로도 추천할 수 있습니다. 짧은 이름은 cleanup/remove/prune + merged + worktrees/branches 또는 review/fix/test + failing/broken/flaky + tests/builds 조합만 허용하며, 나머지는 기존 6단어 검사를 유지합니다. 본문은 복호화하거나 전송하지 않습니다. 작업의 세부 조건이나 삭제 권한을 추론하지 않습니다. 이력 상속 상태의 적용은 대상 호스트에서 미검증이며, 모든 버전에서 불가능하다는 뜻은 아닙니다. 공개 소스만으로 설치된 런타임의 지원을 확정하지 않습니다.

독립적인 작업일 때만 호출자가 충분한 독립 작업 맥락을 제공하고 새 자식을 명시적으로 선택하십시오. Aptly는 `all`을 `none`으로 바꾸거나 이력을 제거하거나 명시한 모델·effort를 덮어쓰지 않습니다. [합성 상속·새 자식 예제](../../../examples/spawn-preflight.codex.json)는 별개의 호출이며 자동 재시도가 아닙니다. 결과 불명인 유료 호출을 새 ID로 재시도하지 마십시오.

`defaults`는 호환되는 인자 변경을, `advisory`는 추천만 허용합니다. 상속 호출과 일부 필드만 지정한 호출도 적용 차단 여부와 관계없이 제한된 작업 발췌문을 Decisions에 전송할 수 있습니다. 이력 상속은 공유 거부 설정이 아닙니다. 정책 비활성화·맥락 부족·예산 제한·실패·취소에서는 실행 제약을 보존합니다. 입력·정책·카탈로그 결합, 중복 방지와 결과 불명 보호는 유지하며 fixture 추천으로 native 기본값을 바꾸지 않습니다. 자동 정책 없는 strict 증거 경로는 별개이며 호스트 내부 패치는 계속 보류합니다.

| MCP 도구 | 용도 |
|---|---|
| `get_routing_capabilities` | 무료로 후보·제한·분류 방식·Hook 상태를 조회합니다 |
| `recommend_agent` | 작업 요약으로 프로필 추천을 받습니다 |
| `get_routing_precedence` | 호출의 보존 근거와 미확인 설정 출처를 설명합니다 |
| `route_spawn_hook` | 설치한 정책에 따라 대상 호출의 기본값을 선택하거나 추천만 전달합니다 |
| `get_spawn_routing_observation` | 정확히 일치하는 Hook 호출을 조회하며 native 실행을 증명하지 않습니다 |
| `prepare_spawn_context` | 정확한 예정 호출에 제한된 설명을 등록합니다 |
| `cancel_spawn_context` | 등록한 설명의 연결을 취소하며 native 실행이나 이미 전송된 요청을 취소하지 않습니다 |
| `retry_spawn_recommendation` | Hook의 `retry_id`로 작업 설명을 한 번 보충해 재추천합니다 |
| `prepare_fresh_delegation` | 완료된 상속 추천으로 별도의 독립 Codex 호출 인자를 준비하며 실행하지 않습니다 |

<a id="guide-confidence-and-abstention"></a>

## confidence와 추천 보류

`confidence`는 메타데이터이며 보정된 정답 확률로 검증되지 않았습니다. 현재 자동 적용 임계값으로 사용하지 않습니다. 현재 0과 낮은 값도 다른 적용 조건을 만족하면 허용합니다. 실제 Decisions 응답에서 값이 누락되면 오류로 거절하지만, 일반 Router·저장 결과에서는 선택 항목입니다. `keep_current`·`needs_context`는 숫자와 별개의 결과이며 기존 보류·문맥 보충 규칙을 따릅니다. 명시한 모델·effort·이력·권한은 보존합니다. 소규모 분류 평가만으로 자식 작업의 품질·총비용 개선을 주장하지 않습니다.

<a id="guide-routing-guarantees"></a>

## 자동 경유의 보장 범위와 차단 결과 (0.1.5부터)

활성화되고 신뢰된 Hook이 연결된 MCP에서 지원 호출을 처리하는 범위만 보장합니다. `get_routing_capabilities.automatic_hook.guarantee`로 이 범위를 확인하십시오. Hook 미등록·미신뢰·연결 해제·호스트 오류는 서버가 탐지하거나 강제로 차단할 수 없으며 호스트가 후속 처리를 결정합니다. MCP 연결 표시만으로 개별 호출의 경유를 판단하지 마십시오.

유효한 활성 정책과 지원 대상이 확인된 뒤, `defaults`는 추천 적용 불가·예산 초과·분류 실패·결과 불명 등을 `deny`와 안전한 사유 코드로 알립니다. 원래 인자와 제약은 유지하지만 해당 스폰은 진행하지 않습니다. 상속 이력이 미검증이면 부모 모델로 조용히 실행하거나 `none`으로 변경하지 말고 제약을 보고하십시오. `advisory`는 차단 없이 같은 한계를 설명합니다. 정책 미설정·비활성화, 명시 튜플·고정 역할·resume은 의도적인 로컬 보존 경로이며 일괄 차단하지 않습니다.

복구 ID가 있으면 `get_spawn_routing_observation({retry_id})`로 같은 MCP 프로세스의 관측을 조회할 수 있습니다. 또는 기존 `{client, event}`를 사용하십시오. 두 형식을 섞거나 일부만 보내면 거부합니다. 원래 `awaiting_context`와 `context_retry.outcome`은 별개이며, 거부된 중복 요청은 `last_attempt`에 표시해 이전 분류 결과를 덮어쓰지 않습니다. 조회는 유료 요청을 만들지 않고 보관 시간을 연장하지 않습니다. 실행은 항상 `not_observed`이므로 추천이나 인자 갱신을 실제 자식 실행으로 표현하지 마십시오.

## 관련 문서

[초기 설정·모델 후보](configuration.md) · [Decisions API 전송 범위](transmission.md) · [실행 통계](statistics.md) · [고급 MCP 연동·개발 참고](advanced.md)

[가이드 목차](../ko.md)
