# 초기 설정·모델 후보

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[가이드 목차](../ko.md)

설정 전 Codex를 실행하는 환경의 `CODEX_HOME` 또는 Claude Code의 `CLAUDE_CONFIG_DIR`을 확인하십시오. 설치·설정·통계 명령에도 같은 환경을 전달해야 해당 계정 홈을 선택합니다.

기본 홈과 호스트가 사용하는 계정 홈은 다를 수 있습니다. 다른 홈의 정책·원장·키·신뢰 기록을 복사하지 마십시오. 경로 충돌이나 `existing_hook_not_owned`는 기존 등록을 검토할 때까지 보존하고 [문제 해결](troubleshooting.md)을 확인하십시오.

수동 MCP 설정이 필요한 경우 [고급 연동](advanced.md#guide-manual-mcp-setup)을 참고하십시오.

## 이 문서의 목차

- [설정 파일 위치](#guide-host-config-locations)
- [CLI로 설정하기](#guide-cli-configuration)
- [키와 재시작](#guide-keys-and-restart)
- [모델과 환경변수](#guide-models-and-environment)
- [Node 버전 변경에 강한 실행기](#guide-stable-launcher)

<a id="guide-host-config-locations"></a>

## 설정 파일 위치

| 호스트 | Aptly가 사용하는 사용자 등록 위치 |
|---|---|
| Codex | `$CODEX_HOME/config.toml`; `CODEX_HOME` 미지정 시 `~/.codex/config.toml` |
| Claude Code | `~/.claude.json`의 `mcpServers.aptly`; `CLAUDE_CONFIG_DIR` 지정 시 해당 디렉터리의 `.claude.json` |

Claude Code의 Hook 파일은 기본적으로 `~/.claude/settings.json`이며, `CLAUDE_CONFIG_DIR`을 지정하면 `$CLAUDE_CONFIG_DIR/settings.json`입니다. MCP 등록 파일과는 별개입니다. 프로젝트 `.mcp.json`·관리 설정·계정별 디렉터리를 사용한다면 수정하거나 등록하기 전에 `/mcp`에서 활성 항목을 확인하십시오.

<a id="guide-cli-configuration"></a>

## CLI로 설정하기

0.1.11부터 첫 일반 대화형 `aptly set default`는 클라이언트 홈별 검토 대상을 묶어 질문합니다. `excerpt`를 권장하며 Enter는 기존 범위를 유지하거나 미선택이면 `none`을 선택합니다. [전송 검토](transmission.md#guide-transmission-scope)를 참고하십시오. 이 재검토 흐름은 0.1.10에서 지원하지 않으므로 먼저 업데이트하십시오.

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

<a id="guide-stable-launcher"></a>

## Node 버전 변경에 강한 실행기

이 옵션은 0.1.13 이후 버전을 위한 개발 기능이며, 게시된 0.1.13 CLI에는 없습니다. POSIX(macOS·Linux)에서 `--launcher stable`을 명시하면 Node 버전 폴더 밖의 비공개 위치에 실행기와 Aptly의 런타임 의존성을 보존합니다. Node 바이너리는 복사하지 않으므로 지원되는 Node.js 24 이상 설치본이 필요합니다. 기존 Node와 원본 npm 패키지 폴더가 삭제돼도 보존된 실행기는 다른 지원 설치본을 찾을 수 있습니다. 단순한 `node` 명령은 GUI 호스트의 PATH에 없을 수 있어 같은 보장을 하지 않습니다.

기본 설치·자동 등록과 기존 등록은 계속 직접 Node 경로를 사용합니다. 새 등록에만 `aptly setup --client all --launcher stable`을 사용할 수 있습니다. 기존 등록은 아래처럼 먼저 점검한 후 명시적으로 전환하십시오. Claude는 `--client claude`를 사용하고, 계정별 Codex는 의도한 `CODEX_HOME` 환경에서 실행하십시오.

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

기존에 보존한 표준 실행기를 포함하려면 검토 후 `--include-existing`을 추가하십시오. 사용자 정의·수정된 실행기나 통계 Hook은 자동 채택하지 않습니다. 전환은 소유한 MCP와 통계 관찰자 경로를 함께 갱신하며 수집 여부·native 메타데이터 동의·키·정책·원장·통계 이력을 유지합니다. Codex의 새 Hook은 `/hooks`에서 다시 검토하고 승인하십시오.

실행기는 설치 시 Node, 표준 경로, 기본 `~/.nvm/versions/node`의 정식 버전, 안전한 절대 PATH 순으로 지원 런타임을 탐색합니다. 최신 Node의 자동 선택을 보장하지 않으며 심볼릭 링크나 shim을 쓰는 버전 관리자는 PATH에 있어도 거부될 수 있으며, 검증 가능한 실제 실행 파일 경로만 지원합니다. 셸 프로필·npm·네트워크 다운로드는 실행하지 않습니다. stable 모드는 흔한 Node 옵션 상속을 차단하기 위해 `NODE_OPTIONS`·`NODE_PATH`·`NODE_REPL_EXTERNAL_MODULE`을 상속하지 않습니다. CA 추가가 필요하면 기존 `NODE_EXTRA_CA_CERTS` 등 별도 인증서 설정을 사용하십시오. 네이티브 애드온이 필요한 런타임 묶음은 거부합니다. 런타임 부재/무결성 실패 시 MCP는 고정 오류로 중단하고 통계 관찰자는 기존 best-effort 계약대로 조용히 종료합니다.

이 기능은 일반 npm 전역 설치를 우선 지원합니다. 리다이렉트·쓰기 가능한 상위 경로와 외부로 hoist된 로컬 의존성 등 검증할 수 없는 소스는 거부합니다. Windows는 기존 직접 실행을 유지하며 stable 옵션은 지원하지 않습니다. stable 등록은 플래그 없는 후속 설정·마이그레이션에서도 유지됩니다. `aptly update`는 실제 npm 전역 CLI에서 실행하고, 새 Aptly 버전은 마이그레이션 명령으로 새 사본을 선택하십시오. 기존 사본은 다른 홈과 실행 중 프로세스가 사용할 수 있으므로 `remove`가 자동 삭제하지 않습니다. `doctor`의 사본 메타데이터 관측은 전체 실행·인증·재로딩 검증이 아닙니다.

일반 `setup`은 기존 사본을 자동 교체하지 않습니다. CLI보다 오래된 사본은 `stable_snapshot_outdated`와 명시적 마이그레이션 안내로 구분합니다. 소유권이 정확히 일치하는 기존 stable 등록은 사본이 유실·손상되거나 이전 실행기 형식이어도 새 CLI의 검증된 소스로 명시 전환할 수 있습니다. 같은 generation이 손상됐거나 미완료 lock이 남았다면 자동으로 덮어쓰거나 삭제하지 않습니다. 쓰기 프로세스와 다른 홈의 참조를 확인한 후 해당 상태만 수동 검토하십시오. 사용자 정의·변경된 등록의 소유권을 새로 채택하지 않습니다.

stable 전환은 소유 통계 Hook을 함께 갱신하지만 기존 직접 Node 런처 간 마이그레이션은 종전처럼 별도 통계 갱신이 필요할 수 있습니다(`statistics_observer_migration_required`). 설치·전환 시의 전체 사본 검증과 각 실행의 무결성 확인은 I/O 지연을 추가할 수 있으며, 런타임 탐색 제한이 전체 파일시스템의 벽시계 제한을 보장하지는 않습니다. 같은 사용자 권한의 프로그램이나 작업자 스레드를 격리하는 보안 sandbox는 아닙니다.

<a id="guide-keys-and-restart"></a>

## 키와 재시작

분류용 `OPENAI_API_KEY`를 안전한 환경이나 자격 주입 래퍼를 통해 MCP 프로세스에 전달하십시오. 호스트 구독 로그인과 별개입니다. 키 값을 명령 인자·요청·설정 파일·소스·로그·임시 파일에 기록하지 마십시오.

<a id="guide-models-and-environment"></a>

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

`aptly set default`는 기존 MCP `env`의 후보와 별칭, Codex `env_vars`의 전달 선언, Claude에서 현재 CLI가 확인할 수 있는 상속 후보를 보존합니다. 두 이름 모두 설정되지 않은 모델군에만 기본 후보를 추가합니다. Codex의 전달 변수는 현재 터미널에서 값을 확인할 수 없어도 기본값으로 대체하지 않으며, 상속값을 설정 파일에 복사하지 않습니다. CLI는 같은 이름의 정적 `env` 값을 우선하여 유효한 설정을 검증합니다. 기존 카탈로그 규칙에 따라 두 이름이 함께 전달되거나 값이 잘못되면 설정 변경을 거부합니다. 설정 후 재시작한 MCP의 최종 후보는 별도로 확인하십시오.

## 관련 문서

[설치·업데이트](installation.md) · [자동 추천](routing.md) · [Decisions API 전송 범위](transmission.md) · [고급 MCP 연동·개발 참고](advanced.md) · [문제 해결](troubleshooting.md)

[가이드 목차](../ko.md)
