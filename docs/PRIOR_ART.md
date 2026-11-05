# 선행 사례

2026-11-03 PoC 착수 전 문서 조사에서 다음 유사 사례를 확인했어요. 현재 revision·배포 지원·성능을 새로 실측한 결과는 아니며, 라이선스 원문과 지원 행렬은 재사용 전에 다시 확인해야 해요.

| 프로젝트 | 조사 당시 겹치는 범위 |
|---|---|
| [Gearshift](https://github.com/tinatsntx/gearshift) | Decisions 기반 Codex 서브에이전트 프로필 선택·preview |
| [codex-subagent-router](https://github.com/guilhem/codex-subagent-router) | Codex PreToolUse 라우팅·사용자 설정 보존·실패 시 기본값 |
| [Downshift](https://github.com/tiagovilasboas/downshift) | 여러 클라이언트의 Hook·MCP·규칙 기반 라우팅과 관측 |
| [Switchboard](https://github.com/ruban-24/switchboard) | Claude/Codex 라우팅과 프롬프트만으로 난도를 추정하는 신뢰성 한계 사례 |

Decisions로 자식 모델을 선택하거나 공통 MCP를 제공하는 핵심 아이디어는 이미 존재해요. 이 프로젝트는 신규성이나 다른 구현 대비 성능 우위를 주장하지 않아요. 선행 코드를 복제하지 않고 공식 MCP SDK 위에 독립 PoC를 작성했어요.

현재 이름은 작업명이며 GitHub 계정 내 저장소명·레지스트리·상표 가용성을 확인하거나 이름을 선점하지 않았어요. MIT는 이 프로젝트에 사용자가 선택한 라이선스이며 다른 프로젝트의 재사용 권리를 대신하지 않아요.
