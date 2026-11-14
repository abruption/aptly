# 초기 설정·모델 후보

[한국어](../ko/configuration.md) · [English](../en/configuration.md) · [简体中文](../zh-CN/configuration.md) · [日本語](../ja/configuration.md)

[가이드 목차](../ko.md)

## 목차

- [설정 파일 위치](#guide-host-config-locations)
- [CLI 설정](#guide-cli-configuration)
- [키와 재시작](#guide-keys-and-restart)
- [stable 실행기](#guide-stable-launcher)
- [모델 후보](#guide-models-and-environment)

<a id="guide-host-config-locations"></a>

## 설정 파일 위치

| 호스트 | 기본 위치 | 다른 계정 홈 |
|---|---|---|
| Codex | `~/.codex/config.toml` | `$CODEX_HOME/config.toml` |
| Claude Code | `~/.claude.json`의 `mcpServers.aptly` | `$CLAUDE_CONFIG_DIR/.claude.json` |

Claude Hook은 기본 `~/.claude/settings.json`, 다른 계정은 `$CLAUDE_CONFIG_DIR/settings.json`에 있습니다. 설치·설정·통계 명령에도 호스트와 같은 계정 환경을 전달하십시오. 다른 홈의 정책·원장·키·신뢰 기록을 복사하지 마십시오.

Codex MCP의 `@codex-home` 정책은 0.1.15부터 `CODEX_HOME`이 없으면 `~/.codex`를 선택합니다. 명시한 절대 경로가 우선하며 빈 값·상대 경로·제어 문자는 거절합니다. 사용자 지정 홈을 탐색하지 않으므로 관리자가 값을 전달하지 않으면 기본 홈의 정책·전송 범위가 적용됩니다. 수동·프로젝트·관리 등록은 [고급 설정](advanced.md#guide-manual-mcp-setup)을 참고하십시오.

<a id="guide-cli-configuration"></a>

## CLI 설정

```sh
aptly set default
aptly set env APTLY_CODEX_MODELS
aptly set env OPENAI_API_KEY
```

`set default`는 누락된 등록·기본값을 추가하고 [전송 범위](transmission.md)를 검토합니다. 기존 실행 명령·환경·provider·후보·advisory 정책은 보존합니다. `set env`는 숨김 입력을 받으며 지정한 변수만 변경합니다. 기본 대상은 두 호스트이고 `--client codex|claude|all`로 선택합니다.

```sh
aptly set env APTLY_CLAUDE_MODELS --client claude
```

후보 입력은 `["haiku","sonnet","opus"]` 같은 JSON 배열 문자열입니다. 자동화는 `--stdin`을 쓰십시오. 실제 키를 `printf`나 셸 기록에 넣지 마십시오.

```sh
printf '%s\n' '["gpt-6.1-terra"]' | aptly set env APTLY_CODEX_MODELS --stdin
```

일반 허용 키는 `ROUTER_PROVIDER`(`fixture`/`decisions`), `APTLY_CLAUDE_MODELS`, `APTLY_CODEX_MODELS`, 별칭 `CLAUDE_MODELS`·`CODEX_MODELS`, `APTLY_MODEL_INFO_PATH`입니다. 모델 캐시 경로는 비공개 디렉터리 안의 절대 경로여야 합니다. 관리용 원장·정책 경로는 이 명령으로 바꾸지 않습니다.

<a id="guide-keys-and-restart"></a>

## 키와 재시작

`aptly set env OPENAI_API_KEY`는 호스트별 키를 macOS Keychain·Linux `secret-tool`·Windows Credential Manager에 저장하고 MCP에는 저장소 참조만 등록합니다. 저장소가 없거나 잠기면 오류를 내며 평문 파일이나 다른 환경변수 키로 대체하지 않습니다. [자격 저장소 오류](troubleshooting.md)를 확인하십시오.

호스트 구독 로그인과 API 키는 별개입니다. 키를 명령 인자·설정 JSON·요청·저장소에 기록하지 마십시오. 안전한 MCP 실행 환경으로 직접 전달하는 방법은 [수동 설정](advanced.md#guide-key-environment)에 있습니다.

키 저장은 호환성이 확인된 표준 실행기에만 허용합니다. 사용자 지정 래퍼는 보존하지만 `credential_launcher_unverified`로 거절할 수 있습니다. `partial`이면 호스트별 오류를 확인하십시오. 저장 실패 시 이전 키를 복원하려고 하며 `credential_rollback_failed`면 OS 저장소에서 활성 키를 확인한 뒤 재시도해야 합니다. 여러 호스트의 변경이 하나의 원자적 작업은 아닙니다.

변경 후 MCP를 재시작하고 `get_routing_capabilities`의 후보·provider·`credential_status`를 확인하십시오. `os_store`는 키를 읽었다는 뜻이며 API 유효성 검증은 아닙니다. Codex의 `/hooks` 승인도 별도로 필요합니다.

<a id="guide-stable-launcher"></a>

## Node 버전 변경에 강한 실행기

기본 등록은 Node 절대 경로를 사용합니다. Node 버전을 자주 교체하는 macOS·Linux에서는 `stable`을 선택할 수 있습니다(0.1.14부터). Node 폴더 밖에 Aptly와 의존성을 보존하고 다른 지원 Node.js 24+를 탐색합니다. Node 자체는 포함하지 않으며 Windows는 지원하지 않습니다.

새 등록은 `aptly setup --client all --launcher stable`을 사용합니다. 기존 등록은 dry run을 확인한 뒤 전환하십시오. 다른 계정은 해당 홈 환경을 전달하고 Claude는 `--client claude`로 바꿉니다.

```sh
aptly setup --client codex --migrate-launcher --launcher stable --dry-run
aptly setup --client codex --migrate-launcher --launcher stable
```

전역 Aptly 업데이트 후에도 같은 명령으로 보존 사본을 갱신해야 합니다. 일반 `setup`은 사본을 교체하지 않으며 오래된 사본은 `stable_snapshot_outdated`로 알립니다. 전환은 소유한 MCP·통계 관찰자를 함께 갱신합니다. 수정된 실행기·Hook은 인수하지 않습니다. 보존된 표준 등록이 대상이면 검토 후 `--include-existing`을 추가하십시오. Codex의 변경된 Hook은 `/hooks`에서 다시 승인합니다.

<details>
<summary>실행기 제한과 복구</summary>

설치 Node → 표준 경로 → 기본 `~/.nvm/versions/node` → 안전한 절대 PATH 순으로 탐색합니다. 최신 버전 선택이나 사용자 지정 NVM_DIR·shim·심볼릭 링크 기반 관리자 지원을 보장하지 않습니다. 셸 프로필·npm·다운로드를 실행하지 않습니다. `NODE_OPTIONS`·`NODE_PATH`·`NODE_REPL_EXTERNAL_MODULE`은 제거하며 추가 CA는 `NODE_EXTRA_CA_CERTS` 등을 검토하십시오.

쓰기 가능한 조상 경로·외부로 hoist된 의존성·네이티브 애드온 등 검증할 수 없는 소스는 거절합니다. 무결성 확인은 I/O 비용을 추가하며 탐색 예산은 전체 파일 I/O의 hard timeout이 아닙니다. sandbox나 배포자 서명 인증은 아닙니다. MCP는 실패 시 오류로 중단하고 통계 관찰자는 조용히 종료합니다.

소유권이 일치하면 유실·손상·이전 형식 사본에서 새 CLI 소스로 명시 전환할 수 있습니다. 손상된 동일 세대·미완료 lock은 자동으로 덮어쓰거나 삭제하지 않습니다. 다른 홈·프로세스가 참조할 수 있어 이전 사본도 자동 삭제하지 않습니다. 쓰기 프로세스와 참조를 확인한 뒤 상태를 검토하십시오. 직접 Node 실행기끼리의 전환은 별도 통계 갱신(`statistics_observer_migration_required`)이 필요할 수 있습니다.

</details>

<a id="guide-models-and-environment"></a>

## 모델과 환경변수

등급은 작업 프리셋이며 제공사 간 모델 성능이 동급이라는 뜻은 아닙니다.

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

`set default`는 기존 후보·별칭·전달 선언을 보존하고 없는 모델군에만 기본값을 추가합니다. Codex의 상속 후보가 현재 CLI에 보이지 않아도 덮어쓰지 않습니다. 최종 후보는 MCP 재시작 후 확인하십시오.

[설치](installation.md) · [문제 해결](troubleshooting.md) · [가이드 목차](../ko.md)
