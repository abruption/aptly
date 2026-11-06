# 호환성과 관측 범위

현재 설치·운영 안내는 [사용 가이드](guide/ko.md)가 정본이에요. 0.1.0은 [세 단계 후보](DRAFT_0_1_0.md)를 제공하지만 모델 접근성과 실제 적용은 호스트·계정별로 달라요.

## 현재 두 Hook 경로

Aptly 0.1.4부터의 사전 검사와 명시적 설명 전달은 [자동 Hook 가이드](guide/ko.md#자동-hook)를 따릅니다. 상속 호출의 추천과 실제 적용을 구분하며, 입력 필드는 선택 출처를 증명하지 않습니다. 제한된 맥미니 native 시험 근거는 [사전 라우팅](SPAWN_PREFLIGHT.md)과 [설명 전달](SPAWN_CONTEXT.md)에 기록합니다. 검증용 어댑터의 성공이 제품의 상속 모델 적용 차단을 해제하지는 않습니다.

- `APTLY_HOOK_POLICY_PATH`로 운영자가 설치한 자동 정책은 `defaults`에서 명시적 선택이 없는 새 자식의 기본 모델을 선택해요. `advisory`에서는 입력을 재작성하지 않고 추천 문맥만 제공해요. 이는 전체 호스트 설정 출처가 검증됐다는 뜻이 아니며 `host_settings_verified`도 `false`예요.
- 자동 정책 경로는 명시적 모델·effort를 보존하면서 지원되는 미지정 필드만 선택하고, 고정 역할·resume·필요한 이력을 보존해요. 상속·생략 fork도 추천을 평가하지만 Codex의 상속 모델 적용은 계속 미검증 상태로 차단해요. 정책·호출·카탈로그가 바뀌거나 추천에 실패하면 원래 호출을 유지해요. `defaults`는 fixture 추천을 적용하지 않아요. Codex의 native Hook 신뢰 승인과 기존 deny 결정도 유지해야 해요.
- `APTLY_HOOK_POLICY_PATH`가 설정되지 않은 기존 strict 경로는 private host evidence와 현재 호출의 결합을 검증하며 기본값은 shadow예요. 이 경로의 완전한 출처 검증 요건을 자동 정책 설치의 보장으로 해석하지 않아요. 경로가 설정됐지만 정책이 없거나 유효하지 않거나 비활성화됐다면 strict 경로로 우회하지 않고 원래 호출을 보존해요.

제품 서버는 transcript를 읽지 않아요. `get_routing_precedence`는 strict 경로의 증거 상태이고, 자동 정책 상태는 capabilities의 `automatic_hook`으로 구분하며, 새 호출별 진단은 `get_spawn_routing_observation`으로 조회해요. 어느 상태도 실제 자식의 모델·effort·작업 품질을 단독으로 증명하지 않아요.

## 과거 native PoC 관측

아래 표는 이전 네 조합의 한정된 실험 기록이에요. 새 후보·effort의 현재 계정 접근성이나 일반 호스트 지원을 검증한 결과가 아니에요. 후속 설치 관측은 [로컬 설치 시험](LOCAL_INSTALL_TEST.md)을 별도로 확인해요.


| 클라이언트 | 합성 PoC에서 관측한 것 | 해당 실험의 보수적 경계 |
|---|---|---|
| Codex CLI 0.166.0 | native MCP Hook·Decisions 추천·실제 Sol/low 자식·산술 완료·오류 시 기본 실행·별도 deny 우선 | V2의 실제 Hook 이름 `collaborationspawn_agent` 지원. fork 상속·고정 역할·resume·출처 불명은 유지해요 |
| Claude Code 2.1.314 | native MCP Hook·Decisions 추천·실제 Haiku 자식·산술 완료·오류 시 기본 실행·별도 deny 우선 | JSON 문자열 tool_input 정규화. 모델만 재작성하며 실제 자식 effort는 미확인이에요 |
| 다른 버전·임베디드 호스트·원격/조직 환경 | 실제 적용 시험 없음 | 확인되지 않은 버전·호스트 확장·관리 출처는 unknown이에요 |

native MCP Hook은 호스트의 해당 MCP 연결을 사용해요. 부모와 자식이 각각 MCP 프로세스를 만들 수 있어 초기화·자격 조회·분류 지연을 별도로 평가해야 해요. MCP가 이미 부모에 연결됐다는 사실만으로 자식의 초기화 비용이 없다고 하지 않아요.

Codex는 updatedInput과 allow 조합을 요구해요. 시험의 별도 deny Hook이 이를 우선 차단함을 관측했어요. Claude는 permissionDecision을 내지 않고 updatedInput만 반환해 기존 권한 판단을 유지해요. 두 호스트 모두 다른 역할·fork 방식·문맥을 선택해 모델 변경을 강제하지 않아요.

MCP 환경에 특정 모델을 쓸 수 있다고 적은 것과 실제 호스트에서 해당 모델을 사용할 수 있다는 사실은 달라요. 0.1.0 후보는 고정된 검증 레지스트리와 사용자 선택으로 제한하며, alias·조직 허용 목록·환경·업데이트에 따른 변경은 다시 검증해야 해요.

strict 경로의 출처 검증과 운영자 자동 정책의 기본값 선택은 위에서 구분한 별도 계약이에요. 과거 실험 기록을 모든 세션의 전체 설정 검증이나 현재 모델 지원 보장으로 확대하지 않아요.

[Codex Hooks](https://learn.chatgpt.com/docs/hooks) · [Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) · [해당 버전 도구명 변환](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/mod.rs) · [Claude Hooks](https://code.claude.com/docs/en/hooks)
