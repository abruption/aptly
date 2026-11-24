# 설치·업데이트

**한국어** · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [설치](#guide-installation)
- [설정 확인](#guide-verify-setup)
- [Windows PowerShell](#guide-windows-powershell)
- [npm 설치 스크립트 허용](#guide-npm-install-scripts)
- [패키지 업데이트](#guide-package-updates)
- [새 버전 알림](#guide-version-notifications)
- [명령 도움말 (0.1.8부터)](#guide-command-help)
- [건너뛰기·제거](#guide-skip-and-remove)

<a id="guide-installation"></a>

## 설치

Node.js 24 이상, Claude Code 또는 Codex, OpenAI API 키가 필요합니다.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
aptly --version
```

`set default`는 호스트를 등록하고 Decisions API에 보낼 정보의 범위를 묻습니다. API 키는 입력할 때 화면에 표시되지 않으며, OS 자격 증명 저장소에 저장됩니다. 설정을 마치면 호스트를 재시작하십시오. Codex에서는 `/hooks`에서 새 Hook을 승인하십시오.

설치 스크립트는 이미 있는 호스트 디렉터리에 MCP와 Hook을 등록합니다. 디렉터리가 없으면 `aptly setup --client all`로 등록하십시오.

`CODEX_HOME`이나 `CLAUDE_CONFIG_DIR`을 사용한다면 설치와 설정 명령을 실행할 때 같은 값을 지정하십시오. Aptly는 기존 설정과 실행 래퍼를 그대로 둡니다. [계정 홈·키 설정](configuration.md)을 참고하십시오.

<a id="guide-verify-setup"></a>

## 설정 확인

다음 명령으로 선택한 호스트의 설정 계획과 키 등록 준비 상태를 점검하십시오. Claude Code는 `codex`를 `claude`로 바꾸십시오. Windows PowerShell에서는 `aptly.cmd`를 사용하십시오.

```sh
aptly setup --check --client codex
aptly set env OPENAI_API_KEY --client codex --check
```

두 명령은 파일을 변경하지 않습니다. `setup --check`는 일반 설정 계획을 실행 시점에 점검하는 명령이며 실행 중인 호스트를 확인하지 않습니다. 키의 `--check`는 등록과 Linux 저장소 준비 상태를 점검하지만 키를 읽거나 저장하지 않고 API 인증도 검증하지 않습니다. 종료 코드 `0`은 점검에 오류가 없다는 뜻이고 `1`은 부분 실패 또는 명령 오류입니다. JSON 출력에서 호스트별 `status`와 `codes`를 확인하십시오.

설정 후 호스트와 MCP를 재시작하고 Codex에서는 `/hooks`에서 Hook을 검토·신뢰하십시오. [추천과 Hook 인자 변경 관찰](routing.md#guide-automatic-routing)은 구분되며, 어느 쪽도 자식 실행이나 완료를 증명하지 않습니다. 실제 실행과 완료는 호스트에서 별도로 확인하십시오. [문제 해결](troubleshooting.md)을 참고하십시오.

<a id="guide-windows-powershell"></a>

## Windows PowerShell

로그인한 Windows 데스크톱에서 PowerShell을 열고 다음 명령을 실행하십시오. 예제에서는 `npm.cmd`와 `aptly.cmd`를 직접 실행합니다. `--ignore-scripts`를 쓰면 설치 중 자동 등록을 건너뛰므로 `set default`로 등록하십시오.

```powershell
npm.cmd install -g aptly@latest --ignore-scripts
aptly.cmd --version
aptly.cmd set default --client codex
aptly.cmd set env OPENAI_API_KEY --client codex
```

Claude Code를 설정하려면 두 설정 명령의 `codex`를 `claude`로 바꾸십시오. 호스트를 재시작한 뒤 Codex에서는 `/hooks`를 열어 새 Aptly Hook을 승인하십시오.

`--prefix`로 설치 위치를 지정했다면 업데이트할 때도 같은 위치를 지정하십시오. PowerShell에서 `aptly.cmd`를 찾지 못하면 그 위치에 있는 `aptly.cmd`의 전체 경로로 실행하십시오.

API 키는 Windows 자격 증명 관리자에 저장됩니다. SSH에서 저장소를 사용할 수 없다는 오류가 나오면 로그인한 데스크톱에서 키를 등록하십시오. 호스트에 MCP가 표시돼도 키를 읽었거나 Decisions API가 응답했다는 뜻은 아닙니다. 키 등록에 실패하면 [자격 증명 오류 안내](troubleshooting.md#guide-launcher-recovery)를 참고하십시오.

<a id="guide-npm-install-scripts"></a>

## npm 설치 스크립트 허용

`--allow-scripts=aptly`는 해당 설치의 `postinstall`만 허용하며 npm 전체 설정을 바꾸지 않습니다(npm 11.19.1에서 확인). 옵션을 지원하지 않거나 자동 등록을 원하지 않으면 다음을 실행하십시오.

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

설치 성공이나 `npm warn install-scripts`만으로 Hook 등록 여부를 판단하지 마십시오. npm 버전·정책에 따라 설치 스크립트가 생략될 수 있습니다. [npm 안내](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)

설치 스크립트는 전송 동의를 받지 않습니다. 이후 대화형 `aptly setup`, `aptly set default` 또는 `aptly set transmission --review`에서 [전송 범위](transmission.md)를 선택하십시오.

<a id="guide-package-updates"></a>

## 패키지 업데이트

관련 호스트·MCP·CLI를 중지한 뒤 검증된 전역 npm 설치에서 실행하십시오.

```sh
aptly update
aptly --version
```

`update`는 설치 스크립트 없이 같은 npm prefix의 패키지를 업데이트합니다. macOS·Linux에서는 새 CLI가 현재 환경에서 선택된 설정 홈의 변경되지 않은 Aptly 소유 Codex·Claude Code 등록을 관리형 npx로 전환을 시도합니다. direct와 stable 등록이 대상이며 사용자 지정·비관리 등록과 미등록 호스트는 그대로 둡니다. 패키지 업데이트와 호스트별 전환 결과를 각각 확인하십시오. 한 호스트가 성공해도 다른 호스트는 실패할 수 있습니다. Windows에서는 패키지만 업데이트합니다.

0.1.21에서는 첫 실행에서 패키지만 업데이트합니다. 설치된 새 CLI로 `aptly update`를 다시 실행하면 기존 등록의 전환을 시도합니다. 기존 등록에 `setup`은 필요하지 않습니다. 새 등록에는 `aptly setup`을 사용할 수 있습니다. 소유권 확인 범위에서 Hook·자격 정보와 전송 범위를 보존합니다. 변경된 Codex Hook은 `/hooks`에서 다시 승인하고 호스트를 재시작하십시오. 전송 범위는 [전송 안내](transmission.md)에서 확인하고 필요하면 명시적으로 선택하십시오.

npm 오류나 로컬·소스 설치에서는 위 수동 설치 명령을 사용하십시오. `dry-run=true`인 npm 설정은 거절합니다. 기존 Node 경로가 사라졌다면 [실행 경로 복구](troubleshooting.md#guide-launcher-recovery)를 따르십시오.

<details>
<summary>0.1.2 이전 원장에서 업그레이드</summary>

같은 원장을 사용하는 구버전 호스트·MCP·CLI writer를 모두 중지하십시오. 새 영구 잠금은 구버전 writer와 함께 쓸 수 없습니다. 이전 빈 잠금은 [원장 잠금 전환](troubleshooting.md#guide-ledger-lock-recovery)에 따라 오프라인으로 격리하고, JSON 원장·unknown·비용·완료 캐시는 보존하십시오.

</details>

<a id="guide-version-notifications"></a>

## 새 버전 알림

대화형 CLI는 최신 버전을 확인해 stderr로 알립니다. 자동 업데이트는 하지 않습니다. MCP·Hook·파이프·CI에서는 확인하지 않습니다. 공개 npm 버전 정보만 조회하고 작업·키·설정은 보내지 않습니다. 결과를 24시간 캐시하며 오류가 원래 명령을 실패시키지 않습니다. 끄려면 실행 환경에 `APTLY_NO_UPDATE_NOTIFIER=1`을 설정하십시오(`set env` 대상이 아님).

<a id="guide-command-help"></a>

## 명령 도움말

```sh
aptly --help
aptly setup -h
aptly set env OPENAI_API_KEY --help
aptly help catalog refresh
```

`--help`·`-h`·`aptly help <명령 경로>`는 사용법만 표시하며 설정·키 조회나 API 호출을 하지 않습니다. 잘못된 옵션이나 옵션 값 누락은 오류입니다.

<a id="guide-skip-and-remove"></a>

## 건너뛰기·제거

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI`·`--ignore-scripts`도 자동 등록을 건너뜁니다. `remove`는 변경되지 않은 Aptly 소유 항목만 제거하며 사용자 변경은 보존합니다. `partial`이면 호스트별 오류를 확인하십시오. 모드를 바꾸려면 제거 후 원하는 `--mode`로 등록하십시오. `advisory`도 전송 범위가 허용하면 작업 정보를 전송합니다.

[설정](configuration.md) · [문제 해결](troubleshooting.md) · [가이드 목차](../ko.md)
