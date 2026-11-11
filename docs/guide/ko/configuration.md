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

## 관련 문서

[설치·업데이트](installation.md) · [자동 추천](routing.md) · [Decisions API 전송 범위](transmission.md) · [고급 MCP 연동·개발 참고](advanced.md) · [문제 해결](troubleshooting.md)

[가이드 목차](../ko.md)
