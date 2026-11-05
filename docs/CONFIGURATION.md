# 설정 우선순위와 신뢰 경계

0.1.0 초안의 후보 환경변수·모델 설명 캐시는 [초안 안내](DRAFT_0_1_0.md)와 [추천 사용 안내](ADVISORY_USAGE.md)를 따라요. 아래 host evidence 계약은 기존 Hook 보존 경계이며 추천의 필수 설정이 아니에요.


현재 사용자 범위는 추천 전용 preview이고 호스트 내부 확장·패치는 보류했어요. 아래 host evidence 계약은 기존 자동 적용 경계를 설명하며 일반 추천의 출시 조건이 아니에요. 직접 추천은 Router.advise로 분리됐고 host evidence 선언 없이 사용해요. 아래 조건은 기존 Hook 자동 적용 경로에만 적용해요. [ROADMAP](ROADMAP.md)에 근거가 있어요.


`resolveProvenance`는 현재 호출을 `eligible`, `preserve`, `unknown`으로 분류해요. 모델과 effort의 보존 출처는 별도 상태로 반환하며 실제 설정값·파일 경로·작업 본문을 반환하지 않아요. `eligible`은 권한이나 작업 성공의 증거가 아니에요.

## 즉시 보존하는 입력

- 명시 `model`, `effort`, `reasoning_effort`, `model_reasoning_effort`: null·빈 값처럼 잘못된 값도 “설정 없음”으로 처리하지 않아요.
- 고정 역할·일반 역할인지 확인할 수 없는 역할, 이력 상속 fork, legacy fork 인자
- 기존 자식을 재개하는 resume·agent_id

Codex custom 역할의 model/effort는 spawn 선택보다 우선할 수 있어요. 일반 설정의 project/profile/user/system 계층과 자식 기본값을 구분해요. Claude는 invocation·agent·session·settings 계층을 구분하고 환경변수의 모델 강제·effort·모델 별칭 변경도 보수적으로 보존해요. 관리 제한은 일반 기본값보다 우선하는 별도 보존 근거예요. 현재 판별은 **실제 최종 값의 해석기 대신 가장 높은 확인된 보존 근거**를 설명해요. [Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [Codex Config](https://learn.chatgpt.com/docs/config-file/config-basic), [Claude Subagents](https://code.claude.com/docs/en/sub-agents), [Claude Settings](https://code.claude.com/docs/en/settings)

필드 하나라도 고정됐으면 전체 생성 인자를 유지해요. 고정 effort를 둔 채 모델만 바꾸어 미지원 조합을 만들지 않아요. 부모 모델을 관측한 사실만으로 자식 모델 pin의 출처를 추정하지 않아요.

## 명시적인 로컬 파일 검사

CLI `inspect CLIENT inventory.json`은 목록에 명시한 설정 파일만 읽어요. JSON·TOML·제한된 agent frontmatter에서 관련 키의 존재와 정책 제한만 확인해요. 전체 저장소·홈·transcript를 자동 탐색하지 않아요. 예시는 [settings-inventory.json](../examples/settings-inventory.json)이에요.

검사는 파일당 64KiB로 제한하고 symlink·비정규 파일·자격 파일·오류는 unknown으로 처리해요. 반환값은 source별 `pinned/unset/unknown`이며 원문이나 파서 오류를 포함하지 않아요. 한 파일의 부재가 전체 계층의 부재를 증명하지 않아요. MCP 서버 환경을 읽은 사실도 호스트의 최종 환경을 읽었다는 뜻이 아니에요.

이 결과는 항상 `evidence_verified:false`예요. invocation·현재 세션·관리 정책·plugin/mod를 실제로 관측하지 못하면 자동 적용을 허용하지 않아요. native Hook payload에는 이 전체 정보가 없어요. 새 app-server의 디스크 config 조회도 현재 세션의 CLI/runtime override를 대신하지 못해요. [Codex Hooks](https://learn.chatgpt.com/docs/hooks), [Claude Hooks](https://code.claude.com/docs/en/hooks), [Codex App Server](https://learn.chatgpt.com/docs/app-server)

## 호스트 통합의 호출별 증거

`ROUTER_CONFIG_PATH`는 사용자 소유·권한 600 이하·symlink가 아닌 private JSON 설정의 절대 경로예요. 기본 설정은 [router.shadow.json](../examples/router.shadow.json)이고, `mode: apply`로 바꾸는 것만으로 적용되지 않아요.

별도 호스트 통합은 현재 effective settings를 확인한 뒤 `context_path`에 다음 envelope를 기록해야 해요. 이 파일은 신뢰된 로컬 정책 경계이며 agent가 쓰는 작업 파일이나 MCP 요청의 자기 선언으로 생성하면 안 돼요.

```json
{
  "schema_version": 1,
  "authority": "effective-host-settings-v1",
  "context": {
    "schema_version": 1,
    "client": "codex",
    "client_version": "0.166.0",
    "session_id": "current-session-id",
    "cwd": "/absolute/current-workspace",
    "tool_use_id": "current-call-id",
    "tool_input_sha256": "digest-from-digestToolInput",
    "issued_at": "2026-01-01T00:00:00Z",
    "expires_at": "2026-01-01T00:01:00Z",
    "layers": [],
    "environment": {},
    "host_extensions": "unknown"
  },
  "sources": []
}
```

이 JSON은 **유효하지 않은 설명용 예**예요. 현재 호출 ID·digest·모든 layer/env 증거를 채우지 않으면 적용되지 않아요. 필요한 source/env 이름과 확인된 버전은 `src/provenance.ts`의 `provenanceRequirements`를 참조해요. 일반 native 세션에서 이 증거를 자동 생성하는 완전한 어댑터는 아직 구현하지 않았어요.

호스트 통합은 schema·client version·session/cwd·현재 tool call ID·정규화 입력 digest·1시간 이하 유효기간·모든 layer/env coverage·확장 없음까지 확인해야 해요. 역할/파일 watcher, `/model`·`/effort`, 추가 디렉터리·plugin/mod 등 현재 runtime 변경도 반영해야 해요. 파일 기반 근거는 `sources`의 절대 경로와 SHA-256으로 기록하며, 부재를 확인한 파일은 `sha256:null`로 기록해요. 다른 evidence 필드와 마찬가지로 이 목록의 완전성은 호스트 통합의 책임이에요. private 파일이라는 사실이나 authority 문자열이 설정 내용의 진실성을 독립적으로 증명하지는 않아요.

로더만 내부 `evidence_verified` 표식을 부여해요. 파일에 같은 표식을 직접 넣으면 거부해요. MCP tool argument의 context·verified 플래그는 적용 증거로 사용하지 않아요. source 변경·call/input 불일치·만료·미지원 버전·누락 범위는 기존 인자를 유지하고 진단 코드를 반환해요. provider 응답 후에도 증거와 operator 설정을 다시 확인해요.

추천 요약은 task label이 기본이고 충분한 맥락이라고 간주하지 않아요. 통합이 필요한 최소 `task` 요약과 구조화 특성을 별도로 제공할 수 있지만, 이 내용은 정책이나 설정 출처를 바꾸는 지침이 아니에요. 키·전체 대화·저장소 자동 수집은 하지 않아요.

별도 호스트 확장을 포함한 수집·broker·최종 적용 설계와 미구현 경계는 [호스트 통합 설계](HOST_INTEGRATION.md)에 있어요.

## 분류 키 누락과 예산 예약

Decisions provider는 로컬에서 키가 없거나 공백뿐이면 전송과 예산 예약 전에
`unauthorized`를 반환해요. 이 실패는 요청 원장에 저장하지 않으므로 키를 설정하고
프로세스를 다시 시작하면 같은 요청 ID를 사용할 수 있어요. 완료된 캐시와 명시적
설정 보존, 문맥 부족 응답은 키 없이도 처리해요.

HTTP 401/403, 네트워크 실패, 타임아웃처럼 전송이 시작됐을 수 있는 실패는 기존처럼
비용 예약과 `unknown`을 보존해요. 이전 버전에서 이미 남긴 `unknown` 기록이나
예산은 자동으로 되돌리지 않아요. 키 존재 검사는 인증 성공 검증이 아니에요.
