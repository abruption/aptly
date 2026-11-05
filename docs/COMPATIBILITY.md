# 호환성과 관측 범위

0.1.0 초안은 [새 세 단계 후보](DRAFT_0_1_0.md)를 제공해요. 아래 실제 native PoC는 이전 네 조합의 기록이며 새 후보·effort의 현재 계정 접근성이나 실제 적용을 검증한 결과가 아니에요.


| 클라이언트 | 합성 PoC에서 관측한 것 | 현재 preview의 보수적 경계 |
|---|---|---|
| Codex CLI 0.166.0 | native MCP Hook·Decisions 추천·실제 Sol/low 자식·산술 완료·오류 시 기본 실행·별도 deny 우선 | V2의 실제 Hook 이름 `collaborationspawn_agent` 지원. fork 상속·고정 역할·resume·출처 불명은 유지해요 |
| Claude Code 2.1.314 | native MCP Hook·Decisions 추천·실제 Haiku 자식·산술 완료·오류 시 기본 실행·별도 deny 우선 | JSON 문자열 tool_input 정규화. 모델만 재작성하며 실제 자식 effort는 미확인이에요 |
| 다른 버전·임베디드 호스트·원격/조직 환경 | 실제 적용 시험 없음 | 확인되지 않은 버전·호스트 확장·관리 출처는 unknown이에요 |

native MCP Hook은 호스트의 해당 MCP 연결을 사용해요. 부모와 자식이 각각 MCP 프로세스를 만들 수 있어 초기화·자격 조회·분류 지연을 별도로 평가해야 해요. MCP가 이미 부모에 연결됐다는 사실만으로 자식의 초기화 비용이 없다고 하지 않아요.

Codex는 updatedInput과 allow 조합을 요구해요. 시험의 별도 deny Hook이 이를 우선 차단함을 관측했어요. Claude는 permissionDecision을 내지 않고 updatedInput만 반환해 기존 권한 판단을 유지해요. 두 호스트 모두 다른 역할·fork 방식·문맥을 선택해 모델 변경을 강제하지 않아요.

MCP 환경에 특정 모델을 쓸 수 있다고 적은 것과 실제 호스트에서 해당 모델을 사용할 수 있다는 사실은 달라요. 0.1.0 후보는 고정된 검증 레지스트리와 사용자 선택으로 제한하며, alias·조직 허용 목록·환경·업데이트에 따른 변경은 다시 검증해야 해요.

`get_routing_precedence`가 반환하는 상태와 실제 자식 모델·effort·완료 관측을 구분해요. 제품 서버는 transcript를 읽지 않으며, 일반 세션의 현재 설정 출처가 완전하게 제공되지 않으면 자동 적용하지 않아요.

[Codex Hooks](https://learn.chatgpt.com/docs/hooks) · [Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) · [해당 버전 도구명 변환](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/mod.rs) · [Claude Hooks](https://code.claude.com/docs/en/hooks)
