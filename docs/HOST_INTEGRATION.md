# 호스트 증거 수집 통합 설계

> **보류 — 2026-11-05 사용자 결정.** 이 문서는 기존 확장 연구·검증 기록을 보존한 자료예요. 호스트 내부 패치·추가 native 시험·broker/dispatch 구현은 명시적 재개 전까지 진행하지 않아요. 현재 MCP+Decisions 추천 preview의 출시 전제나 다음 작업이 아니에요. 현재 순서는 [ROADMAP](ROADMAP.md)을 따라요.

현재 설치형 자동 Hook은 [호환성](COMPATIBILITY.md)의 운영자 defaults/advisory 경로예요. 이 문서의 전체 증거 수집 설계는 그 설치의 필수 조건이나 구현 완료된 보장이 아니에요.

2026-11-05 기준 설계예요. 사용자는 기존 CLI Hook 외에 전체 세션 증거를 제공하는 별도 호스트 확장도 허용했어요. 아래 확장·IPC·수명주기는 **아직 구현한 기능이 아니에요**. 현재 제품은 CONFIGURATION의 private envelope v1을 읽고, 일반 세션의 자동 수집은 지원하지 않아요.

## 통합 경계

세션을 실제로 소유한 호스트가 설정의 출처를 관측하고, Aptly는 그 관측의 완전성·현재 호출과의 결합·유효성을 검증해요. 파일 목록 검사나 MCP 프로세스의 환경만으로 전체 세션을 인증하지 않아요. 별도 CLI를 시작해 얻은 설정은 이미 실행 중인 세션의 증거가 아니에요.

현재 설치 버전의 읽기 전용 확인 결과는 Codex 0.166.0, Claude Code 2.1.314예요. 이것은 `src/provenance.ts`의 기존 버전 목록과 일치하지만, 새 통합의 실제 지원이나 적용 성공을 검증한 결과는 아니에요.

공식 Codex Hook 계약은 호출 ID·입력 등의 전달 필드를 정의해요. app-server 문서에는 config 조회와 turn별 설정 변경이 각각 설명돼 있어요. 이 두 기능만으로 현재 자식 호출에 영향을 주는 모든 출처가 제공된다고 확인할 수 없으므로, 전체 증거 공급자로 바로 취급하지 않아요. [Codex Hooks](https://learn.chatgpt.com/docs/hooks), [Codex App Server](https://learn.chatgpt.com/docs/app-server)

Claude Hook 계약에는 세션·cwd·호출 입력과 설정 변경 등의 이벤트가 있어요. 변경 알림만으로 세션 시작 시점의 전체 상태나 누락된 runtime 출처를 복원할 수 있다고 가정하지 않아요. 아래 Claude adapter는 해당 정보를 실제로 관측할 수 있는 공식 호스트 인터페이스가 확인되어야 구현할 수 있어요. [Claude Hooks reference](https://code.claude.com/docs/en/hooks)

## 구성과 책임

| 구성 | 책임 | 금지 사항 |
|---|---|---|
| 호스트 adapter | 같은 실행 세션의 설정 해석 직후 출처·revision 관측, 실제 spawn 직전 재확인 | 시작 인자·session 상태를 다른 프로세스의 기본값으로 대체 |
| 로컬 evidence broker | 연결된 호스트의 capability·세션·호출을 결합하고 요청별 증거 수명 관리 | 작업 텍스트·MCP 인자의 `verified`를 신뢰 |
| Aptly router | 기존 보존 정책·고정 프로필·예산·캐시를 적용하고 추천 반환 | 모델 응답으로 허용 카탈로그·권한·역할 변경 |
| 호스트 적용부 | 같은 호출·입력·revision에만 모델 필드 적용, 원래 보안 Hook 체인 실행 | Aptly 응답으로 별도 deny·승인·샌드박스 우회 |

새 공개 MCP 도구로 envelope 쓰기나 임의 경로 읽기를 제공하지 않아요. 기존 네 도구는 유지해요. 통합 IPC는 호스트의 별도 로컬 제어 경계로 두고 작업 실행 환경에 writer 권한이나 제어 capability를 노출하지 않아야 해요. 같은 OS 사용자·private 파일 권한만으로 악성 동일 사용자 프로세스에 대한 격리를 보장한다고 주장하지 않아요. 그 격리가 없는 환경의 증거는 운영자 신뢰 범위에 한정하며 자동 인증으로 표시하지 않아요.

## 호스트별 수집 항목

정확한 필수 이름은 `provenanceRequirements`가 기준이에요. 필수 항목이 하나라도 미관측이면 `unknown`으로 유지해요. 새 버전은 버전 문자열만 추가하지 않고 같은 수용 시험을 거쳐요.

| 호스트 | 반드시 관측할 출처 | 현재 해결할 인터페이스 |
|---|---|---|
| Codex | invocation, role, subagent_defaults, profile, project, user, system, managed 및 요구된 환경 항목 | 실제 세션의 설정 resolver와 tool dispatch 경계에서 출처·변경 revision을 얻는 인터페이스 |
| Claude | invocation, agent, session, settings_flag, local, project, user, managed 및 요구된 환경 항목 | 실제 세션의 resolver·모델/effort 변경·agent 정의·managed 정책을 함께 관측하는 인터페이스 |
| 공통 | host 확장 목록, 지원 버전, session/cwd, tool call ID, 입력 digest, 시각·만료 | 확장·추가 디렉터리·설정 reload 등 모든 변경 시 증거 무효화 |

출처마다 model/effort를 `pinned/unset/unknown`으로 정규화하고, 환경은 `set/unset/unknown`으로 표현해요. 값 자체는 broker의 진단이나 공개 보고서로 내보내지 않아요. `unset`은 해당 resolver가 그 출처의 부재를 관측한 경우만 사용해요. 파일 부재·부모 모델·작업 문장의 추측은 근거가 아니에요. 현재 정책대로 pin·역할·fork·resume은 보존하며 IMP-001은 구현하지 않아요.

## 호출 수명주기

1. 호스트 adapter가 연결 시 실제 버전과 관측 가능한 출처를 알리고, broker는 필요한 coverage와 비교해요. capability 자기 선언만으로 관측의 진실성이 증명되지는 않아요. 지원 인터페이스·설치 경계 검증이 선행돼요.
2. PreToolUse 직전에 호스트가 원래 입력·현재 effective settings를 같은 revision에서 읽어요. session/cwd/call ID와 `digestToolInput` 결과를 묶어요. 최소 작업 요약은 정책 증거와 분리해요.
3. broker는 요청별 증거를 만들고 Aptly로 전달해요. 다른 호출의 증거를 덮어쓰는 전역 가변 파일을 사용하지 않아요. 동일 호출의 중복 전달은 같은 요청 ID와 완료 결과를 재사용해요.
4. Aptly는 현재 보존 정책으로 판별하고 허용되는 경우에만 분류해요. 호출 전후의 envelope·source fingerprint 재검증을 유지해요. 만료는 짧은 호출 단위로 두고 현재 v1의 최대 1시간 제한보다 늘리지 않아요.
5. 호스트는 응답의 session/cwd/call/input/revision 일치를 확인하고, 실제 spawn 직전 현재 resolver revision과 원자적으로 비교해요. 변경이 있으면 원래 인자를 유지해요. 설정 reload·모델 변경과 적용이 동시에 지나가지 않도록 host dispatch가 직렬화하거나 비교 후 적용을 하나의 트랜잭션으로 처리해야 해요.
6. 다른 보안 Hook의 결정을 그대로 적용한 뒤 native spawn을 실행해요. 취소·만료·연결 종료는 증거를 무효화하며 늦은 결과를 다른 호출에 재사용하지 않아요. 실제 자식 실행의 모델·effort는 별도 관측으로 확인해요.

호스트의 최종 revision 확인을 외부 파일 fingerprint만으로 대체할 수 없어요. runtime 변경을 관측하지 못하거나 최종 적용을 묶을 수 없으면 자동 적용을 지원하지 않고 shadow로 남겨요.

## 기존 v1과 새 transport

기존 `ROUTER_CONFIG_PATH`·`context_path`·envelope v1·`effective-host-settings-v1` 계약을 이번 브랜딩 작업에서 변경하지 않았어요. 현재 loader는 `evidence_verified`를 내부적으로 부여하지만, 이는 파일의 완전성과 호스트의 진실성을 독립 인증한다는 뜻이 아니에요.

최초 통합 prototype은 세션별 broker와 호출별로 격리한 서버 인스턴스·immutable v1 envelope를 사용할 수 있어요. 이 v1 prototype은 관측·shadow 전용이에요. 현재 provenance는 `host_extensions`가 `none`이 아니면 적용을 보류하므로, 별도 adapter 확장이 존재하는데 `none`으로 보고해서는 안 돼요. 정식 계약에서는 신뢰된 adapter의 identity·version과 다른 확장들의 coverage를 따로 검증해야 해요. 기존 loader에는 runtime revision·소비 상태·broker 인증 필드가 없으므로 새 필드를 v1 JSON에 몰래 추가하지 않아요. 병렬 호출을 지원하는 정식 transport는 별도 버전 계약과 loader·server·provenance 변경이 필요해요. 요청별 파일 격리만으로 runtime의 원자적 적용이 해결되지는 않아요.

정식 transport의 최소 계약은 연결된 host identity, capability version, session/cwd, call ID/input digest, resolver revision, issued/expires, coverage, source fingerprint, 취소·한 번의 적용 소비 상태예요. 호스트 제어 채널을 통해 조회·재검증·소비하고 MCP 작업 입력으로 이 채널을 대체하지 않아요. task 요약과 API 키는 evidence payload에 넣지 않아요. IPC 인증·OS별 격리 방법은 실제 호스트 인터페이스를 정한 뒤 구체화할 구현 항목이에요.

## 구현 순서와 완료 조건

1. 두 호스트의 지원 인터페이스를 작은 read-only prototype으로 확인해요. 부족한 coverage와 원자적 적용 미지원은 고정된 이유 코드로 남겨요. closed-source 내부 patch나 비공식 설정 필드를 전제로 지원을 약속하지 않아요.
2. 관측 가능한 호스트부터 별도 adapter와 broker를 구현하고, 관측 불가 호스트는 shadow로 유지해요. 이때 고정 버전 allowlist와 transport를 추가해요.
3. fixture로 누락 출처·잘못된 버전·pin·fork·resume·입력 바뀜·만료·파일 변경·runtime revision 변경을 검증해요. 동시 두 세션·두 호출, 중복 ID·취소·restart·늦은 응답·broker 장애를 반드시 포함해요.
4. native 시험에서 추천과 실제 child metadata를 따로 기록해요. 다른 Hook deny는 자식 0개, provider/broker 실패 시 원래 실행 최대 1개를 확인해요. key·본문·원시 오류는 결과에 기록하지 않아요.
5. 위 조건을 통과한 호스트·버전만 실무 평가의 apply 군에 넣어요. 미완료 상태로 일반 자동 적용이나 비용 절감을 주장하지 않아요.

현재 상태는 **브랜딩 검증 완료, 호스트 통합 설계 및 Codex 설정 조회 prototype 완료, 전체 native adapter·broker 구현 및 실제 적용 검증 미착수**예요. [Codex prototype 결과](CODEX_HOST_PROBE.md)에서 관측 가능 범위와 남은 호스트 인터페이스를 확인해요. 실무 평가와 설치·배포 범위 확정은 통합 검증 뒤에 진행해요.

## 로컬 인터페이스 탐색 기록

Codex 0.166.0의 `app-server generate-json-schema`로 임시 경로에 321개 JSON schema를 생성한 뒤 정리했어요. 세션 실행·모델 호출·실제 설정 파일 조회는 하지 않았어요.

- `ConfigReadParams`: `cwd`, `includeLayers`; `ConfigReadResponse`: `config`, `layers`, `origins`
- `ThreadReadParams`: `includeTurns`, `threadId`; `ThreadReadResponse`: `thread`
- `TurnStartParams`: `threadId`, `model`, `effort`, `cwd` 등 turn별 입력

확인한 schema는 config 출처 조회와 turn별 override가 분리돼 있음을 보여줘요. `resolverRevision`, `effectiveSettings`, `toolInputSha256`, `sourceCoverage`라는 정확한 이름은 생성물에 없었지만, 다른 이름의 동등 기능이 없다는 증거는 아니에요. 현재 세션의 resolver 관측·원자적 적용 계약을 확보했다고 판단하지 않았어요. Claude는 버전·help만 조회했으며 전체 증거 인터페이스는 미확인 상태예요.

후속 prototype에서 experimental 계약의 `thread/settings/updated`, thread/turn 설정 갱신과 자식 resolved metadata 항목을 추가로 확인했어요. 격리된 app-server의 config 조회·파일 변경 감지·CLI override 출처 구분은 실제 실행했고, native 세션 변경과 원자적 spawn 검증은 미검증으로 유지했어요. 재현 명령과 한계는 [Codex 호스트 증거 prototype](CODEX_HOST_PROBE.md)에 있어요.

호스트가 새로 제공해야 할 capture·원자적 dispatch·결과 조회·취소 API와 실패 처리는 [호스트 인터페이스 제안](HOST_DISPATCH_CONTRACT.md)에 구체화했어요. test-support의 실행 가능한 reference model은 fixture 전용이며 현재 제품 MCP에 연결하지 않았어요.
