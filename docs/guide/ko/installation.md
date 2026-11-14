# 설치·업데이트

[한국어](../ko/installation.md) · [English](../en/installation.md) · [简体中文](../zh-CN/installation.md) · [日本語](../ja/installation.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [설치](#guide-installation)
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

`set default`는 호스트를 등록하고 Decisions API에 보낼 정보의 범위를 묻습니다. 키는 숨김 입력으로 OS 자격 저장소에 보관합니다. 호스트를 재시작하고 Codex의 `/hooks`에서 새 Hook을 승인하십시오.

설치 스크립트는 기존 호스트 디렉터리에 MCP·Hook을 등록합니다. 디렉터리가 없으면 `aptly setup --client all`로 등록하십시오. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`을 쓰는 계정은 설치·설정에도 같은 환경을 전달해야 합니다. 기존 설정과 실행 래퍼는 보존합니다. [계정 홈·키 설정](configuration.md)을 참고하십시오.

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
aptly setup --client all
aptly --version
```

`update`는 같은 npm prefix에 최신 버전을 설치하며 설정·키를 보존합니다. 설치 스크립트는 실행하지 않습니다. 설정 후 호스트를 재시작하십시오. npm 오류나 로컬·소스 설치에서는 위 수동 설치 명령을 사용하십시오. `dry-run=true`인 npm 설정은 거절합니다.

stable 실행기의 보존 사본은 전역 패키지와 별개입니다. [명시적 마이그레이션](configuration.md#guide-stable-launcher)으로 갱신하십시오. 기존 Node 경로가 사라졌다면 [실행 경로 복구](troubleshooting.md#guide-launcher-recovery)를 따르십시오.

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
