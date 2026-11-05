# Codex 호스트 증거 prototype

> **보류 — 2026-11-05 사용자 결정.** 이 문서는 기존 확장 연구·검증 기록을 보존한 자료예요. 호스트 내부 패치·추가 native 시험·broker/dispatch 구현은 명시적 재개 전까지 진행하지 않아요. 현재 MCP+Decisions 추천 preview의 출시 전제나 다음 작업이 아니에요. 현재 순서는 [ROADMAP](ROADMAP.md)을 따라요.

2026-11-05, 설치된 Codex CLI **0.166.0**에서 실행했어요. `npm run probe:codex`는 격리된 임시 설정으로 app-server의 설정 조회를 확인하는 개발용 명령이에요. 제품 MCP·설치 CLI·CI의 기본 테스트에 연결하지 않았어요. 현재 세션의 증거를 생성하거나 자동 적용을 켜지 않아요.

```sh
npm run probe:codex
```

Node 24+, 로컬 Codex CLI가 필요해요. 외장 작업 볼륨의 mount·UUID·잠금 해제·쓰기 가능 상태를 먼저 확인해요. 임시물은 `test-support/temp.ts`가 만든 해당 볼륨의 `codex-*` 전용 디렉터리에 두고 종료 시 정리해요. 설치 버전이 검토한 0.166.0과 다르면 지원 계약 일치로 처리하지 않고 비정상 종료해요.

## 실행 범위와 결과

`CODEX_HOME`은 자격 파일이 없는 새 테스트 디렉터리로 지정하고, 환경은 PATH와 그 테스트 경로만 전달해요. 실제 사용자 config·auth·MCP 등록·세션 ID는 전달하지 않아요. 시스템·managed 계층은 호스트가 적용할 수 있으므로 완전히 빈 운영체제나 정책 격리를 보장하는 시험은 아니에요. 그런 정책 때문에 fixture 결과가 달라지면 통과로 표시하지 않아요.

RPC transport는 `initialize`, `config/read`만 허용하고 `initialized` 알림을 보내요. thread/turn 시작·재개·설정 쓰기·모델/계정/plugin 조회는 보내지 않아요. 서버의 역방향 요청은 자격을 제공하지 않고 거부해요. timeout·종료·출력 한도·잘못된 JSON·RPC 오류는 고정 코드로 처리하며 원시 stderr·설정 응답·경로·모델값을 출력하지 않아요.

변경은 새로 만든 테스트 config.toml에만 해요. 테스트 model 문자열은 실제 모델 호출에 사용하지 않아요.

| 시험 | 관측 결과 | 의미 |
|---|---|---|
| 초기 파일의 model/effort 조회 | fixture와 일치, 두 출처 `user` | 이 app-server의 config 값·출처 조회 가능 |
| 변경 없는 재조회 | 비교 fingerprint 동일 | 같은 설정의 반복 조회 안정성 |
| 파일의 model/effort 변경 후 재조회 | fixture 변경과 출처 버전 변화 관측 | config 재조회로 파일 변경 감지 가능 |
| 두 번째 app-server에 CLI override | fixture와 일치, 두 출처 `sessionFlags` | 해당 프로세스 시작 override와 파일 출처 구분 가능 |
| 현재 native 세션의 전체 출처 | 미검증 | 별도 프로세스의 관측을 현재 세션으로 승격하지 않음 |
| 세션 중 모든 변경 알림·spawn 직전 재확인 | 미검증 | 파일 변경 관측과 runtime 전체 검증은 별개 |

출력의 `config_probe_passed:true`는 위 네 설정 조회 시험이 통과했다는 뜻이에요. 동시에 `evidence_verified:false`, `application:shadow`, `integration_ready:false`를 반환해요. 내부 비교 fingerprint는 공개 출력에 포함하지 않아요. 이 prototype에는 evidence writer·자식 spawn·provider 호출 코드가 없어요.

## 설치 버전의 생성 계약 검토

같은 버전의 `codex app-server generate-json-schema --experimental --out DIR`와 `generate-ts --experimental --out DIR` 결과를 검토했어요. 생성물은 임시 경로에서만 사용하고 제품에 복사하지 않았어요. 아래는 설치 버전의 계약에서 관측한 내용이며 모든 내용이 공식 웹 문서에 설명돼 있다는 뜻은 아니에요.

| 계약 | 제공하는 것 | 남은 경계 |
|---|---|---|
| ConfigReadParams/Response | cwd·includeLayers → config·origins·layers | 특정 thread/call을 입력받지 않음 |
| ConfigLayer/Metadata | 출처와 계층 version | 전체 runtime resolver의 revision과 다름 |
| ConfigRequirementsReadResponse | managed requirements 조회 계약 | 이번 실행 probe에서는 호출하지 않음 |
| Thread.model/reasoningEffort | loaded thread의 configured 값, 아니면 persisted 값 | 생성 타입 주석이 per-turn 실행 telemetry와 구분 |
| ThreadSettings 및 thread/settings/updated | thread ID와 model/effort 등 집계 설정 변경 알림 | 필드별 origins·call digest·전체 resolver revision 없음 |
| thread/settings/update | 이후 turn 설정 변경, 응답은 빈 객체 | mutation API이며 이번에 실행하지 않음 |
| turn/settings/update | 현재 turn 설정 변경, applied/targetUnavailable | 주석상 child sessions와 frozen initial settings 소비자는 별개 |
| config 쓰기의 expectedVersion | 설정 파일 쓰기의 동시성 검사 | native spawn의 compare-and-apply 토큰이 아님 |
| ConfigBatchWriteParams.reloadUserConfig | 일부 active thread 설정 reload 계약 | model·effort 등 session-static 기본값은 reload 대상이 아니라는 주석 |
| Hook 시작·완료 알림 및 hooks/list | Hook 실행·설정 관측 | 현재 호출 입력과 resolver revision의 원자적 적용을 제공하지 않음 |
| DynamicToolCallParams | thread/turn/call ID와 client tool arguments | native spawn을 원자적으로 제어하는 계약으로 취급하지 않음 |
| ThreadItem.collabAgentToolCall | 요청된 model/effort | 실제 적용 관측과 구분 |
| ThreadItem.subAgentActivity | 자식 생성 시 resolved model/effort | 생성 후 관측 후보이며 이번에는 실제 자식을 실행하지 않음 |

앞선 정확한 필드명 몇 개의 검색만으로 변경 인터페이스가 없다고 결론내려서는 안 돼요. 이번 검토에서는 `thread/settings/updated` 등의 실제 계약을 찾았어요. 다만 이 알림을 누락 없는 전체 설정 revision feed나 spawn 직전 원자적 검증으로 사용할 수 있다는 보장은 확인하지 못했어요.

공식 문서의 config 조회·turn별 override 설명과 Hook의 session/call/input 전달 계약을 함께 확인했어요. [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Codex Hooks](https://learn.chatgpt.com/docs/hooks)

## 다음 구현 판단

설정 조회와 파일 변경 관측 부분은 재현 가능해졌어요. 하지만 전체 native 세션 증거 adapter를 만들기에는 **같은 세션의 출처별 resolver 상태와, 그 상태가 변하지 않았을 때만 spawn에 적용하는 호스트 내부 경계**가 더 필요해요. 기존 공개 계약에 그 경계를 확보했다고 주장할 수 없어요. 다른 지원 인터페이스가 존재하지 않는다는 단정도 아니에요.

다음 작업은 세션을 소유하는 호스트가 그 두 경계를 제공할 수 있는지 확인하고, 필요하면 호스트 측 API 추가 요구사항을 구체화하는 거예요. 그 전에는 broker가 출처를 추정해 채우거나 운영 apply 평가를 시작하지 않아요. 실제 native thread의 변경 알림·자식 resolved metadata 검증은 별도의 후속 시험이에요.

후속으로 필요한 API의 DTO·원자성·재시작 복구와 fixture 검증을 [호스트 resolver·dispatch 계약](HOST_DISPATCH_CONTRACT.md)에 구체화했어요. 이 이름들은 현재 Codex RPC가 아니에요.
