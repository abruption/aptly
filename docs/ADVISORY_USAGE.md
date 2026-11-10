# 추천 사용 안내

Aptly는 작업 요약을 분류해 허용된 실행 프로필을 제안해요. `recommend_agent`와 CLI `recommend`는 같은 추천 전용 경로를 사용해요. `application: advisory_only`는 호스트 설정 확인·모델 사용 권한·자식 실행 승인이 아니에요. 프로필을 사용하기로 결정했다면 기존 호스트에서 모델·effort·역할·권한을 확인하고 명시적으로 선택해요.

호스트 내부 패치는 보류 상태예요. 이 안내의 추천을 받기 위해 private host envelope나 `provenance_verified:true`가 필요하지 않아요. 기존 Hook의 엄격한 자동 적용 조건은 그대로이며 기본 shadow Hook은 추천 UI가 아니에요.

## 키 없는 fixture 추천

프로젝트 루트에서 Node 24 이상을 사용해요. fixture는 로컬 규칙으로 만든 합성 결과이며 Decisions API의 판단이나 품질 평가가 아니에요.

```sh
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.codex.json
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.claude.json
```

첫 예제의 fixture 출력에는 아래 필드가 포함돼요. 버전·지연·그 밖의 metadata를 생략한 예예요.

```json
{
  "status": "recommended",
  "reason": "allowed_profile",
  "application": "advisory_only",
  "profile_id": "codex-simple",
  "profile": {
    "id": "codex-simple",
    "client": "codex",
    "model": "gpt-6-luna",
    "reasoning_effort": "max"
  },
  "provider": "fixture"
}
```

Claude 예제의 fixture는 `claude-simple`을 반환해요. Claude 프로필에는 reasoning_effort를 추가하지 않아요. 결과의 model 문자열은 현재 호스트나 계정의 접근 가능성을 인증하지 않아요.

빌드한 CLI에도 같은 JSON을 입력할 수 있어요.

```sh
npm run build
ROUTER_PROVIDER=fixture node dist/bin/aptly.js recommend < examples/recommend.codex.json
node dist/bin/aptly.js recommend --help
```

검토한 로컬 npm archive를 별도 설치 디렉터리에 수동 설치한 경우에는 그 설치 위치의 `aptly recommend`에도 같은 요청을 전달해요. package registry에 게시된 패키지로 간주하지 않으며 전역 설치는 필요하지 않아요. archive의 정확한 이름·지원 범위는 해당 릴리스 기록을 확인해요. source checkout과 npm archive는 구조가 달라 설치된 node_modules에서 bin/aptly.ts를 직접 실행하지 않아요.

### 검토한 로컬 archive를 수동 설치하기

아래 경로는 설명용 절대 경로예요. 실제로 검토한 최신 archive와 새 설치 디렉터리로 바꿔요. 기존 브랜딩 시점 archive를 최신 검증 후보로 간주하지 않아요. source archive를 사용하는 경우에는 풀어 둔 프로젝트에서 앞의 source 명령을 사용해요.

```sh
aptly_install=/absolute/private-aptly-install
aptly_archive=/absolute/reviewed/aptly-0.1.0.tgz
mkdir -m 700 "$aptly_install"
npm install --ignore-scripts --no-audit --no-fund --prefix "$aptly_install" "$aptly_archive"
ROUTER_PROVIDER=fixture "$aptly_install/node_modules/.bin/aptly" recommend < "$aptly_install/node_modules/aptly/examples/recommend.codex.json"
```

설치한 실행 파일에 `config claude` 또는 `config codex`를 실행하면 그 설치 위치의 compiled server를 가리키는 조각을 얻어요. 조각 출력 뒤 실제 등록은 사용자가 검토해 진행해요.

## 요청 계약

| 필드 | 의미 |
|---|---|
| request_id | 같은 입력·정책·원장으로 재조회할 때 재사용할 ID. 서로 다른 작업에 재사용하지 않아요 |
| client | codex 또는 claude |
| task.summary | 분류에 필요한 최소 요약. 키·전체 대화·private 원문을 넣지 않아요 |
| task.operation | read_only, write, review, analysis 중 하나 |
| task.context_sufficient | 요약에 판단에 필요한 맥락을 제공했는지 호출자가 표현해요. false면 추가 맥락을 요청하며 호스트 검증을 뜻하지 않아요 |
| eligible_profile_ids | 선택 사항. 생략하면 해당 client의 현재 설정된 카탈로그를 사용해요. 지정하면 그 안에서 후보를 제한해요 |
| constraints | 선택 사항. 계획용 추천에서 호출자가 보존해야 한다고 선언한 model_pinned, effort_pinned, role_pinned, fork_inherits boolean이에요 |

constraints를 생략하면 **이 독립적인 계획 요청에 보존 조건을 선언하지 않은 것**으로 처리해요. 실제 호스트 설정에 pin이나 역할이 없다고 검사한 결과는 아니에요. 하나라도 true이면 기존 선택을 보존하고 분류를 진행하지 않아요. 잘못된 타입·지원하지 않는 후보는 안전한 결과로 거부해요. legacy `provenance_verified` 입력은 추천 경로의 권한 근거가 아니며 새 요청에서는 사용하지 않아요.

기본 profile ID는 Codex의 `codex-simple`·`codex-routine`·`codex-deep`, Claude의 `claude-simple`·`claude-routine`·`claude-deep`예요. `eligible_profile_ids`에는 환경변수로 활성화한 후보 안의 ID만 지정해요. 환경에서 제외한 모델이나 다른 client의 프로필을 요청해 다시 활성화할 수 없어요. 현재 목록은 capabilities로 조회해요.

```sh
node bin/aptly.ts capabilities
```

## 후보 환경변수

| 등급·프로필 | Claude 모델 | Codex 모델·effort |
|---|---|---|
| simple | `claude-simple`: haiku | `codex-simple`: gpt-6-luna / max |
| routine | `claude-routine`: sonnet | `codex-routine`: gpt-6.1-terra / high |
| deep | `claude-deep`: opus | `codex-deep`: gpt-6.1-sol / medium |

프로세스 환경에서 후보를 좁힐 수 있어요. 모델명 배열이며 profile ID 배열은 아니에요.

```sh
export APTLY_CLAUDE_MODELS='["haiku","sonnet","opus"]'
export APTLY_CODEX_MODELS='["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

MCP 설정 JSON의 `env` 값에는 위 배열을 JSON 문자열로 넣어요. 실제 등록 형식은 [Claude 예제](../examples/claude-mcp.json)와 [Codex 예제](../examples/codex-mcp.toml)를 참고해요.

- 미지정: 위 세 모델을 기본 후보로 사용해요.
- `[]`: 해당 client에서 추천을 비활성화하고 provider를 호출하지 않아요. 둘 다 비활성화할 수도 있어요.
- 빈 환경변수 문자열, 배열 안 빈 문자열·중복·비문자열, 잘못된 JSON·지원하지 않는 ID: 명확한 설정 오류예요. 임의 모델을 자동 허용하지 않아요.
- `CLAUDE_MODELS`와 `CODEX_MODELS`는 각각 기본 이름의 별칭이에요. 같은 제공사에 두 이름을 동시에 설정하면 값이 같아도 오류예요. `CODEX_MODESL`은 오타이며 지원 이름이 아니에요.

선택적으로 `gpt-6-astra`를 넣으면 `codex-frontier` / high, `fable`을 넣으면 `claude-frontier`가 후보에 들어가요. 이 둘은 기본 목록에는 없어요. 다른 모델을 문서에서 찾았다는 사실만으로 초안의 유한한 지원 목록이 확장되지는 않아요.

이 설정은 추천 후보만 바꿔요. 기존 모델·effort·역할·fork·resume·조직 권한을 덮어쓰는 설정은 아니에요. Claude effort는 이 프리셋에서 지정하지 않아요. Codex effort는 이번에 정한 프로필 기본값이며 모델 배열에 effort를 함께 적는 형식은 지원하지 않아요. 높은 effort와 저렴한 모델의 조합이 항상 최소 토큰·최저 비용이라는 주장은 하지 않아요.

## 공식 모델 정보와 캐시

Decisions에는 각 후보의 모델명·effort·동봉한 공식 특성·로컬 등급 기준을 짧은 설명으로 전달해요. 기본 정보만으로 실행할 수 있고 추천할 때마다 문서를 fetch하지 않아요.

공식 Markdown을 명시적으로 갱신할 수 있어요. 출력 위치의 parent는 현재 사용자 소유의 private 디렉터리로 먼저 준비해요. 아래 절대 경로는 설명용 예예요.

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

source checkout에서 실행할 때는 `aptly` 대신 `node bin/aptly.ts`, compiled checkout에서는 `node dist/bin/aptly.js`를 사용해요. 갱신은 다음 고정 URL만 읽으며 API 키·사용자 작업 요약·인증 정보를 보내지 않아요.

- https://code.claude.com/docs/en/model-config.md
- https://learn.chatgpt.com/docs/models.md

파싱한 모델 설명과 출처 hash만 정규화해 저장하고 문서 원문이나 문서의 명령을 실행하지 않아요. 갱신 실패 시 기존 파일을 유지해요. 프로세스 시작 시 `APTLY_MODEL_INFO_PATH`를 읽고, 7일을 넘긴 캐시·잘못된 파일·조회 불가는 동봉한 설명으로 대체해요. 갱신 파일을 바꾼 뒤 기존 MCP 프로세스가 자동으로 새 정보를 쓰지는 않으므로 재시작해요. capabilities/catalog 출력에서 현재 목록과 정보 source 상태를 확인할 수 있어요.

문서·캐시의 특성 설명은 추천용 자료이고 호스트 설정이나 계정의 실제 모델 사용 권한을 인증하지 않아요. 모델 목록·실효 설명이 바뀌면 카탈로그 버전과 요청 digest가 달라져 이전 결과가 다른 후보에 잘못 재사용되지 않도록 해요. 기존 원장에 충돌이 나도 unknown 요청을 새 ID로 자동 재호출하지 않아요.

## 결과별 다음 행동

| status | 예시 reason | 다음 행동 |
|---|---|---|
| recommended | allowed_profile | 제안된 profile을 검토해요. 실행은 기존 호스트에서 별도로 결정해요 |
| keep_current | preserved_constraints, provider_abstained | 명시 선택을 유지하거나 추천을 보류해요. 보존 flag를 지워 강제로 재분류하지 않아요 |
| needs_context | insufficient_context, provider_needs_context | 필요한 요약을 보완하고 변경된 요청에는 새 ID를 사용해요 |
| unavailable | invalid_input, unauthorized, rate_limited, timeout, ledger_locked, outcome_unknown | 고정 reason을 확인해 아래 재조회·복구 규칙을 따라요 |

아래는 서로 다른 입력의 예예요. 원래 요청과 ID를 구분했어요.

```json
{
  "request_id": "demo-preserve-001",
  "client": "codex",
  "task": {
    "summary": "Sort the supplied numbers [3, 1, 2].",
    "operation": "analysis",
    "context_sufficient": true
  },
  "constraints": { "model_pinned": true }
}
```

이 요청은 `keep_current`/`preserved_constraints`예요. 별도의 `request_id: demo-context-001` 요청에서 constraints를 생략하고 task.context_sufficient를 false로 두면 `needs_context`/`insufficient_context`가 돼요. MCP의 인자 schema 오류는 도구 validation 오류로 반환될 수 있어요. 형식 오류나 네트워크 오류의 실제 요청을 일부러 유료로 반복할 필요는 없어요. 관련 실패 동작은 mock 회귀로 확인해요.

## MCP에서 수동 호출

먼저 현재 설치 위치에 맞는 등록 조각을 출력하고 사용자 호스트 설정에서 검토해 등록해요. 이 명령은 설정을 수정하거나 Hook을 설치하지 않아요.

```sh
node bin/aptly.ts config claude
node bin/aptly.ts config codex
```

MCP client에서 `recommend_agent`를 선택하고 예제 JSON 전체를 도구 인자로 전달해요. request_id/client/task는 CLI와 같아요. 반환된 structuredContent의 status·reason·profile을 검토해요. 클라이언트가 표시하는 tool namespace는 등록한 MCP 서버 key `aptly`를 기준으로 해요.

생성된 Claude 등록 조각은 fixture를 명시해요. 생성된 Codex 조각은 ROUTER_PROVIDER 등의 env_vars를 전달하며, 값이 없으면 runtime 기본값 fixture를 사용해요. 저장소의 Claude/Codex examples는 둘 다 fixture를 명시해요. 실제 API를 쓰려면 이 고정 fixture 설정을 확인하고 MCP 프로세스에 Decisions 환경을 전달해야 해요. 부모 셸의 환경을 바꿨다는 사실만으로 이미 실행 중인 MCP 서버가 바뀌었다고 가정하지 않아요.

`get_routing_precedence`와 `route_spawn_hook`는 현재 호출의 보존·적용 경계를 다루는 별도 경로예요. 작업 요약을 `route_spawn_hook`에 넣는 것만으로 host evidence gate가 풀리지 않으며, shadow 출력 `{}`를 추천 결과로 읽지 않아요.

## Decisions 환경 준비

키는 사용자 자격 저장소나 안전한 실행 환경에서 **서버 프로세스의 OPENAI_API_KEY**로 주입해요. 키를 요청 JSON, CLI 인자, MCP 설정 JSON, 소스·로그·임시 파일에 쓰지 않아요. 이 문서는 특정 자격 저장소를 요구하지 않아요.

아래 예제에서 private 디렉터리는 먼저 직접 선택해요. ledger 경로는 절대 경로여야 하고 부모 디렉터리는 현재 사용자 소유·권한 700이어야 해요. `/absolute/private-aptly-state`는 실제 사용할 위치로 바꾸는 설명용 경로예요. 기존 디렉터리 권한이나 원장 파일을 임의로 바꾸지 않아요.

```sh
mkdir -m 700 /absolute/private-aptly-state
export ROUTER_PROVIDER=decisions
export ROUTER_LEDGER_PATH=/absolute/private-aptly-state/advisory-ledger.json
# OPENAI_API_KEY는 이 프로세스의 안전한 환경 주입으로 준비해요.
node bin/aptly.ts recommend < examples/recommend.codex.json
```

컴파일한 CLI·MCP 서버도 같은 환경을 사용해요. `ROUTER_CONFIG_PATH`의 apply 설정이나 host context는 추천 호출에 필요하지 않아요. mode를 apply로 바꾸어 추천을 실행하는 절차도 없어요.

live 분류는 비용이 발생할 수 있어요. 원장은 요청 전에 예약하고 완료 캐시·unknown 재호출 방지에 사용해요. 로컬 예약액·호출 수 가드는 실제 청구 상한이 아니에요. 결과의 usage는 관측한 정수 토큰 수이고 latency_ms는 분류 경과 시간이에요. 누락된 사용량을 0이나 실제 청구액으로 해석하지 않아요. 분류 비용을 자식 모델의 실행 비용·구독 사용량·총비용 절감으로 표현하지 않아요.

## 재조회와 오류 복구

- 같은 요청을 확인하려면 **같은 request_id, 입력, 정책, provider와 원장**을 유지해요. 완료 결과는 cached로 재사용돼요. 입력이나 정책을 바꾸고 같은 ID를 쓰면 request_conflict가 될 수 있어요.
- 이전 버전의 직접 추천과 새 advisory 경로는 원장 digest 용도가 달라요. 기존 ID가 request_conflict이면 원장을 보존하고 기존 완료/unknown 상태를 먼저 확인해요. 이를 해결하려고 unknown 요청에 새 ID를 발급하지 않아요.
- `outcome_unknown`은 이전 호출의 청구·결과가 불명확한 상태예요. 새 ID로 자동 재호출하거나 원장을 비워 우회하지 않아요. 기존 ID의 결과와 실행 상태부터 확인해요. 단순 재조회가 원격 API의 미확인 결과를 자동 복원해 주지는 않아요.
- `ledger_locked`이면 같은 원장을 쓰는 기존 서버·명령이 아직 실행 중인지 먼저 확인해요. 실행 중인 프로세스의 lock은 삭제하지 않아요. crash가 확인돼도 원장을 보존하고, 관련 프로세스가 모두 끝난 것을 확인한 뒤 그 원장의 stale lock만 운영자가 별도로 처리해요. 자동 lock 삭제·원장 초기화 기능은 없어요.
- 인증·429·timeout을 수정한 뒤에도 이전 요청이 unknown이면 새 ID로 무조건 재시도하지 않아요. 이 규칙은 실패 메시지가 안전한 코드로만 반환돼 원시 API 오류를 볼 수 없는 경우에도 같아요.

진단 자료가 필요하면 `report --format both --output-dir reports`로 로컬 첨부 파일을 만들고 검토해요. 키가 존재한다는 진단은 API 인증 성공을 뜻하지 않아요. [진단 안내](https://github.com/abruption/aptly/blob/9d1f7d6449290fee961ccaead0be1d032a88e809/docs/REPORTING.md), [공개 준비](https://github.com/abruption/aptly/blob/9d1f7d6449290fee961ccaead0be1d032a88e809/docs/RELEASING.md)를 참고해요.

설치용 npm archive에는 이 사용 안내를 동봉해요. 설계·호환성·과거 검증 등 다른 문서는 source archive에서 확인해요.
