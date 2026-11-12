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

Node.js 24 이상과 Claude Code 또는 Codex가 필요합니다. npm의 최신 안정 버전을 전역 설치하려면 다음 명령을 사용하십시오:

**기존 영속 원장을 0.1.2 이상으로 업그레이드하기 전에**, 해당 원장을 사용하는 모든 호스트·MCP 서버·별도 CLI와 구버전 프로세스를 정지하십시오. 새 영구 잠금은 구버전 writer와 함께 사용할 수 없습니다. 새 설치에는 기존 잠금 격리가 필요하지 않습니다. 이전 빈 잠금이 남았다면 [원장 잠금 전환 절차](troubleshooting.md#guide-ledger-lock-recovery)를 따라 확인된 기존 잠금만 오프라인으로 격리하고, JSON 원장·`unknown`·비용·완료 캐시는 보존하십시오.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly --version
```

`aptly --version`으로 설치된 버전을 확인하십시오. Node.js 환경을 바꾸면 재설치가 필요할 수 있습니다.

`postinstall`은 현재 사용자의 기존 호스트 설정 디렉터리에 MCP와 `PreToolUse` Hook을 등록합니다. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`을 사용한다면 설치 프로세스에도 같은 환경을 전달하십시오. 아직 없는 호스트 디렉터리는 자동 등록에서 건너뛰고, 명시적인 `setup`으로 만들 수 있습니다. 필요한 호스트만 등록하려면 `--client codex` 또는 `--client claude`를 사용하십시오.

새 등록은 `ROUTER_PROVIDER=decisions`, Hook `defaults` 정책과 호스트별 비공개 원장을 지정합니다. 기존 다른 설정·Hook, 기존 Aptly의 실행 명령·환경·분류 방식·원장 경로는 보존합니다. 기존 fixture 설정을 자동으로 유료 모드로 바꾸지 않습니다.

<a id="guide-npm-install-scripts"></a>

## npm 설치 스크립트 허용

위 설치 명령의 `--allow-scripts=aptly`는 해당 설치에서 Aptly의 `postinstall`을 명시적으로 허용합니다. npm 11.19.1에서 지원을 확인했으며, 사용자 전체의 npm 허용 설정은 변경하지 않습니다. [npm 공식 안내](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/#allow-scripts)를 참고하십시오.

`npm warn install-scripts ... not yet covered by allowScripts`는 허용 정책에 아직 등록되지 않았다는 안내입니다. npm 11.19.1에서는 이 경고만으로 스크립트가 차단됐다고 판단할 수 없습니다. npm 버전·엄격 정책·`ignore-scripts`에 따라 동작이 달라지며, 설치 성공만으로 MCP·Hook 등록 성공을 확인할 수는 없습니다. `postinstall`은 npm 출력에 표시되지 않을 수도 있습니다.

옵션을 지원하지 않는 npm이거나 자동 등록 대신 직접 설정하려면 다음 명령을 사용하십시오:

```sh
npm install -g aptly@latest --ignore-scripts
aptly setup --client all
```

전송 검토는 0.1.11부터 제공하며, npm lifecycle 설치에서는 질문하지 않습니다. 0.1.10에서 업그레이드하는 경우 먼저 패키지를 업데이트한 뒤 같은 계정 환경에서 대화형 `aptly setup`, `aptly set default` 또는 `aptly set transmission --review`를 실행하십시오. 업데이트 프로세스가 새 검토를 대신 실행하거나 동의한 것으로 처리하지 않습니다. [전송 검토](transmission.md#guide-transmission-scope)를 참고하십시오.

명시적 `setup`은 설치 스크립트 실행 여부와 관계없이 사용할 수 있습니다. 기존 실행 경로는 보존하므로 구버전 경로 오류는 [실행 경로 복구 절차](troubleshooting.md#guide-launcher-recovery)를 따르십시오. 키 설정·MCP 재시작과 Codex의 `/hooks` 신뢰 승인은 별도로 필요합니다.

0.1.11 이상 설치 스크립트는 설정이 정상 완료되고 등록된 클라이언트에 검토가 대기 중이면 `aptly set transmission --review` 실행 안내만 stderr로 표시하며 질문하거나 선택을 기록하지 않습니다.

<a id="guide-package-updates"></a>

## 패키지 업데이트

`aptly update`는 **Aptly 0.1.3부터 지원합니다**. 검증된 전역 npm 설치에서만 현재 실행 중인 패키지와 동일한 prefix의 `aptly@latest`를 설치합니다. 로컬 설치·소스 체크아웃·확인할 수 없는 경로는 거절합니다. npm의 유효 설정에서 `dry-run=true`이면 실제 설치를 시작하기 전에 `update_dry_run_enabled`로 거절합니다. 설정을 확인할 수 없으면 `update_configuration_unverified`로 중단합니다. 시험 실행을 업데이트 성공으로 보고하지 않습니다.

업데이트 전에 위 원장 전환 절차에 따라 다른 호스트·MCP·CLI 프로세스를 중지하십시오. 명령은 설치 스크립트를 실행하지 않으므로 업데이트 후 명시적으로 설정하고 호스트를 재시작하십시오:

```sh
aptly update
aptly setup --client all
aptly --version
```

기존 MCP 실행 경로와 사용자 래퍼를 자동으로 전환하지 않습니다. 이전 경로가 남으면 [실행 경로 복구 안내](troubleshooting.md#guide-launcher-recovery)를 따르십시오. 키 설정과 Codex의 `/hooks` 신뢰 검토는 별도 단계입니다. npm 인증·네트워크·권한 오류로 실패하면 수동 설치 안내를 사용하십시오. 자동 업데이트는 수행하지 않습니다.

<a id="guide-version-notifications"></a>

## 새 버전 알림

**Aptly 0.1.3부터** 일반 CLI의 대화형 실행에서 최신 안정 버전을 확인하고, 더 새 버전이 있으면 stderr에 `aptly update`를 안내합니다. stdin·stdout·stderr가 모두 터미널일 때만 동작하며, MCP 서버·자동 setup·추천/분류 경로·파이프·CI에서는 확인하지 않습니다. 기존 JSON stdout과 MCP·Hook 응답은 유지합니다.

공개 npm 레지스트리의 Aptly 버전 메타데이터만 조회하며 키·작업 요약·호스트 설정은 보내지 않습니다. 네트워크와 응답 읽기는 최대 800ms·16KiB로 제한하고, 결과는 `~/.cache/aptly/update-check.json`에 24시간 캐시합니다. 실패 후에는 1시간 대기하며, 조회·캐시 오류로 원래 명령을 실패시키지 않습니다. 버전 조회를 끄려면 CLI 실행 환경에 `APTLY_NO_UPDATE_NOTIFIER=1`을 설정하십시오. 이 변수는 MCP 키 설정용 `aptly set env`의 지원 대상이 아닙니다. 알림은 업데이트를 설치하지 않습니다.

<a id="guide-command-help"></a>

## 명령 도움말 (0.1.8부터)

명령·하위 명령별 통일된 도움말은 Aptly 0.1.8부터 지원합니다. 다음 형식을 사용할 수 있습니다.

```sh
aptly --help
aptly setup -h
aptly set default --help
aptly set env OPENAI_API_KEY --help
aptly budget status --help
aptly help catalog refresh
```

`--help`·`-h` 또는 `aptly help <명령 경로>`는 사용법만 표시합니다. 설정·지정 파일·stdin·자격 저장소를 읽거나 질문·설정 변경·API/모델 정보 조회·설치/업데이트·업데이트 알림을 실행하지 않습니다. 유효한 옵션 뒤에도 도움말을 붙일 수 있지만 잘못된 경로·옵션·제공된 값과 모순된 옵션 조합은 오류입니다. 필수 위치 인자를 생략해 사용법을 조회할 수 있습니다. `--output --help`처럼 도움말을 옵션 값 자리에 놓으면 값 누락 오류로 처리합니다.

<a id="guide-skip-and-remove"></a>

## 건너뛰기·제거

```sh
APTLY_SKIP_SETUP=1 npm install -g aptly@latest
aptly setup --client codex --mode defaults
aptly remove --client all
```

`CI`나 npm `--ignore-scripts`도 등록을 건너뜁니다. 이후 `setup`으로 등록하십시오. 모드를 바꾸려면 등록을 제거하고 원하는 `--mode`로 다시 설정하십시오. `advisory`는 추천만 전달합니다. `partial`이면 호스트별 오류 코드를 확인하십시오. 제거 시 사용자 변경 항목은 보존하고 충돌을 알립니다.

## 관련 문서

[초기 설정·모델 후보](configuration.md) · [문제 해결](troubleshooting.md)

[가이드 목차](../ko.md)
