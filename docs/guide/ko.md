# Aptly 사용 가이드

**한국어** · [English](en.md) · [简体中文](zh-CN.md) · [日本語](ja.md)

[README로 돌아가기](../../README.md)

한국어가 정본입니다. 이 안내는 npm에 게시된 Aptly 0.1.0을 다룹니다. 패키지를 설치할 수 있다는 사실이 모든 계정의 모델 접근 가능성을 뜻하지는 않습니다. 실제 자식 실행·승인·샌드박스·MCP 권한은 Claude Code 또는 Codex가 담당합니다.

## 설치

Node.js 24 이상과 Claude Code 또는 Codex가 필요합니다. npm 패키지와 설치 위치를 지정하십시오.

```sh
npm install -g aptly@0.1.0
aptly setup --client all --mode defaults
aptly --version
```

기본 예제는 전역 설치입니다. 설치 후 `aptly --version`의 출력이 `0.1.0`인지 확인하십시오. 전역 설치는 현재 Node.js 환경에 적용되므로 버전 관리 도구에서 Node 버전을 바꾸면 다시 설치해야 할 수 있습니다. 권한 오류가 발생하면 관리자 권한을 무조건 추가하지 말고 아래 로컬 설치를 사용하십시오.

```sh
npm install --prefix ./aptly-local aptly@0.1.0
./aptly-local/node_modules/.bin/aptly setup --client all --mode defaults
```

로컬 설치에서는 위 경로의 실행 파일을 사용하십시오. 로컬 아카이브를 설치하려면 `aptly@0.1.0` 대신 `/absolute/path/aptly-0.1.0.tgz`를 지정할 수 있습니다. 설치된 `node_modules`에서 TypeScript 소스를 직접 실행하지 마십시오.

`postinstall`은 현재 사용자의 기존 호스트 설정 디렉터리에 MCP와 `PreToolUse` Hook을 등록합니다. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`을 사용한다면 설치 프로세스에도 같은 환경을 전달하십시오. 아직 없는 호스트 디렉터리는 자동 등록에서 건너뛰고, 명시적인 `setup`으로 만들 수 있습니다. 필요한 호스트만 등록하려면 `--client codex` 또는 `--client claude`를 사용하십시오.

새 등록은 `ROUTER_PROVIDER=decisions`, Hook `defaults` 정책과 호스트별 비공개 원장을 지정합니다. 기존 다른 설정·Hook, 기존 Aptly의 실행 명령·환경·분류 방식·원장 경로는 보존합니다. 기존 fixture 설정을 자동으로 유료 모드로 바꾸지 않습니다.

### 키와 재시작

`OPENAI_API_KEY`는 분류용 키입니다. 자식 모델의 기존 로그인·구독 인증과는 별개입니다. 사용자 자격 저장소나 안전한 실행 환경에서 **MCP 프로세스의 환경변수로 전달**하십시오. 키를 명령행·도구 인자·요청 JSON·MCP 설정 JSON·소스·로그·임시 파일에 기록하지 마십시오. 특정 자격 저장소는 요구하지 않습니다.

호스트를 새로 시작하거나 MCP 서버를 재시작해 등록한 설정과 환경을 반영하십시오. 다른 터미널에서 환경변수를 바꾸는 것만으로 이미 실행 중인 GUI·MCP 환경이 갱신되지는 않습니다. **Codex는 `/hooks`에서 새 Hook의 정확한 정의를 검토하고 신뢰를 승인해야 합니다.** 설치 프로그램은 신뢰 승인을 우회하지 않습니다.

키가 없거나 연결·인증·시간 제한 오류가 나면 원래 호출을 유지합니다. 직접 Decisions 호출에는 다음 환경이 필요합니다.

| 환경변수 | 용도 |
|---|---|
| `OPENAI_API_KEY` | 안전한 실행 환경에서 주입하는 분류용 키 |
| `ROUTER_PROVIDER=decisions` | 실제 분류 API 사용 |
| `ROUTER_LEDGER_PATH` | 사용자 소유·권한 700인 비공개 디렉터리 안의 절대 원장 경로 |

### MCP 환경변수 설정 순서

설치와 `setup`을 먼저 마친 뒤, 등록된 `aptly` 항목을 수정하십시오. 아래 예제는 **기존 항목에 병합할 일부 설정**입니다. 설정 파일 전체를 덮어쓰거나 기존 `command`, `args`, `ROUTER_LEDGER_PATH`, `APTLY_HOOK_POLICY_PATH`를 삭제하지 마십시오. 자동 등록이 원장·정책 경로와 비공개 디렉터리를 준비합니다.

#### 설정 파일 위치

| 호스트 | Aptly가 사용하는 사용자 등록 위치 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`; `CODEX_HOME` 미지정 시 `~/.codex/config.toml` |
| Claude Code | `~/.claude.json`의 `mcpServers.aptly`; `CLAUDE_CONFIG_DIR` 지정 시 해당 디렉터리의 `.claude.json` |

Claude Code의 `~/.claude/settings.json`은 Hook 설정 위치이며 사용자 MCP 등록 파일과 다릅니다. 기존 프로젝트 `.mcp.json`이나 관리 설정이 있다면 중복 등록하지 말고 `/mcp`에서 실제 사용하는 항목을 확인하십시오. 계정별 설정 디렉터리를 쓰는 앱에서는 기본 홈 경로만 수정해도 현재 계정에 적용되지 않을 수 있습니다.

#### API 키 전달

`OPENAI_API_KEY`는 OpenAI API 키이며 Codex·Claude Code의 구독 로그인이나 npm 인증과 별개입니다. 기본 직접 실행 설정에서는 호스트를 실행하는 프로세스의 환경에 준비하십시오. 다음은 **Bash에서** 키를 화면·명령 기록에 남기지 않고 입력한 뒤 같은 셸에서 Codex를 시작하는 예입니다. zsh를 사용한다면 먼저 `bash`를 실행하십시오.

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code는 마지막 `codex` 대신 `claude`를 실행하십시오. 키는 이 셸과 자식 프로세스에만 전달되며 영구 저장되지 않습니다. 이미 실행 중인 GUI 앱은 다른 터미널의 `export`를 상속하지 않습니다. GUI 실행은 해당 앱의 안전한 환경 전달 기능이나 자격 저장소를 읽는 실행 래퍼를 사용하십시오. 기존 자격 주입 래퍼가 있으면 그 방식을 유지하십시오. 키 값은 설정 JSON·TOML이나 공유 파일에 직접 쓰지 마십시오.

#### Codex 예제

기존 `[mcp_servers.aptly]`의 `env_vars` 목록에 `OPENAI_API_KEY`를 추가하십시오. `SSH_AUTH_SOCK` 같은 기존 항목도 유지해야 합니다. `env_vars`는 Codex 프로세스의 환경에서 **이름으로 전달할 변수 목록**, `.env` 테이블은 MCP에 전달할 **고정 값**입니다. 아래는 항목 일부이며 전체 서버 등록이 아닙니다.

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

같은 TOML 테이블을 파일 끝에 다시 추가하면 오류가 날 수 있으므로 기존 테이블을 편집하십시오. 위 예제에 생략된 실행 명령과 원장·Hook 정책 경로는 그대로 두십시오.

#### Claude Code 예제

기존 `mcpServers.aptly.env` 객체에 아래 값을 병합하십시오. 이 JSON은 `env`의 내용만 보여 줍니다. API 키를 읽는 기존 래퍼와 원장·Hook 정책 경로는 유지하십시오.

```json
{
  "ROUTER_PROVIDER": "decisions",
  "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
  "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
}
```

기본 직접 실행 등록에서 키를 명시적으로 연결하려면 Claude Code가 지원하는 환경변수 참조를 사용할 수 있습니다. 먼저 Claude Code를 시작하는 환경에 키가 있어야 합니다. 이 예제는 실제 키를 파일에 저장하지 않습니다.

```json
{
  "OPENAI_API_KEY": "${OPENAI_API_KEY}"
}
```

이 마지막 항목은 기본 직접 실행 등록용 선택 사항입니다. 별도 자격 래퍼를 사용하는 등록에는 무조건 추가하지 마십시오. 참조할 변수가 없으면 올바른 키가 전달되지 않으며, 참조 문자열 자체가 남을 수도 있습니다.

#### 어떤 값을 바꿔야 합니까?

| 항목 | 기본 사용 시 조치 |
|---|---|
| `OPENAI_API_KEY` | 기본 직접 실행이면 호스트 환경에 준비. 자격 래퍼 사용 시 기존 방식 유지 |
| `ROUTER_PROVIDER` | 실제 분류는 `decisions`, 무료 합성 시험은 `fixture` |
| `ROUTER_LEDGER_PATH`, `APTLY_HOOK_POLICY_PATH` | `setup`이 만든 값을 유지 |
| `APTLY_CLAUDE_MODELS`, `APTLY_CODEX_MODELS` | 미지정 시 기본 후보 사용. 후보를 제한할 때만 지정 |
| `APTLY_MODEL_INFO_PATH` | 공식 모델 정보 캐시를 명시 갱신해 사용할 때만 지정 |

후보 배열은 모두 **JSON 문자열**입니다. JSON 설정의 따옴표 이스케이프와 TOML의 단일 인용부호 표기는 같은 값을 전달합니다. `[]`는 해당 호스트 추천을 끕니다. 프로젝트에 `.env`를 만드는 것만으로는 적용되지 않습니다. Aptly는 `.env`를 자동 로드하지 않으며, MCP 서버가 시작할 때 받은 환경을 읽습니다.

저장 후 호스트 또는 MCP를 재시작하십시오. `/mcp`에서 `aptly` 연결을 확인하고 `get_routing_capabilities`로 `provider: decisions`, 후보 목록, `automatic_hook.mode`를 확인하십시오. 무료 상태 조회는 API 키의 유효성을 검증하지 않습니다. 실제 `recommend_agent` 요청은 분류 비용이 발생할 수 있습니다. `unavailable`/`unauthorized`면 키 전달을, `needs_context`면 작업 요약을 확인하십시오. 키 값이나 전체 설정을 로그로 출력하지 마십시오.

설정 위치·전달 방식의 공식 설명은 [Codex 구성 참조](https://learn.chatgpt.com/docs/config-file/config-reference)와 [Claude Code MCP 안내](https://code.claude.com/docs/en/mcp)를 참고하십시오.

### 건너뛰기·제거

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@0.1.0
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI` 환경이나 npm `--ignore-scripts`도 자동 등록을 건너뜁니다. 직접 `setup`으로 등록할 수 있습니다. `advisory` 모드는 추천만 전달하고 인자를 바꾸지 않습니다. 정책을 바꾸려면 기존 등록을 제거한 뒤 원하는 `--mode`로 다시 등록하십시오. `partial` 결과가 나오면 호스트별 오류 코드를 확인하십시오. 제거는 소유 기록과 일치하는 항목만 대상으로 하며, 사용자가 변경한 항목은 보존하고 충돌을 알립니다.

## 자동 Hook

연결된 대상 호출은 `route_spawn_hook` → Decisions를 자동 경유합니다. `defaults`는 해당 범위에서 호스트 기본 모델보다 Aptly의 선택을 우선하도록 운영자가 허용하는 정책입니다. 호스트의 모든 설정 출처를 관측했다는 선언은 아닙니다.

| 호스트 | 자동 선택 대상 |
|---|---|
| Codex | 모델·effort·고정 역할·resume을 지정하지 않고 `fork_turns: "none"`인 새 일반 호출 |
| Claude Code | 모델·effort·고정 역할·resume·이력 상속을 지정하지 않은 `subagent_type: "general-purpose"` 호출 |

명시 선택과 역할·fork·resume, 승인·샌드박스·MCP 권한은 보존합니다. fixture 결과로 기본 모델을 자동 변경하지 않습니다. 불충분한 맥락·지원하지 않는 응답·취소·변경된 호출에서는 기존 인자를 유지합니다. 각 호출의 입력·정책·후보 정보가 일치하는지 확인하고, 비동기 응답 후 다시 확인합니다.

별도 설정 없이 실행하는 CLI와 기존 수동 설정은 fixture / shadow가 기본입니다. 자동 정책이 없는 기존 호스트 설정 증거에 기반한 경로와 설치한 기본값 선택 정책은 구분합니다. 호스트 내부 패치는 보류 상태이며 직접 추천의 선행 조건이 아닙니다.

| MCP 도구 | 용도 |
|---|---|
| `get_routing_capabilities` | 무료로 후보·제한·분류 방식·Hook 상태를 조회합니다 |
| `recommend_agent` | 작업 요약으로 프로필 추천을 받습니다 |
| `get_routing_precedence` | 호출의 보존 근거와 미확인 설정 출처를 설명합니다 |
| `route_spawn_hook` | 설치한 정책에 따라 대상 호출의 기본값을 선택하거나 추천만 전달합니다 |

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

## 모델과 환경변수

기본 후보는 여섯 프로필입니다. 등급은 Aptly의 운영 프리셋이며 두 제공사의 모델이 동급이라는 뜻은 아닙니다.

| 등급 | Claude Code | Codex | 대표 작업 |
|---|---|---|---|
| simple | `haiku` | `gpt-6-luna` / `max` | 추출·형식 변환·작은 기계적 수정 |
| routine | `sonnet` | `gpt-6.1-terra` / `high` | 문맥을 고려한 작성·번역·범위가 명확한 구현 |
| deep | `opus` | `gpt-6.1-sol` / `medium` | 복합 디버깅·설계 판단·심층 검토 |

MCP의 `env` 값은 문자열이므로 후보 배열도 JSON 문자열로 전달합니다.

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\", \"sonnet\", \"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\", \"gpt-6.1-terra\", \"gpt-6.1-sol\"]"
  }
}
```

미지정이면 위 기본값, `[]`이면 해당 호스트의 추천을 비활성화합니다. 빈 문자열·중복·지원하지 않는 모델·잘못된 JSON은 오류입니다. `CLAUDE_MODELS`·`CODEX_MODELS`도 별칭으로 지원하지만 같은 제공사의 기본 이름과 별칭을 동시에 설정하면 오류입니다. 후보 설정은 기존 선택을 덮어쓰거나 계정의 모델 접근 권한을 인증하지 않습니다.

### 공식 설명과 캐시

Decisions 선택지에는 모델명·Codex effort·공식 특성·작업 등급 설명을 함께 보냅니다. 동봉한 설명으로 시작할 수 있으며 추천할 때마다 문서를 가져오지는 않습니다. 최신 공식 Markdown을 반영하려면 명시적으로 갱신하십시오. 출력 파일의 상위 디렉터리는 먼저 사용자 소유의 비공개 디렉터리로 준비하십시오.

```sh
mkdir -m 700 /absolute/private-aptly-state
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

갱신은 고정된 [Claude 모델 문서](https://code.claude.com/docs/en/model-config.md)와 [OpenAI 모델 문서](https://learn.chatgpt.com/docs/models.md)만 읽으며 API 키를 요구하지 않습니다. 짧게 정규화한 모델 정보만 저장하고 실패하면 기존 파일을 보존합니다. 시작 시 캐시를 읽고 7일을 넘거나 유효하지 않으면 동봉 설명을 사용합니다. 갱신 후 MCP를 재시작하십시오. 새 문서에 모델이 나타나도 후보를 자동 추가하거나 계정 접근 가능성을 인증하지 않습니다.

## 맥락 전달

Codex가 자식 `message`를 암호문으로 Hook에 전달하는 환경에서는 본문을 읽거나 해독하지 않습니다. 이 경우 충분히 구체적인 평문 `task_name`만 요약으로 사용합니다. 예를 들어 `sort_supplied_numbers_3_1_2_ascending_without_tools`처럼 작업 종류와 범위를 설명하십시오. 짧거나 모호한 이름은 원래 모델을 유지합니다. Claude Code와 평문 본문이 전달되는 호출은 제공된 본문 요약을 사용합니다.

`get_routing_capabilities`의 `automatic_hook.last_result`에서 해당 MCP 프로세스가 마지막으로 기본값을 적용하거나 원래 호출을 유지한 사유를 확인할 수 있습니다. `null`은 아직 자동 Hook 처리 기록이 없다는 뜻입니다. 작업 본문이나 개인 설정 값은 반환하지 않습니다.

직접 추천에는 저장소·파일 URL과 문서를 읽고 정리한 작업 범위·규모·제약을 요약에 함께 제공할 수 있습니다. URL 문자열을 보내는 것과 문서 본문을 제공하는 것은 다릅니다. 현재 Aptly의 분류 요청 처리 코드는 저장소 URL을 GET하거나 문서를 수집하지 않습니다. 필요한 문서 조회와 요약은 호출자가 수행합니다.

현재 자동 Hook에는 URL을 별도 평문으로 전달하는 필드가 없습니다. 암호화되는 `message`에 URL을 추가한 것만으로 해당 URL이 분류에 전달된다고 가정하지 마십시오. 직접 MCP 추천을 받고 그 프로필을 호스트의 기본 실행 인자로 전달하는 경로와 자동 Hook 적용을 구분합니다.

## 비용 실측

2026-11-05에 [session-peer의 영어 README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md)를 정본으로 [한국어 번역](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md)을 검토했습니다. 합계 17,964바이트의 같은 문서와 같은 지시로 실행마다 수정안 6개를 작성했고 원본은 수정하지 않았습니다.

작업명만 제공한 자동 Hook 시험은 3회 모두 `needs_context`로 보류됐습니다. `recommend_agent`에 저장소·파일 URL을 추가한 3회와 URL에 문서 요약까지 추가한 3회는 모두 Terra/high를 추천했습니다. 아래는 URL+요약 조건의 실제 Terra/high 3회를 직전 Sol/high 3회와 비교한 회당 평균입니다.

| Standard API 환산 기준 | Sol/high | Terra/high + 분류비 | 감소율 |
|---|---:|---:|---:|
| 실제 캐시 사용량 반영 | $0.03229 | $0.01354 | 58.05% |
| 입력 전체를 비캐시로 환산 | $0.11254 | $0.05363 | 52.35% |

호스트에 기록된 실측 토큰에 [공식 Standard API 단가](https://developers.openai.com/api/docs/pricing)를 적용한 USD 환산값입니다. 구독 실청구액이나 실제 한도 차감액은 아닙니다. Terra 쪽에는 [Decisions 분류 비용](https://developers.openai.com/api/docs/guides/decisions) 회당 $0.0000756을 포함했습니다. 비교 범위는 검토 자식 에이전트와 분류이며 문서 수집·요약 준비·메인 에이전트 조사 비용은 제외했습니다.

측정은 **명시적 MCP 추천 → 추천 프로필을 인자로 전달한 호스트의 기본 실행**입니다. 자동 Hook의 URL 수집·전달 기능 검증이 아닙니다. 기준군은 직전 실측을 재사용했고 조건별 표본은 3회입니다. 문서 전체 읽기·원문 인용 일치·출력 형식은 확인했지만 품질 동등성, 통계적 유의성, 다른 업무의 절감을 보장하지 않습니다.

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
