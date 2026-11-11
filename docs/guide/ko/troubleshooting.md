# 문제 해결

[한국어](../ko/troubleshooting.md) · [English](../en/troubleshooting.md) · [简体中文](../zh-CN/troubleshooting.md) · [日本語](../ja/troubleshooting.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [계정 홈과 Hook 등록 확인](#guide-account-home-recovery)
- [실행 경로 오류 복구](#guide-launcher-recovery)
- [중단된 프로세스와 원장 잠금](#guide-ledger-lock-recovery)

<a id="guide-account-home-recovery"></a>

## 계정 홈과 Hook 등록 확인

Codex를 실행하는 환경의 `CODEX_HOME`과 CLI가 선택한 홈이 같은지 먼저 확인하십시오. `config.toml`의 정책 경로만 바꿔도 해당 경로의 정책 파일이나 소유권 기록이 생성되지는 않습니다. 다음 조회는 키나 상태를 초기화하지 않습니다.

```sh
aptly setup --check --client codex
aptly stats --client codex
```

| 표시 | 확인할 사항 |
|---|---|
| `hook_policy_path_conflict` / `statistics_policy_conflict` | 선택한 계정 홈과 MCP의 정책 참조, 실제 정책 파일 위치를 대조하십시오. 다른 홈의 상태를 복사하거나 기존 참조를 임의로 덮어쓰지 마십시오. |
| `statistics_requires_setup` | 선택한 홈의 MCP 등록·정책 파일과 setup 기록을 확인하십시오. 먼저 해당 홈에서 정상 setup이 가능한지 점검해야 합니다. |
| `existing_hook_not_owned` | 기존 Aptly Hook은 있지만 유효한 설치 소유권 기록이 없습니다. 기존 정의를 백업·검토한 뒤 명시적으로 복구해야 하며, 기록을 편집하거나 다른 홈에서 복사해 검사를 우회하지 마십시오. |

설정 점검이 성공한 뒤 [통계 활성화](statistics.md)를 진행하십시오. `collection.codex: true`는 수집 설정이며 실행 중 호스트가 Hook을 로드·신뢰했다는 증명은 아닙니다. 올바른 계정의 Codex를 재시작하고 `/hooks`에서 실제 항목을 검토하십시오.

### 관리형 계정에서 정책 경로가 다시 바뀌는 경우

0.1.11에 포함될 기능입니다. Orca처럼 기본 홈의 같은 이름 MCP 등록을 계정 홈으로 동기화하는 관리자는 계정에만 수정한 절대 정책 경로를 다시 덮어쓸 수 있습니다. Hook이 남아 있어도 MCP와 통계가 서로 다른 정책을 참조할 수 있습니다.

모든 등록된 Aptly 서버를 새 버전으로 갱신하고 관련 호스트·MCP를 종료한 뒤, 정상 소유권이 있는 기존 Codex 설정에 다음 명시적 전환을 적용하십시오. 먼저 기본/정본 등록이 있는 홈에서 실행하고, 이후 의도한 각 계정의 `CODEX_HOME`을 선택한 환경에서 반복하십시오. 계정 파일만 변경하면 관리자의 동기화로 되돌아갈 수 있습니다.

```sh
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home --dry-run
CODEX_HOME="$HOME/.codex" aptly setup --client codex --policy-source codex-home
CODEX_HOME="$HOME/.codex" aptly setup --check --client codex
CODEX_HOME="$HOME/.codex" aptly stats --client codex
```

전환은 `APTLY_HOOK_POLICY_PATH = "@codex-home"`과 `env_vars`의 `CODEX_HOME` 전달을 등록합니다. 서버 시작 시 전달된 홈의 `aptly/auto-policy.json`을 선택합니다. 변수가 없거나 비어 있거나 상대 경로이면 다른 홈으로 대체하지 않고 거부합니다. MCP 시작 시에는 기본 홈도 `CODEX_HOME="$HOME/.codex"`를 전달해야 합니다. 0.1.11 CLI에서 변수가 없는 일반 터미널의 setup이 `policy_source_home_invalid`로 실패하면 위 예시처럼 기본 홈을 명시하십시오. 0.1.12 CLI 수정에서는 변수가 없을 때 이미 선택한 표준 `~/.codex`를 검증에 사용합니다. 명시한 계정 홈과 잘못된 값의 거부는 유지합니다. 위 예시는 기본 홈용이며 각 계정에서는 해당 계정의 절대 홈 경로로 바꾸십시오. 이는 운영자가 지정한 경로 선택이며 호스트 전체 설정을 인증하는 증거가 아닙니다. [Codex MCP 환경변수 전달](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers)을 참고하십시오.

전환은 정책 내용·전송 동의·원장 경로·통계 이력·Hook 신뢰를 이동하거나 초기화하지 않습니다. 기존 고정/공유 정책은 명시적으로 전환하지 않으면 유지됩니다. 사용자 정의 실행기, 다른 등록 변경, 소유권 불일치는 자동 복구하지 않습니다. 오류 시 기록을 편집하거나 복사하지 말고 등록을 검토하십시오. 서버를 다시 시작한 뒤 선택한 계정에서 다시 조회하십시오. 성공한 미리보기나 파일 검사는 실행 중 MCP의 갱신 또는 모델 관측을 증명하지 않습니다.

<a id="guide-launcher-recovery"></a>

## 실행 경로 오류 복구

아래 옵션은 Aptly 0.1.2부터 지원하며 npm 0.1.1에는 없습니다. 소스에서 시험하려면 `npm ci --ignore-scripts`와 `npm run build` 후 `aptly` 대신 `node bin/aptly.ts`를 사용합니다.

키 설정은 입력·저장 전에 선택한 호스트를 진단합니다. 하나라도 실패하면 입력을 받지 않고 모든 호스트를 그대로 둡니다. `--check`는 키나 자격 저장소에 접근하지 않습니다.

Aptly 0.1.9부터 Linux에서 `--check`는 실행 가능한 `secret-tool`도 확인하고, 안전한 명시적 세션 버스 주소와 `gdbus`가 있으면 자격 증명 서비스를 활성화하거나 접근하지 않고 버스 메타데이터를 읽습니다. 확실한 실패는 입력 전에 `secure_store_unavailable`과 함께 `secure_store_secret_tool_missing`, `secure_store_bus_missing`, `secure_store_service_missing` 중 하나로 알립니다. `secure_store_bus_unverified`, `secure_store_probe_unavailable` 및 서비스 존재·활성화 가능 미확인 코드는 준비 상태를 알 수 없다는 뜻이며, 서비스가 실행 중이거나 활성화 가능해도 잠금 해제 또는 쓰기 가능을 보장하지 않습니다. 필요한 경우 `secret-tool`과 Secret Service 제공자를 설치하고 사용할 데스크톱 세션에서 실행하십시오. 실제 저장은 여전히 실패할 수 있습니다. SSH 또는 헤드리스 세션에서는 `APTLY_SECRET_BACKEND`가 없는 경우 호스트 MCP 프로세스에 `OPENAI_API_KEY`를 안전하게 전달하십시오. 기존 인증 래퍼나 환경은 보존하십시오. `credential_node_mismatch`, `credential_server_mismatch`, `credential_runtime_unsupported`는 각각 Node 경로, 서버 경로, OS 저장소 지원의 불일치입니다.

Claude만 실패했다면 다음 순서로 진단하고, `launcher_migration_available`일 때만 이전을 검토하십시오:

```sh
aptly set env OPENAI_API_KEY --client claude --check
aptly setup --client claude --migrate-launcher --dry-run
aptly setup --client claude --migrate-launcher
aptly set env OPENAI_API_KEY --client claude
```

`--dry-run`은 변경하지 않습니다. 이전 명령은 소유 기록과 일치하는 Aptly 표준 등록의 Node·서버 경로를 현재 빌드로 바꿉니다. 기존 환경·Hook·정책·다른 호스트는 보존하며 키를 읽거나 저장하지 않습니다. 오래된 실행 파일을 실행하지 않습니다. 사용자 래퍼, 소유 기록이 없거나 수정된 등록은 거절합니다. 이 경우 로컬에서 등록을 검토하고 래퍼의 안전한 환경 전달을 사용하거나 별도로 검토한 표준 등록으로 전환하십시오. 소유 기록을 삭제하거나 편집해 검증을 우회하지 마십시오.

Aptly 0.1.9부터 `aptly setup --check --client codex|claude|all`은 일반 설정 계획을 읽기만 하며 파일이나 디렉터리를 만들지 않습니다. 실행 중인 호스트를 검증하지 않는 시점별 확인입니다. `--check`에는 `--client`만 함께 사용할 수 있습니다. `hook_policy_path_conflict`가 나타나면 선택된 호스트 설정 디렉터리와 기존 정책 참조를 로컬에서 확인하고, 의도한 호스트 디렉터리를 선택한 뒤 다시 시도하십시오. 설정은 기존 구성을 보존하며 정책을 이동하거나 복사하지 않습니다. 실행기 이전으로 이 불일치를 해결할 수는 없습니다.

`launcher_migration_not_owned`가 나오고 기존 등록을 보존한 상태(`mcp_created: false`)라면, **Aptly 0.1.3부터** `--include-existing`으로 명시적으로 이전할 수 있습니다. 0.1.3 이상을 설치한 뒤 다음 명령을 실행하십시오:

```sh
aptly setup --client claude --migrate-launcher --include-existing --dry-run
aptly setup --client claude --migrate-launcher --include-existing
```

실행 전에 로컬 등록을 검토하십시오. 유효한 기존 Aptly 소유 기록과 일치하는 관리 환경변수·Hook·정책이 필요하며, 절대 Node 경로와 단일 표준 서버 경로만 허용합니다. 사용자 래퍼나 기록이 없는 등록은 이 옵션으로도 이전하지 않습니다. 기존 MCP 전체를 Aptly 소유로 바꾸지 않으므로, 이후 `remove`도 이전한 MCP 실행 경로와 원래 사용자 설정을 보존합니다. 이 옵션은 단일 호스트의 명시적 이전에만 사용할 수 있고 자동 설치에는 적용되지 않습니다.

이미 성공한 Codex는 재설정할 필요가 없습니다. 실패한 호스트만 지정해 재시도하고 MCP를 재시작하십시오. Codex를 대상으로 하면 `/hooks` 신뢰 검토가 계속 필요합니다. 진단 이후 설정 변경은 `concurrent_configuration_change`로 중단합니다. 저장 실패 후 다른 키가 관찰되거나 현재 키를 읽지 못하면 덮어쓰지 않고 `credential_rollback_failed`를 반환합니다. 파일과 OS 저장소 사이의 원자적 트랜잭션은 아니므로 다른 설정 작업을 동시에 실행하지 마십시오.

<a id="guide-ledger-lock-recovery"></a>

## 중단된 프로세스와 원장 잠금

이 잠금 방식은 Aptly `0.1.2`부터 지원하며 npm `0.1.1`에는 없습니다. JSON 원장의 요청 ID·`unknown`·완료 캐시·호출 수·비용 예약 형식은 유지합니다. 영속 원장에만 Node.js 24 내장 SQLite를 사용하며, 원장 옆의 `ledger.json.lock`은 정상 종료 후에도 남는 잠금 파일입니다. 파일이 있다는 사실만으로 활성 잠금을 뜻하지 않습니다. 새 방식에서는 프로세스 종료 시 OS 잠금이 해제되므로 후속 요청이 같은 원장을 다시 사용할 수 있습니다. 결과가 불명확했던 기존 ID를 재호출하거나 예약 비용을 되돌리지는 않습니다.

원장과 잠금 파일은 하드 링크를 지원하는 로컬 파일시스템의 비공개 디렉터리에 두고, 하나의 원장을 동일한 정규 경로로 사용하십시오. 네트워크 공유·클라우드 동기화 디렉터리·경로 별칭은 지원 범위가 아닙니다. 새 잠금 파일과 SQLite journal을 삭제·교체하거나, 사용 중 다른 DB 도구로 열지 마십시오. 잠금 파일의 나이와 PID만으로 소유자가 종료됐다고 판단하지 않습니다.

이전 버전의 빈 `.lock` 파일은 살아 있는 소유자가 있는지 확인할 수 없어 자동으로 초기화하거나 제거하지 않습니다. 구버전을 포함한 모든 관련 호스트·MCP·원장 접근 프로세스를 정지하고, 모든 writer를 새 버전으로 전환하십시오. 파일이 기존 방식의 잠금임을 확인한 경우에만 그 파일을 별도로 격리한 뒤 같은 JSON 원장 경로로 다시 시작합니다. 원장·`unknown`·비용·완료 결과는 초기화하거나 삭제하지 마십시오. 소유자나 형식을 확신할 수 없으면 차단 상태를 유지하고 조사하십시오.

진단 보고서는 [고급 참고의 진단·개발 절](advanced.md#guide-diagnostics-and-development)에서 확인하십시오.

## 관련 문서

[초기 설정·모델 후보](configuration.md) · [설치·업데이트](installation.md) · [고급 MCP 연동·개발 참고](advanced.md)

[가이드 목차](../ko.md)
