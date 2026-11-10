# 고급 MCP 연동·개발 참고

[한국어](../ko/advanced.md) · [English](../en/advanced.md) · [简体中文](../zh-CN/advanced.md) · [日本語](../ja/advanced.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [MCP 환경변수 설정 순서](#guide-manual-mcp-setup)
- [API 키 전달](#guide-key-environment)
- [Codex 예제](#guide-codex-configuration)
- [Claude Code 예제](#guide-claude-configuration)
- [직접 추천](#guide-direct-recommendations)
- [불투명 호출에 명시적 설명 전달 (0.1.4부터)](#guide-explicit-spawn-context)
- [맥락 보충 후 재추천 (0.1.5부터)](#guide-context-retry)
- [상속 추천에서 별도 독립 위임 준비 (0.1.6부터)](#guide-fresh-delegation)
- [공식 설명과 캐시](#guide-model-info-cache)
- [맥락 전달](#guide-context-delivery)
- [진단과 개발](#guide-diagnostics-and-development)

<a id="guide-manual-mcp-setup"></a>

## MCP 환경변수 설정 순서

`setup` 후 아래 예제를 기존 `aptly` 등록에 병합하십시오. `command`, `args`, 자격 주입 래퍼, `ROUTER_LEDGER_PATH`, `APTLY_HOOK_POLICY_PATH`는 보존하십시오. Setup이 비공개 원장·정책 디렉터리를 만듭니다. 원장 경로를 직접 지정한다면 사용자 소유·권한 700인 디렉터리 안의 절대 경로여야 합니다.

<a id="guide-key-environment"></a>

### API 키 전달

직접 실행할 때는 **Bash**에서 키를 화면·명령 기록에 남기지 않고 입력한 뒤 같은 셸에서 호스트를 시작합니다. zsh에서는 먼저 `bash`를 실행하십시오:

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code는 `codex` 대신 `claude`를 실행하십시오. 키는 영구 저장되지 않습니다. 실행 중인 GUI는 다른 터미널의 환경을 상속하지 않으므로 앱의 안전한 환경 전달 기능이나 기존 자격 주입 래퍼를 사용하십시오.

<a id="guide-codex-configuration"></a>

### Codex 예제

기존 `[mcp_servers.aptly]` 테이블을 편집하고 같은 테이블을 중복 추가하지 마십시오. `env_vars`의 기존 항목을 유지하면서 `OPENAI_API_KEY`를 추가하십시오. `env_vars`는 호스트 환경변수를 이름으로 전달하고 `.env`는 MCP의 고정 값을 지정합니다.

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

<a id="guide-claude-configuration"></a>

### Claude Code 예제

기존 `mcpServers.aptly.env` 객체에 다음 값을 병합하십시오:

```json
{
  "ROUTER_PROVIDER": "decisions",
  "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
  "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
}
```

직접 실행에서는 다음 선택적 참조로 Claude Code 환경에 이미 있는 키를 전달할 수 있습니다. 자격 주입 래퍼에는 추가하지 마십시오. 변수가 없으면 키가 전달되지 않고 참조 문자열이 그대로 남을 수 있습니다:

```json
{
  "OPENAI_API_KEY": "${OPENAI_API_KEY}"
}
```

모델 후보는 **JSON 문자열**입니다. 미지정하면 기본 후보를 사용하고 `[]`는 해당 호스트 추천을 끕니다. Aptly는 MCP 시작 환경을 읽으며 프로젝트 `.env` 파일을 자동 로드하지 않습니다.

변경 후 호스트 또는 MCP를 재시작하십시오. **Codex에서는 `/hooks`에서 새 Hook을 검토하고 신뢰를 승인하십시오.** `/mcp`와 `get_routing_capabilities`에서 `provider`, 후보, `automatic_hook.mode`를 확인하십시오. 무료 상태 조회는 키 인증을 검증하지 않으며 `recommend_agent`는 비용이 발생할 수 있습니다. `unauthorized`면 키 전달을, `needs_context`면 작업 요약을 확인하십시오.

설정 위치·전달 방식의 공식 설명은 [Codex 구성 참조](https://learn.chatgpt.com/docs/config-file/config-reference)와 [Claude Code MCP 안내](https://code.claude.com/docs/en/mcp)를 참고하십시오.

<a id="guide-direct-recommendations"></a>

## 직접 추천

`recommend_agent` MCP와 CLI `recommend`는 작업 요약을 받아 프로필을 추천합니다. 자식을 직접 생성하지 않습니다. 아래 JSON을 MCP 도구 인자로 전달하거나 파일에 저장해 CLI의 표준 입력으로 제공하십시오.

```json
{
  "request_id": "demo-codex-sort-001",
  "client": "codex",
  "task": {
    "summary": "Sort the supplied numbers [3, 1, 2] into ascending order. No files or network are needed.",
    "operation": "analysis",
    "context_sufficient": true
  }
}
```

```sh
ROUTER_PROVIDER=fixture aptly recommend < request.json
aptly capabilities
aptly config codex
aptly config claude
```

fixture는 키·네트워크·자식 실행 없이 로컬 규칙으로 생성한 시험용 결과를 반환합니다. 실제 Decisions의 판단이나 품질 시험 결과가 아닙니다. `config`는 수동 MCP 등록 조각만 출력하고, `setup`은 설정을 실제 변경합니다. 실제 API를 사용할 때는 앞서 설명한 키·분류 방식·비공개 원장을 준비하십시오.

`task.operation`은 `read_only`, `write`, `review`, `analysis` 중 하나입니다. `context_sufficient`는 호출자가 필요한 요약을 제공했다는 표현이며 호스트 설정 검증이 아닙니다. `eligible_profile_ids`를 생략하면 해당 호스트에 설정된 후보 목록을 사용하고, 지정하면 그 안에서 후보를 제한합니다.

`constraints`의 `model_pinned`, `effort_pinned`, `role_pinned`, `fork_inherits` 중 하나라도 true이면 기존 선택을 보존합니다. 생략은 이 계획용 요청에서 보존 조건을 선언하지 않았다는 뜻입니다. 실제 호스트에 고정된 설정이 없다고 확인하는 의미는 아니며, 새 요청에는 `provenance_verified`를 사용하지 않습니다.

| status | 다음 행동 |
|---|---|
| `recommended` | `profile`을 검토하고 기존 호스트에서 별도로 실행 여부를 결정하십시오 |
| `keep_current` | 명시 선택을 유지하거나 추천을 보류하십시오 |
| `needs_context` | 필요한 요약을 보완하십시오 |
| `unavailable` | 결과 사유를 나타내는 `reason`을 확인하십시오. 결과가 불명확한 유료 요청을 새 ID로 자동 재호출하지 마십시오 |

직접 추천의 `application: advisory_only`는 호스트 설정 확인·모델 접근 권한·실행 승인이 아닙니다. 완료 결과를 재조회할 때는 같은 ID·입력·정책·원장을 유지하십시오. `unknown`은 결과가 불명확하다는 뜻이므로 새 ID로 무조건 재시도하지 마십시오. 맥락을 보완해 입력이 달라진 새 요청에는 다른 ID를 사용하십시오.

<a id="guide-explicit-spawn-context"></a>

## 불투명 호출에 명시적 설명 전달 (0.1.4부터)

실제 예정된 세션·호출 ID와 원래 이벤트를 아는 연동은 Hook 전에 같은 MCP 프로세스에 `prepare_spawn_context({client, event, description})`를 호출할 수 있습니다. 목적·범위·결과물·제약·복잡도를 짧게 적으세요. URL의 내용은 가져오지 않습니다. 제한된 설명과 고정 접두문만 작업 발췌문을 대체하며, 이력·파일·불투명 본문은 보내지 않습니다. `cancel_spawn_context({client, event})`로 취소합니다. 자동 정책이 활성화되어야 하며 `enabled: false`는 공유를 차단합니다. 알려진 비밀 패턴 검사만으로 완전한 보호를 보장하지 않습니다.

연결은 5분간 유효하고 변경할 수 없으며 프로세스당 최대 128개입니다. 입력 변경·만료·취소 시 분류를 중단하고, 이미 평가한 호출에 설명을 바꿔 유료 재시도하지 않습니다. 실제 예정 이벤트를 알 수 없는 호출자는 사용할 수 없습니다. 기본 Hook은 설명이나 호출 ID를 만들지 않습니다. 로컬 `insufficient_context`, 공급자 `provider_needs_context`, 실제 적용의 `inherited_context_application_unverified`는 서로 다릅니다. 제한된 native 설명 전달 검증은 [전달 계약](../../SPAWN_CONTEXT.md)에 기록했습니다. 이 검증은 기본 설명의 자동 생성이나 추천 모델의 실행을 증명하지 않습니다.

<a id="guide-context-retry"></a>

## 맥락 보충 후 재추천 (0.1.5부터)

자동 Hook이 `insufficient_context` 또는 `provider_needs_context`를 반환하면 `retry_id`와 보충 안내를 제공합니다. `defaults`에서는 해당 스폰을 차단하고, `advisory`에서는 안내만 전달합니다. 부모 에이전트는 이미 아는 작업 목적·범위·결과물·복잡도를 짧게 작성해 같은 MCP 프로세스에서 5분 안에 `retry_spawn_recommendation({retry_id, description})`를 호출하십시오. 미래 native 호출 ID는 필요하지 않습니다. 실제로 정보가 없을 때만 사용자에게 질문하십시오.

보충은 원래 호출당 한 번이며 동일 입력은 캐시를 재사용하고 변경한 설명은 충돌로 거부합니다. 재추천도 `needs_context`이거나 실패하면 중단하십시오. 결과 불명인 요청을 새 ID로 반복하지 마십시오. `spawn_application`이 `blocked`이면 추천을 적용하지 말고 제약을 보고하십시오. 적용 가능한 추천도 부모가 명시 선택·이력·역할·권한을 보존하며 새 native 호출에 미지정 모델·effort만 전달해야 합니다. Hook이 부모의 재호출이나 실제 실행까지 자동 수행하지는 않습니다. 원래 `prepare_spawn_context` 연결은 여전히 변경할 수 없습니다. [한계·비용·검증 계약](../../SPAWN_CONTEXT.md#one-context-supplement-after-a-hook-response)을 확인하십시오.

재추천 응답의 `next_call.set_if_unspecified`는 다음 native 호출에 넣을 미지정 필드만 제공합니다. 명시한 모델·effort는 포함하지 않으며 Claude에는 effort를 추가하지 않습니다. 이력 등으로 적용이 막히면 `next_call`을 제공하지 않습니다. 이 값은 실행 결과나 권한 승인이 아닙니다.

캐시 재사용은 첫 결과가 완료된 경우에 한합니다. 결과가 불명이면 `outcome_unknown`으로 유지하며 새 ID로 유료 호출을 반복하지 마십시오.

`context_retry_allowed: false`는 추가 설명 보충을 더 허용하지 않는다는 뜻입니다. 호환 가능한 추천에서 `caller_review_required`는 부모가 인자를 검토한다는 의미이며 새 사용자 승인을 요구하지 않습니다. 기존 위임 권한과 호스트 권한 검사는 그대로 유지됩니다.

<a id="guide-fresh-delegation"></a>

## 상속 추천에서 별도 독립 위임 준비 (0.1.6부터)

`defaults`가 상속 적용을 차단한 뒤에도 호출자가 **같은 독립 작업이며 사용자에게 필요한 상속 이력이 없고 완전한 독립 지시를 제공할 수 있음**을 선언하면, 같은 프로세스에서 `prepare_fresh_delegation`을 호출할 수 있습니다. Hook 또는 재추천에서 받은 `retry_id`, `task_name`, `standalone_task`와 `declaration: {independent_task:true, same_task:true, original_call_outcome:"blocked", history_requirement:"not_required", standalone_context_complete:true}`를 전달하십시오. API는 이미 완료된 허용 프로필을 재검증하고 분류를 추가 호출하지 않습니다.

원래 상속 호출은 차단된 채 유지됩니다. 응답의 별도 `next_call.arguments`를 검토한 뒤 기존 위임 권한과 호스트 권한 검사에 따라 새 호출을 제출하십시오. `fork_turns: "none"`과 기존 선택을 보존한 모델·effort를 포함합니다. 이 API가 사용자 의도나 실제 실행을 확인한 것은 아닙니다. 이력이 필요하거나 불명확한 경우, 역할·resume·검증하지 않은 추가 실행 인자가 있는 경우에는 사용하지 마십시오. 같은 참조는 같은 작업에만 재사용할 수 있으며 5분 만료·취소·정책/후보 변경과 원래 호출 변경은 준비를 막습니다. `advisory`처럼 원래 실행을 허용한 경로에는 제공하지 않습니다. [계약과 한계](../../SPAWN_CONTEXT.md#intentional-fresh-delegation)를 확인하십시오.

이 경로는 호스트가 원래 호출의 차단 결과를 돌려준 뒤에만 사용하십시오. `original_call_outcome`이 `executed` 또는 `unknown`이면 준비를 거절합니다. 이는 호출자 선언이며 서버의 실행 관측이 아닙니다. 동일 준비 응답을 여러 번 받는 것이 자식 실행 1회를 보장하지 않으며, 프로필은 원래 분류 요약을 기준으로 선택됐으므로 다른 작업에 재사용하면 안 됩니다.

<a id="guide-model-info-cache"></a>

## 공식 설명과 캐시

Decisions 선택지에는 모델명·Codex effort·공식 특성·작업 등급 설명을 함께 보냅니다. 동봉한 설명으로 시작할 수 있으며 추천할 때마다 문서를 가져오지는 않습니다. 최신 공식 Markdown을 반영하려면 명시적으로 갱신하십시오. 출력 파일의 상위 디렉터리는 먼저 사용자 소유의 비공개 디렉터리로 준비하십시오.

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

갱신은 고정된 [Claude 모델 문서](https://code.claude.com/docs/en/model-config.md)와 [OpenAI 모델 문서](https://learn.chatgpt.com/docs/models.md)만 읽으며 API 키를 요구하지 않습니다. 짧게 정규화한 모델 정보만 저장하고 실패하면 기존 파일을 보존합니다. 시작 시 캐시를 읽고 7일을 넘거나 유효하지 않으면 동봉 설명을 사용합니다. 갱신 후 MCP를 재시작하십시오. 새 문서에 모델이 나타나도 후보를 자동 추가하거나 계정 접근 가능성을 인증하지 않습니다.

<a id="guide-context-delivery"></a>

## 맥락 전달

Codex가 자식 `message`를 암호문으로 Hook에 전달하는 환경에서는 본문을 읽거나 해독하지 않습니다. 이 경우 충분히 구체적인 평문 `task_name`만 요약으로 사용합니다. 예를 들어 `sort_supplied_numbers_3_1_2_ascending_without_tools`처럼 작업 종류와 범위를 설명하십시오. 지원하지 않거나 모호한 작업명은 원래 모델을 유지합니다. Claude Code와 평문 본문이 전달되는 호출은 제공된 본문 요약을 사용합니다.

동일한 `client`와 원래 Hook `event`로 `get_spawn_routing_observation`을 호출해 해당 호출을 조회하십시오. 식별자는 해시로 반환하며 사전 검사, 분류·캐시 결과, 추천, 인자 변경·적용 차단과 `execution: not_observed`를 구분합니다. `arguments_updated`는 Hook 출력 인자만 뜻하며 실제 자식 모델 관측이 아닙니다. 기록은 해당 MCP 프로세스의 최근 128개·10분으로 제한합니다. `not_observed`는 다른 프로세스·재시작·만료·퇴출·입력 불일치 때문일 수도 있으므로 전체 Hook 우회를 증명하지 않습니다. 프로세스 공용 `automatic_hook.last_result`는 제거합니다. 원문 작업·경로·세션 ID·자격 값은 반환하지 않습니다.

직접 추천에는 저장소·파일 URL과 문서를 읽고 정리한 작업 범위·규모·제약을 요약에 함께 제공할 수 있습니다. URL 문자열을 보내는 것과 문서 본문을 제공하는 것은 다릅니다. 현재 Aptly의 분류 요청 처리 코드는 저장소 URL을 GET하거나 문서를 수집하지 않습니다. 필요한 문서 조회와 요약은 호출자가 수행합니다.

현재 자동 Hook에는 URL을 별도 평문으로 전달하는 필드가 없습니다. 암호화되는 `message`에 URL을 추가한 것만으로 해당 URL이 분류에 전달된다고 가정하지 마십시오. 직접 MCP 추천을 받고 그 프로필을 호스트의 기본 실행 인자로 전달하는 경로와 자동 Hook 적용을 구분합니다.

<a id="guide-diagnostics-and-development"></a>

## 진단과 개발

```sh
aptly report --format both --output-dir reports
```

report는 같은 ID를 사용하는 Markdown·JSON 비공개 파일을 만듭니다. 검토 후 수동으로 공유하며 자동 업로드하지 않습니다. 첨부 파일에 키·개인 경로·환경 값·업무 본문·원시 오류를 넣지 마십시오. API 인증 성공이나 호스트 전체 설정 확인을 뜻하지 않습니다.

소스 코드를 내려받은 작업 디렉터리에서는 아래 명령을 사용하십시오. 앞서 설명한 설치된 CLI 예제와 실행 경로를 구분하십시오.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.codex.json
ROUTER_PROVIDER=fixture node bin/aptly.ts recommend < examples/recommend.claude.json
npm test
npm run poc
npm run check:release
```

기본 회귀 시험과 fixture를 사용하는 동작 점검은 유료 API·실제 자식 없이 실행합니다. 릴리스 검사는 공개 파일·개인 정보 패턴·npm 배포 파일 허용 목록을 확인하며 게시나 Git push를 하지 않습니다. 원장은 완료 결과 재사용·unknown 재호출 방지·호출 수·지연·추정 비용을 제한하는 데 쓰며 실제 청구 상한은 아닙니다.

설계·과거 검증·개발 이력은 소스 작업 디렉터리의 다른 문서에 보존합니다. 이 다국어 가이드는 설치와 일상 사용의 기준이며 과거 연구 자료의 모든 주장이나 미구현 계획을 현재 기능으로 승격하지 않습니다.

문서 링크·패키징과 언어별 예제는 소스 작업 디렉터리에서 `npm run check:docs`로 검사합니다.

## 관련 문서

[자동 추천](routing.md) · [초기 설정·모델 후보](configuration.md) · [문제 해결](troubleshooting.md) · [비용 실측](benchmarks.md)

[가이드 목차](../ko.md)
