# Aptly 사용 가이드

**한국어** · [English](en.md) · [简体中文](zh-CN.md) · [日本語](ja.md)

[README로 돌아가기](../../README.md)

한국어가 정본입니다. 이 안내는 Aptly의 일반적인 설치·사용 방법을 설명합니다. 패키지를 설치할 수 있다는 사실이 모든 계정의 모델 접근 가능성을 뜻하지는 않습니다. 실제 자식 실행·승인·샌드박스·MCP 권한은 Claude Code 또는 Codex가 담당합니다.

## 설치

Node.js 24 이상과 Claude Code 또는 Codex가 필요합니다. npm의 최신 안정 버전을 전역 설치하려면 다음 명령을 사용하십시오:

**기존 영속 원장을 0.1.2 이상으로 업그레이드하기 전에**, 해당 원장을 사용하는 모든 호스트·MCP 서버·별도 CLI와 구버전 프로세스를 정지하십시오. 새 영구 잠금은 구버전 writer와 함께 사용할 수 없습니다. 새 설치에는 기존 잠금 격리가 필요하지 않습니다. 이전 빈 잠금이 남았다면 [원장 잠금 전환 절차](#중단된-프로세스와-원장-잠금)를 따라 확인된 기존 잠금만 오프라인으로 격리하고, JSON 원장·`unknown`·비용·완료 캐시는 보존하십시오.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly --version
```

`aptly --version`으로 설치된 버전을 확인하십시오. Node.js 환경을 바꾸면 재설치가 필요할 수 있습니다.

`postinstall`은 현재 사용자의 기존 호스트 설정 디렉터리에 MCP와 `PreToolUse` Hook을 등록합니다. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`을 사용한다면 설치 프로세스에도 같은 환경을 전달하십시오. 아직 없는 호스트 디렉터리는 자동 등록에서 건너뛰고, 명시적인 `setup`으로 만들 수 있습니다. 필요한 호스트만 등록하려면 `--client codex` 또는 `--client claude`를 사용하십시오.

새 등록은 `ROUTER_PROVIDER=decisions`, Hook `defaults` 정책과 호스트별 비공개 원장을 지정합니다. 기존 다른 설정·Hook, 기존 Aptly의 실행 명령·환경·분류 방식·원장 경로는 보존합니다. 기존 fixture 설정을 자동으로 유료 모드로 바꾸지 않습니다.

### npm 설치 스크립트 허용

위 설치 명령의 `--allow-scripts=aptly`는 해당 설치에서 Aptly의 `postinstall`을 명시적으로 허용합니다. npm 11.19.1에서 지원을 확인했으며, 사용자 전체의 npm 허용 설정은 변경하지 않습니다. [npm 공식 안내](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)를 참고하십시오.

`npm warn install-scripts ... not yet covered by allowScripts`는 허용 정책에 아직 등록되지 않았다는 안내입니다. npm 11.19.1에서는 이 경고만으로 스크립트가 차단됐다고 판단할 수 없습니다. npm 버전·엄격 정책·`ignore-scripts`에 따라 동작이 달라지며, 설치 성공만으로 MCP·Hook 등록 성공을 확인할 수는 없습니다. `postinstall`은 npm 출력에 표시되지 않을 수도 있습니다.

옵션을 지원하지 않는 npm이거나 자동 등록 대신 직접 설정하려면 다음 명령을 사용하십시오:

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all --mode defaults
```

명시적 `setup`은 설치 스크립트 실행 여부와 관계없이 사용할 수 있습니다. 기존 실행 경로는 보존하므로 구버전 경로 오류는 아래 복구 절차를 따르십시오. 키 설정·MCP 재시작과 Codex의 `/hooks` 신뢰 승인은 별도로 필요합니다.

### 패키지 업데이트

`aptly update`는 **Aptly 0.1.3부터 지원합니다**. 검증된 전역 npm 설치에서만 현재 실행 중인 패키지와 동일한 prefix의 `aptly@latest`를 설치합니다. 로컬 설치·소스 체크아웃·확인할 수 없는 경로는 거절합니다. npm의 유효 설정에서 `dry-run=true`이면 실제 설치를 시작하기 전에 `update_dry_run_enabled`로 거절합니다. 설정을 확인할 수 없으면 `update_configuration_unverified`로 중단합니다. 시험 실행을 업데이트 성공으로 보고하지 않습니다.

업데이트 전에 위 원장 전환 절차에 따라 다른 호스트·MCP·CLI 프로세스를 중지하십시오. 명령은 설치 스크립트를 실행하지 않으므로 업데이트 후 명시적으로 설정하고 호스트를 재시작하십시오:

```sh
aptly update
aptly setup --client all --mode defaults
aptly --version
```

기존 MCP 실행 경로와 사용자 래퍼를 자동으로 전환하지 않습니다. 이전 경로가 남으면 아래 실행 경로 복구 안내를 따르십시오. 키 설정과 Codex의 `/hooks` 신뢰 검토는 별도 단계입니다. npm 인증·네트워크·권한 오류로 실패하면 수동 설치 안내를 사용하십시오. 자동 업데이트는 수행하지 않습니다.

### 새 버전 알림

**Aptly 0.1.3부터** 일반 CLI의 대화형 실행에서 최신 안정 버전을 확인하고, 더 새 버전이 있으면 stderr에 `aptly update`를 안내합니다. stdin·stdout·stderr가 모두 터미널일 때만 동작하며, MCP 서버·자동 setup·추천/분류 경로·파이프·CI에서는 확인하지 않습니다. 기존 JSON stdout과 MCP·Hook 응답은 유지합니다.

공개 npm 레지스트리의 Aptly 버전 메타데이터만 조회하며 키·작업 요약·호스트 설정은 보내지 않습니다. 네트워크와 응답 읽기는 최대 800ms·16KiB로 제한하고, 결과는 `~/.cache/aptly/update-check.json`에 24시간 캐시합니다. 실패 후에는 1시간 대기하며, 조회·캐시 오류로 원래 명령을 실패시키지 않습니다. 버전 조회를 끄려면 CLI 실행 환경에 `APTLY_NO_UPDATE_NOTIFIER=1`을 설정하십시오. 이 변수는 MCP 키 설정용 `aptly set env`의 지원 대상이 아닙니다. 알림은 업데이트를 설치하지 않습니다.

### CLI로 설정하기

`set` 명령은 0.1.1부터 지원합니다. 명령은 기존 실행 경로를 자동 전환하지 않습니다. API 키 설정은 현재 패키지의 표준 Node/서버 등록과 OS 자격 저장소 참조 지원이 확인된 실행 경로에만 허용됩니다. 사용자 지정 래퍼·구버전·다른 설치 위치는 `credential_launcher_unverified`로 거절하며, 등록을 명시적으로 전환하거나 업그레이드한 뒤 다시 실행해야 합니다.

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

첫 명령은 Claude Code와 Codex 등록 및 누락된 기본 환경변수를 추가합니다. 기존 실행 명령·환경 목록·provider·사용자 후보·advisory 정책은 덮어쓰지 않습니다. 두 번째 명령은 값을 화면에 표시하지 않는 대화형 입력을 받으며, 명시한 변수만 변경합니다. 세 번째 명령은 API 키를 OS 자격 저장소에 보관하고 선택한 호스트가 시작할 때 읽도록 연결합니다. 값을 명령 인자로 붙이지 마십시오.

기본 대상은 두 호스트입니다. `--client codex`, `--client claude`, `--client all`로 대상을 선택할 수 있습니다. 예를 들어 Claude 후보 입력에는 `["haiku","sonnet","opus"]` 같은 JSON 문자열을 사용합니다.

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

자동화에서는 `--stdin`을 명시하십시오. 일반 변수의 예는 다음과 같습니다. 실제 키를 `printf` 명령이나 셸 기록에 넣지 마십시오.

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

일반 설정 허용 키는 `ROUTER_PROVIDER`(`fixture` 또는 `decisions`), `APTLY_CLAUDE_MODELS`, `APTLY_CODEX_MODELS`, `CLAUDE_MODELS`, `CODEX_MODELS`, `APTLY_MODEL_INFO_PATH`입니다. 후보는 지원하는 모델의 JSON 배열 문자열이며 잘못된 값·중복·기본 이름과 별칭 충돌은 거절합니다. `[]`는 해당 호스트 추천을 끄고, 모델 캐시 경로는 비공개 디렉터리 안의 절대 경로여야 합니다. 원장·Hook 정책 경로 같은 관리 항목은 이 명령으로 변경하지 않습니다.

API 키는 macOS Keychain, Linux의 설치된 `secret-tool`, 또는 Windows Credential Manager에 저장합니다. Windows 백엔드는 PowerShell과 Win32 Generic 자격 증명을 사용하며 현재 사용자 범위에 UTF-8 데이터 최대 2,560바이트를 저장합니다. Windows CI에서 합성 키의 저장·조회·수정·삭제, 한글 경로와 격리된 호스트 설정·키 참조·ACL 보존을 확인했습니다. Windows의 실제 Claude Code·Codex 세션 실행을 검증한 것은 아닙니다. 자격 저장소를 사용할 수 없으면 오류를 반환하고 평문 파일로 대체하지 않습니다. 키는 호스트별 계정으로 분리하고 MCP 파일에는 `APTLY_SECRET_BACKEND=os`·`APTLY_SECRET_CLIENT` 참조만 씁니다. OS 저장소를 명시한 뒤 키가 없거나 읽기에 실패해도 다른 환경변수 키로 조용히 대체하지 않습니다. 기존 래퍼/환경 인증은 `set default`에서 유지하며, `set env OPENAI_API_KEY`를 실행해야 OS 저장소 인증을 명시적으로 선택합니다.

명령 결과는 키 값 대신 호스트별 상태와 오류 코드만 제공합니다. `partial`이면 호스트별 결과를 확인하십시오. `credential_store_failed`는 저장소 접근·지원 상태를, `credential_rollback_failed`는 이전 키 복원 여부를 별도로 확인해야 한다는 뜻입니다. 실패한 호스트의 키는 가능한 경우 이전 값으로 복원합니다. 다른 호스트의 성공까지 전체 원자적 성공으로 간주하지 마십시오.

저장 시간 초과나 응답 해석 실패는 OS가 새 값을 기록한 뒤에도 발생할 수 있습니다. 실패하면 이전 값을 복원하거나, 이전 값이 없었다면 새 항목을 제거한 뒤 재조회합니다. 복구 여부를 확인하지 못하면 원래 오류 코드와 함께 `credential_rollback_failed`를 반환합니다. 어느 키가 활성 상태인지 단정하지 말고 재시도 전에 OS 자격 증명 저장소를 확인하십시오. 이는 가능한 범위의 복구이며 프로세스·호스트 전체의 원자적 트랜잭션이 아닙니다.

변경 후 MCP를 재시작하고 `get_routing_capabilities`의 `provider`, 후보 목록, `credential_status`를 확인하십시오. `os_store`는 저장소에서 키를 읽었다는 뜻이며 API 유효성 검증은 아닙니다. 기본 설정과 일반 변수 설정은 기존 사용자 지정 래퍼를 보존합니다. API 키 설정은 호환성이 확인되지 않은 실행 경로의 호스트 설정을 변경하지 않으며, 이미 저장을 시도했다면 해당 호스트의 이전 키를 가능한 경우 복원합니다. 새 키가 기존 래퍼에도 자동 적용된다고 가정하지 마십시오. 명령은 Codex의 `/hooks` 신뢰 승인이나 호스트 권한을 우회하지 않습니다.

### 실행 경로 오류 복구

아래 옵션은 Aptly 0.1.2부터 지원하며 npm 0.1.1에는 없습니다. 소스에서 시험하려면 `npm ci --ignore-scripts`와 `npm run build` 후 `aptly` 대신 `node bin/aptly.ts`를 사용합니다.

키 설정은 입력·저장 전에 선택한 호스트를 진단합니다. 하나라도 실패하면 입력을 받지 않고 모든 호스트를 그대로 둡니다. `--check`는 키나 자격 저장소에 접근하지 않습니다. `credential_node_mismatch`, `credential_server_mismatch`, `credential_runtime_unsupported`는 각각 Node 경로, 서버 경로, OS 저장소 지원의 불일치입니다.

Claude만 실패했다면 다음 순서로 진단하고, `launcher_migration_available`일 때만 이전을 검토하십시오:

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run`은 변경하지 않습니다. 이전 명령은 소유 기록과 일치하는 Aptly 표준 등록의 Node·서버 경로를 현재 빌드로 바꿉니다. 기존 환경·Hook·정책·다른 호스트는 보존하며 키를 읽거나 저장하지 않습니다. 오래된 실행 파일을 실행하지 않습니다. 사용자 래퍼, 소유 기록이 없거나 수정된 등록은 거절합니다. 이 경우 로컬에서 등록을 검토하고 래퍼의 안전한 환경 전달을 사용하거나 별도로 검토한 표준 등록으로 전환하십시오. 소유 기록을 삭제하거나 편집해 검증을 우회하지 마십시오.

`launcher_migration_not_owned`가 나오고 기존 등록을 보존한 상태(`mcp_created: false`)라면, **Aptly 0.1.3부터** `--include-existing`으로 명시적으로 이전할 수 있습니다. 0.1.3 이상을 설치한 뒤 다음 명령을 실행하십시오:

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

실행 전에 로컬 등록을 검토하십시오. 유효한 기존 Aptly 소유 기록과 일치하는 관리 환경변수·Hook·정책이 필요하며, 절대 Node 경로와 단일 표준 서버 경로만 허용합니다. 사용자 래퍼나 기록이 없는 등록은 이 옵션으로도 이전하지 않습니다. 기존 MCP 전체를 Aptly 소유로 바꾸지 않으므로, 이후 `remove`도 이전한 MCP 실행 경로와 원래 사용자 설정을 보존합니다. 이 옵션은 단일 호스트의 명시적 이전에만 사용할 수 있고 자동 설치에는 적용되지 않습니다.

이미 성공한 Codex는 재설정할 필요가 없습니다. 실패한 호스트만 지정해 재시도하고 MCP를 재시작하십시오. Codex를 대상으로 하면 `/hooks` 신뢰 검토가 계속 필요합니다. 진단 이후 설정 변경은 `concurrent_configuration_change`로 중단합니다. 저장 실패 후 다른 키가 관찰되거나 현재 키를 읽지 못하면 덮어쓰지 않고 `credential_rollback_failed`를 반환합니다. 파일과 OS 저장소 사이의 원자적 트랜잭션은 아니므로 다른 설정 작업을 동시에 실행하지 마십시오.

### 키와 재시작

분류용 `OPENAI_API_KEY`를 안전한 환경이나 자격 주입 래퍼를 통해 MCP 프로세스에 전달하십시오. 호스트 구독 로그인과 별개입니다. 키 값을 명령 인자·요청·설정 파일·소스·로그·임시 파일에 기록하지 마십시오.

### MCP 환경변수 설정 순서

`setup` 후 아래 예제를 기존 `aptly` 등록에 병합하십시오. `command`, `args`, 자격 주입 래퍼, `ROUTER_LEDGER_PATH`, `APTLY_HOOK_POLICY_PATH`는 보존하십시오. Setup이 비공개 원장·정책 디렉터리를 만듭니다. 원장 경로를 직접 지정한다면 사용자 소유·권한 700인 디렉터리 안의 절대 경로여야 합니다.

#### 설정 파일 위치

| 호스트 | Aptly가 사용하는 사용자 등록 위치 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`; `CODEX_HOME` 미지정 시 `~/.codex/config.toml` |
| Claude Code | `~/.claude.json`의 `mcpServers.aptly`; `CLAUDE_CONFIG_DIR` 지정 시 해당 디렉터리의 `.claude.json` |

Claude Code의 Hook 파일은 기본적으로 `~/.claude/settings.json`이며, `CLAUDE_CONFIG_DIR`을 지정하면 `$CLAUDE_CONFIG_DIR/settings.json`입니다. MCP 등록 파일과는 별개입니다. 프로젝트 `.mcp.json`·관리 설정·계정별 디렉터리를 사용한다면 수정하거나 등록하기 전에 `/mcp`에서 활성 항목을 확인하십시오.

#### API 키 전달

직접 실행할 때는 **Bash**에서 키를 화면·명령 기록에 남기지 않고 입력한 뒤 같은 셸에서 호스트를 시작합니다. zsh에서는 먼저 `bash`를 실행하십시오:

```sh
read -rsp 'OpenAI API key: ' OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
codex
```

Claude Code는 `codex` 대신 `claude`를 실행하십시오. 키는 영구 저장되지 않습니다. 실행 중인 GUI는 다른 터미널의 환경을 상속하지 않으므로 앱의 안전한 환경 전달 기능이나 기존 자격 주입 래퍼를 사용하십시오.

#### Codex 예제

기존 `[mcp_servers.aptly]` 테이블을 편집하고 같은 테이블을 중복 추가하지 마십시오. `env_vars`의 기존 항목을 유지하면서 `OPENAI_API_KEY`를 추가하십시오. `env_vars`는 호스트 환경변수를 이름으로 전달하고 `.env`는 MCP의 고정 값을 지정합니다.

```toml
[mcp_servers.aptly]
env_vars = ["OPENAI_API_KEY"]

[mcp_servers.aptly.env]
ROUTER_PROVIDER = "decisions"
APTLY_CLAUDE_MODELS = '["haiku","sonnet","opus"]'
APTLY_CODEX_MODELS = '["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

#### Claude Code 예제

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

### 건너뛰기·제거

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI`나 npm `--ignore-scripts`도 등록을 건너뜁니다. 이후 `setup`으로 등록하십시오. 모드를 바꾸려면 등록을 제거하고 원하는 `--mode`로 다시 설정하십시오. `advisory`는 추천만 전달합니다. `partial`이면 호스트별 오류 코드를 확인하십시오. 제거 시 사용자 변경 항목은 보존하고 충돌을 알립니다.

## 자동 Hook

**다음 사전 검사·추천·관측 동작은 Aptly 0.1.4부터 지원합니다.** 설치한 `PreToolUse` matcher는 Codex의 `spawn_agent` / `collaborationspawn_agent` / `Agent`와 Claude Code의 `Agent` 호출을 native 실행 전에 로컬 `route_spawn_hook`으로 전달합니다. 호스트가 Hook을 로드·신뢰하고 MCP를 연결해야 합니다. 미설정·미지원 호스트나 MCP 연결 실패까지 Aptly가 가로채도록 강제할 수는 없으며, 실행은 호스트가 담당합니다.

로컬 사전 검사에서 명시 필드·역할·resume·정책·캐시·예산을 평가합니다. 매번 유료 Decisions 요청이 필요한 것은 아닙니다. Codex에서 모델이나 effort만 지정하면 일치하는 허용 튜플로 후보를 제한하고 미지정 필드만 채웁니다. 둘 다 지정하거나 값이 미지원인 경우, 고정 역할과 resume은 분류 없이 보존합니다. 입력 필드만으로 사용자 선택인지 호스트 기본값인지 단정하지 않습니다.

모델·effort가 미지정이면 `fork_turns: "all"`이나 fork 생략도 추천을 평가합니다. **이력 변경은 허용하지 않습니다.** Codex의 모델·effort 적용에는 명시적인 `fork_turns: "none"`이 필요합니다. 그 외에는 `inherited_context_application_unverified`을 알리고 원래 인자를 보존합니다. 다른 이력 필드는 `history_semantics_unverified`로 적용을 차단하며, Claude 적용도 이력 제약 없는 일반 호출로 한정합니다. 추천 성공과 실제 적용은 다릅니다.

Codex 본문이 불투명할 때 `cleanup_merged_worktrees`처럼 구체적인 짧은 작업명만으로도 추천할 수 있습니다. 짧은 이름은 cleanup/remove/prune + merged + worktrees/branches 또는 review/fix/test + failing/broken/flaky + tests/builds 조합만 허용하며, 나머지는 기존 6단어 검사를 유지합니다. 본문은 복호화하거나 전송하지 않습니다. 작업의 세부 조건이나 삭제 권한을 추론하지 않습니다. 이력 상속 상태의 적용은 대상 호스트에서 미검증이며, 모든 버전에서 불가능하다는 뜻은 아닙니다. 공개 소스만으로 설치된 런타임의 지원을 확정하지 않습니다.

독립적인 작업일 때만 호출자가 충분한 독립 작업 맥락을 제공하고 새 자식을 명시적으로 선택하십시오. Aptly는 `all`을 `none`으로 바꾸거나 이력을 제거하거나 명시한 모델·effort를 덮어쓰지 않습니다. [합성 상속·새 자식 예제](../../examples/spawn-preflight.codex.json)는 별개의 호출이며 자동 재시도가 아닙니다. 결과 불명인 유료 호출을 새 ID로 재시도하지 마십시오.

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

### confidence와 추천 보류

`confidence`는 메타데이터이며 보정된 정답 확률로 검증되지 않았습니다. 현재 자동 적용 임계값으로 사용하지 않습니다. 현재 0과 낮은 값도 다른 적용 조건을 만족하면 허용합니다. 실제 Decisions 응답에서 값이 누락되면 오류로 거절하지만, 일반 Router·저장 결과에서는 선택 항목입니다. `keep_current`·`needs_context`는 숫자와 별개의 결과이며 기존 보류·문맥 보충 규칙을 따릅니다. 명시한 모델·effort·이력·권한은 보존합니다. 소규모 분류 평가만으로 자식 작업의 품질·총비용 개선을 주장하지 않습니다.

<a id="외부-전송과-자동-공유-끄기"></a>

### Decisions API 전송 범위

이 절의 전송 범위 명령은 다음 릴리스 후보의 기능이며 게시된 0.1.6에는 없습니다.

여기서 전송은 **로컬 작업 정보를 OpenAI Decisions API에 보내는 것**이며 Aptly 개발자에게 작업을 제공하는 기능이 아닙니다. 적용 모드 `defaults/advisory`와 전송 범위는 별개입니다. 신규 등록은 v2 정책의 `unselected` 상태이며 자동 전송하지 않습니다. 대화형 `aptly set default`는 미선택 호스트에만 범위를 묻고 Enter의 기본 선택은 `none`입니다. 비대화형 실행·postinstall은 묻거나 동의한 것으로 처리하지 않습니다.

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

위 변경 명령은 세 가지 대안을 보여 줍니다. 원하는 하나만 실행하십시오. `--client codex|claude|all`로 대상을 고를 수 있습니다. `none`은 자동 전송을 끄고 원래 호출을 보존합니다. `description`은 부모 에이전트가 제공한 설명만 허용합니다. 설명이 없으면 API 호출 전에 문맥 보충을 요청하며 native 본문·라벨로 자동 대체하지 않습니다. `defaults`는 해결 전 스폰을 차단하고 `advisory`는 안내만 제공합니다. `excerpt`는 기존 native 발췌와 명시 설명을 허용합니다. 설명의 출처·크기·민감 패턴 검사는 비민감성이나 사용자 동의를 인증하지 않습니다.

기존 v1은 `legacy` 출처의 `excerpt`로 표시하고 바이트 그대로 유지합니다. 명시 변경은 정책을 v2로 전환하고 소유권 기록을 함께 갱신합니다. 운영자가 수정한 정책·다른 실행 래퍼는 자동으로 인수하지 않으며 충돌 시 보존합니다. 키·원장·불명 기록은 삭제하지 않습니다. 변경 후 MCP를 재시작하십시오. 이미 시작된 전송을 회수하지 못하며 진행 중 결과·retry·fresh는 변경된 정책으로 적용되지 않습니다. 이전 호출 ID의 결합 충돌은 새 유료 ID로 우회하지 마십시오. 명시적 `recommend_agent`·`aptly recommend`는 별도 요청이며 이 자동 전송 설정으로 금지하지 않습니다.

수동으로 `enabled: false`를 편집하는 기존 긴급 중단도 유효하지만 소유권 충돌이 생길 수 있습니다. 일반 변경에는 위 명령을 사용하고 소유권 기록을 직접 편집하지 마십시오.

### 전송 내용과 필터 한계

`excerpt` 범위에서 사전 등록 설명이 없는 자동 분류의 `summary`는 허용된 작업 라벨과 본문의 **첫 문단을 잘라 붙인 발췌문**입니다. 의미를 새로 요약하거나 익명화하지 않습니다. UTF-8 크기는 `min(4000, max_summary_bytes)` 이하이며 전체 HTTP 요청의 크기 제한은 아닙니다. Codex의 opaque 메시지 fallback은 본문을 해독·전송하지 않고 충분히 구체적인 `task_name`만 사용합니다. 라벨에도 민감한 정보가 들어갈 수 있습니다.

`prepare_spawn_context`에 유효한 설명을 등록하면 고정 접두사와 그 설명이 native 발췌 대신 분류에 사용됩니다. 등록 자체는 API를 호출하지 않습니다. `retry_spawn_recommendation`은 문맥 부족 응답 이후 고정 접두사와 새 보충 설명으로 한 번 재추천하며, 이전 본문을 덧붙이지 않습니다. 두 경로 모두 원시 설명은 `min(3800, max_summary_bytes - 96)` 바이트 이하이고 접두사 포함 설명은 `min(4000, max_summary_bytes)` 바이트 이하입니다. `prepare_fresh_delegation` 자체는 완료된 추천을 재사용해 추가 분류를 호출하지 않으며, 독립 지시를 로컬의 다음 호출 인자로 반환합니다. 반환된 모델·effort를 그대로 명시한 Codex 호출은 현재 Hook에서 `explicit_model`로 분류 없이 보존됩니다. 이후 호출의 경유 검사가 추가 분류를 뜻하지는 않습니다. 어느 경로도 설명의 비민감성이나 자동 익명화를 보장하지 않습니다.

Decisions에는 `client`, `task.summary`, `task.operation`, `task.context_sufficient`와 후보 프로필 ID·모델·effort 설명 및 설정된 모델 특성이 전달됩니다. 분류용 API 키는 `Authorization` 헤더로, 요청 ID는 `X-Client-Request-Id` 헤더로 전송됩니다. 자동 경로의 ID는 해시이며 직접 추천의 ID는 호출자가 지정합니다. ID나 후보 설명에도 비밀을 넣지 마십시오.

자동 공유를 끄려면 `APTLY_HOOK_POLICY_PATH`가 가리키는 기존 비공개 정책 파일에서 **`enabled`만 `false`로 변경**하십시오. 나머지 필드와 소유권 기록은 유지하십시오. 이후 자동 Hook 호출은 분류 API나 호출 바인딩 파일을 만들기 전에 원래 호출을 보존합니다. 이미 시작한 전송을 되돌리거나 서버가 받은 내용을 회수하지는 못합니다. 생성된 정책을 바꾸면 설치·설정·제거 명령의 소유권 검사에서 충돌할 수 있으며, 해당 명령은 끄기 설정을 덮어쓰지 않습니다. 소유권 기록을 수정해 검사를 우회하지 마십시오.

전송 범위가 허용하면 `mode: advisory`도 분류 정보를 전송하므로 개인정보 보호용 비활성화가 아닙니다. `APTLY_HOOK_POLICY_PATH`를 지우면 기존 strict 경로로 전환될 수 있으므로 공유 끄기의 대안으로 사용하지 마십시오. `enabled: false`는 명시적인 `recommend_agent`·`aptly recommend` 요청까지 차단하지 않습니다.

공유할 요약을 직접 선택하려면 자동 공유를 끈 뒤 직접 추천에 필요한 정보만 작성하십시오. Aptly는 요약에 적은 URL의 문서나 소스 파일을 자동으로 읽어 첨부하지 않습니다. 알려진 키·Bearer 패턴을 거르는 검사는 완전한 비밀 탐지나 전송 안전성 보장이 아닙니다.

원장과 Hook 바인딩에는 요청 메타데이터·해시·캐시 결과를 저장하며 작업 발췌문을 저장하지 않습니다. Aptly의 진단 결과에도 원문을 넣지 않습니다. 다만 로컬 호스트가 실행을 이어가도록 Hook의 `updatedInput`에는 원래 작업이 유지됩니다. 호스트 자체의 대화·로그 저장은 Aptly가 제어하지 않습니다.

### 불투명 호출에 명시적 설명 전달 (0.1.4부터)

실제 예정된 세션·호출 ID와 원래 이벤트를 아는 연동은 Hook 전에 같은 MCP 프로세스에 `prepare_spawn_context({client, event, description})`를 호출할 수 있습니다. 목적·범위·결과물·제약·복잡도를 짧게 적으세요. URL의 내용은 가져오지 않습니다. 제한된 설명과 고정 접두문만 작업 발췌문을 대체하며, 이력·파일·불투명 본문은 보내지 않습니다. `cancel_spawn_context({client, event})`로 취소합니다. 자동 정책이 활성화되어야 하며 `enabled: false`는 공유를 차단합니다. 알려진 비밀 패턴 검사만으로 완전한 보호를 보장하지 않습니다.

연결은 5분간 유효하고 변경할 수 없으며 프로세스당 최대 128개입니다. 입력 변경·만료·취소 시 분류를 중단하고, 이미 평가한 호출에 설명을 바꿔 유료 재시도하지 않습니다. 실제 예정 이벤트를 알 수 없는 호출자는 사용할 수 없습니다. 기본 Hook은 설명이나 호출 ID를 만들지 않습니다. 로컬 `insufficient_context`, 공급자 `provider_needs_context`, 실제 적용의 `inherited_context_application_unverified`는 서로 다릅니다. 제한된 native 설명 전달 검증은 [전달 계약](../SPAWN_CONTEXT.md)에 기록했습니다. 이 검증은 기본 설명의 자동 생성이나 추천 모델의 실행을 증명하지 않습니다.

### 맥락 보충 후 재추천 (0.1.5부터)

자동 Hook이 `insufficient_context` 또는 `provider_needs_context`를 반환하면 `retry_id`와 보충 안내를 제공합니다. `defaults`에서는 해당 스폰을 차단하고, `advisory`에서는 안내만 전달합니다. 부모 에이전트는 이미 아는 작업 목적·범위·결과물·복잡도를 짧게 작성해 같은 MCP 프로세스에서 5분 안에 `retry_spawn_recommendation({retry_id, description})`를 호출하십시오. 미래 native 호출 ID는 필요하지 않습니다. 실제로 정보가 없을 때만 사용자에게 질문하십시오.

보충은 원래 호출당 한 번이며 동일 입력은 캐시를 재사용하고 변경한 설명은 충돌로 거부합니다. 재추천도 `needs_context`이거나 실패하면 중단하십시오. 결과 불명인 요청을 새 ID로 반복하지 마십시오. `spawn_application`이 `blocked`이면 추천을 적용하지 말고 제약을 보고하십시오. 적용 가능한 추천도 부모가 명시 선택·이력·역할·권한을 보존하며 새 native 호출에 미지정 모델·effort만 전달해야 합니다. Hook이 부모의 재호출이나 실제 실행까지 자동 수행하지는 않습니다. 원래 `prepare_spawn_context` 연결은 여전히 변경할 수 없습니다. [한계·비용·검증 계약](../SPAWN_CONTEXT.md#one-context-supplement-after-a-hook-response)을 확인하십시오.

재추천 응답의 `next_call.set_if_unspecified`는 다음 native 호출에 넣을 미지정 필드만 제공합니다. 명시한 모델·effort는 포함하지 않으며 Claude에는 effort를 추가하지 않습니다. 이력 등으로 적용이 막히면 `next_call`을 제공하지 않습니다. 이 값은 실행 결과나 권한 승인이 아닙니다.

캐시 재사용은 첫 결과가 완료된 경우에 한합니다. 결과가 불명이면 `outcome_unknown`으로 유지하며 새 ID로 유료 호출을 반복하지 마십시오.

`context_retry_allowed: false`는 추가 설명 보충을 더 허용하지 않는다는 뜻입니다. 호환 가능한 추천에서 `caller_review_required`는 부모가 인자를 검토한다는 의미이며 새 사용자 승인을 요구하지 않습니다. 기존 위임 권한과 호스트 권한 검사는 그대로 유지됩니다.

### 자동 경유의 보장 범위와 차단 결과 (0.1.5부터)

활성화되고 신뢰된 Hook이 연결된 MCP에서 지원 호출을 처리하는 범위만 보장합니다. `get_routing_capabilities.automatic_hook.guarantee`로 이 범위를 확인하십시오. Hook 미등록·미신뢰·연결 해제·호스트 오류는 서버가 탐지하거나 강제로 차단할 수 없으며 호스트가 후속 처리를 결정합니다. MCP 연결 표시만으로 개별 호출의 경유를 판단하지 마십시오.

유효한 활성 정책과 지원 대상이 확인된 뒤, `defaults`는 추천 적용 불가·예산 초과·분류 실패·결과 불명 등을 `deny`와 안전한 사유 코드로 알립니다. 원래 인자와 제약은 유지하지만 해당 스폰은 진행하지 않습니다. 상속 이력이 미검증이면 부모 모델로 조용히 실행하거나 `none`으로 변경하지 말고 제약을 보고하십시오. `advisory`는 차단 없이 같은 한계를 설명합니다. 정책 미설정·비활성화, 명시 튜플·고정 역할·resume은 의도적인 로컬 보존 경로이며 일괄 차단하지 않습니다.

복구 ID가 있으면 `get_spawn_routing_observation({retry_id})`로 같은 MCP 프로세스의 관측을 조회할 수 있습니다. 또는 기존 `{client, event}`를 사용하십시오. 두 형식을 섞거나 일부만 보내면 거부합니다. 원래 `awaiting_context`와 `context_retry.outcome`은 별개이며, 거부된 중복 요청은 `last_attempt`에 표시해 이전 분류 결과를 덮어쓰지 않습니다. 조회는 유료 요청을 만들지 않고 보관 시간을 연장하지 않습니다. 실행은 항상 `not_observed`이므로 추천이나 인자 갱신을 실제 자식 실행으로 표현하지 마십시오.

### 상속 추천에서 별도 독립 위임 준비 (0.1.6부터)

`defaults`가 상속 적용을 차단한 뒤에도 호출자가 **같은 독립 작업이며 사용자에게 필요한 상속 이력이 없고 완전한 독립 지시를 제공할 수 있음**을 선언하면, 같은 프로세스에서 `prepare_fresh_delegation`을 호출할 수 있습니다. Hook 또는 재추천에서 받은 `retry_id`, `task_name`, `standalone_task`와 `declaration: {independent_task:true, same_task:true, original_call_outcome:"blocked", history_requirement:"not_required", standalone_context_complete:true}`를 전달하십시오. API는 이미 완료된 허용 프로필을 재검증하고 분류를 추가 호출하지 않습니다.

원래 상속 호출은 차단된 채 유지됩니다. 응답의 별도 `next_call.arguments`를 검토한 뒤 기존 위임 권한과 호스트 권한 검사에 따라 새 호출을 제출하십시오. `fork_turns: "none"`과 기존 선택을 보존한 모델·effort를 포함합니다. 이 API가 사용자 의도나 실제 실행을 확인한 것은 아닙니다. 이력이 필요하거나 불명확한 경우, 역할·resume·검증하지 않은 추가 실행 인자가 있는 경우에는 사용하지 마십시오. 같은 참조는 같은 작업에만 재사용할 수 있으며 5분 만료·취소·정책/후보 변경과 원래 호출 변경은 준비를 막습니다. `advisory`처럼 원래 실행을 허용한 경로에는 제공하지 않습니다. [계약과 한계](../SPAWN_CONTEXT.md#intentional-fresh-delegation)를 확인하십시오.

이 경로는 호스트가 원래 호출의 차단 결과를 돌려준 뒤에만 사용하십시오. `original_call_outcome`이 `executed` 또는 `unknown`이면 준비를 거절합니다. 이는 호출자 선언이며 서버의 실행 관측이 아닙니다. 동일 준비 응답을 여러 번 받는 것이 자식 실행 1회를 보장하지 않으며, 프로필은 원래 분류 요약을 기준으로 선택됐으므로 다른 작업에 재사용하면 안 됩니다.

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

Codex가 자식 `message`를 암호문으로 Hook에 전달하는 환경에서는 본문을 읽거나 해독하지 않습니다. 이 경우 충분히 구체적인 평문 `task_name`만 요약으로 사용합니다. 예를 들어 `sort_supplied_numbers_3_1_2_ascending_without_tools`처럼 작업 종류와 범위를 설명하십시오. 지원하지 않거나 모호한 작업명은 원래 모델을 유지합니다. Claude Code와 평문 본문이 전달되는 호출은 제공된 본문 요약을 사용합니다.

동일한 `client`와 원래 Hook `event`로 `get_spawn_routing_observation`을 호출해 해당 호출을 조회하십시오. 식별자는 해시로 반환하며 사전 검사, 분류·캐시 결과, 추천, 인자 변경·적용 차단과 `execution: not_observed`를 구분합니다. `arguments_updated`는 Hook 출력 인자만 뜻하며 실제 자식 모델 관측이 아닙니다. 기록은 해당 MCP 프로세스의 최근 128개·10분으로 제한합니다. `not_observed`는 다른 프로세스·재시작·만료·퇴출·입력 불일치 때문일 수도 있으므로 전체 Hook 우회를 증명하지 않습니다. 프로세스 공용 `automatic_hook.last_result`는 제거합니다. 원문 작업·경로·세션 ID·자격 값은 반환하지 않습니다.

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

### 중단된 프로세스와 원장 잠금

이 잠금 방식은 Aptly `0.1.2`부터 지원하며 npm `0.1.1`에는 없습니다. JSON 원장의 요청 ID·`unknown`·완료 캐시·호출 수·비용 예약 형식은 유지합니다. 영속 원장에만 Node.js 24 내장 SQLite를 사용하며, 원장 옆의 `ledger.json.lock`은 정상 종료 후에도 남는 잠금 파일입니다. 파일이 있다는 사실만으로 활성 잠금을 뜻하지 않습니다. 새 방식에서는 프로세스 종료 시 OS 잠금이 해제되므로 후속 요청이 같은 원장을 다시 사용할 수 있습니다. 결과가 불명확했던 기존 ID를 재호출하거나 예약 비용을 되돌리지는 않습니다.

원장과 잠금 파일은 하드 링크를 지원하는 로컬 파일시스템의 비공개 디렉터리에 두고, 하나의 원장을 동일한 정규 경로로 사용하십시오. 네트워크 공유·클라우드 동기화 디렉터리·경로 별칭은 지원 범위가 아닙니다. 새 잠금 파일과 SQLite journal을 삭제·교체하거나, 사용 중 다른 DB 도구로 열지 마십시오. 잠금 파일의 나이와 PID만으로 소유자가 종료됐다고 판단하지 않습니다.

이전 버전의 빈 `.lock` 파일은 살아 있는 소유자가 있는지 확인할 수 없어 자동으로 초기화하거나 제거하지 않습니다. 구버전을 포함한 모든 관련 호스트·MCP·원장 접근 프로세스를 정지하고, 모든 writer를 새 버전으로 전환하십시오. 파일이 기존 방식의 잠금임을 확인한 경우에만 그 파일을 별도로 격리한 뒤 같은 JSON 원장 경로로 다시 시작합니다. 원장·`unknown`·비용·완료 결과는 초기화하거나 삭제하지 마십시오. 소유자나 형식을 확신할 수 없으면 차단 상태를 유지하고 조사하십시오.

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
