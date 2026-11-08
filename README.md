<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

**한국어** · [English](README.en.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**작업에 맞는 Claude Code·Codex 서브에이전트 모델과 effort를 선택하는 로컬 MCP입니다.**

</div>

Aptly는 최소한의 작업 요약을 OpenAI Decisions API로 분류하고 허용된 실행 프로필을 추천합니다. 설치한 Hook은 명시 선택이 없는 새 일반 서브에이전트의 기본값을 자동으로 선택할 수 있습니다. 실제 실행과 권한 결정은 기존 호스트가 담당합니다.

자체 테스트에서 **API 환산 비용이 약 52~58% 감소했습니다**. [측정 조건과 상세 결과](docs/guide/ko.md#비용-실측)를 확인하세요.

## 빠른 시작

Node.js **24 이상**과 Claude Code 또는 Codex가 필요합니다. 처음 설치할 때는 다음 명령으로 최신 안정 버전을 전역 설치하고 설정하십시오.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
aptly --version
```

`aptly --version`으로 설치된 버전을 확인하십시오. `--allow-scripts=aptly`는 지원하는 npm에서 Aptly의 설치 스크립트를 허용합니다. 이 옵션을 지원하지 않는 npm은 [설치 안내](docs/guide/ko.md#설치)의 명시적 설치·설정 절차를 따르십시오. 다음 릴리스 후보에서는 신규 등록의 자동 전송을 보류하며 `aptly set default`에서 OpenAI Decisions API 전송 범위를 선택합니다.

설치 시 `postinstall`은 기존 호스트 설정 디렉터리에 MCP와 `PreToolUse` Hook을 등록합니다. 명시적인 `setup`은 자동 등록을 건너뛰었거나 아직 설정 디렉터리가 없는 호스트에도 사용할 수 있습니다. 기존 다른 설정·Hook과 기존 Aptly 실행 명령·환경은 보존합니다.

분류용 `OPENAI_API_KEY`는 `aptly set env OPENAI_API_KEY`의 숨김 입력으로 OS 자격 저장소에 보관하거나 안전한 실행 환경에서 MCP 프로세스에 전달하십시오. 키를 명령행·요청·설정 JSON·저장소에 기록하지 마십시오. 호스트 또는 MCP를 재시작한 뒤, **Codex에서는 `/hooks`에서 새 Hook을 검토하고 신뢰를 승인하십시오.** [설치·키·등록 상세](docs/guide/ko.md#설치)를 참고하십시오.

## 업데이트

기존 전역 npm 설치의 Aptly 0.1.3 이상을 업데이트하려면 관련 호스트·MCP·CLI 쓰기 프로세스를 모두 중지하고 [설치·업그레이드 안내](docs/guide/ko.md#설치)의 원장 전환 및 수동 대체 절차를 확인하십시오. 기존 키 설정은 유지하므로 다시 입력할 필요가 없습니다. 명령 실행 후 재시작하십시오.

```sh
aptly update
aptly setup --client all --mode defaults
```

## 사용 방식

| 방식 | 동작 |
|---|---|
| 자동 Hook | 새 호출의 제약을 검사하고 미지정 기본값을 추천합니다 |
| 직접 추천 | `recommend_agent` 또는 `aptly recommend`로 프로필을 받고 호스트에서 명시적으로 실행합니다 |
| fixture | 키·네트워크 없이 시험용 추천을 확인합니다. 실제 Decisions 결과가 아닙니다 |

Aptly 0.1.4부터 상속 호출도 추천을 평가합니다. Codex의 적용은 명시적인 `fork_turns: "none"`, Claude Code는 이력 제약 없는 일반 호출로 제한하며 명시한 필드는 보존합니다. 추천·Hook 인자 변경·실제 자식 실행은 별개입니다. 적용 조건은 [가이드](docs/guide/ko.md#자동-hook)에서 확인하십시오.

## 문서

- [사용 가이드](docs/guide/ko.md): 설치·제거, 키, Hook, 직접 추천, 오류 복구
- [설치·제거](docs/guide/ko.md#설치) 및 [CLI 설정](docs/guide/ko.md#cli로-설정하기): npm 전역 설치, 호스트 등록, 재시작과 신뢰 승인
- [모델과 환경변수](docs/guide/ko.md#모델과-환경변수): 여섯 기본 프로필과 후보 설정
- [맥락 전달](docs/guide/ko.md#맥락-전달): 암호화된 메시지와 저장소 URL의 한계
- [비용 실측](docs/guide/ko.md#비용-실측): README 번역 검토의 토큰·환산 비용과 측정 범위
- [진단·개발](docs/guide/ko.md#진단과-개발): 로컬 진단 보고서와 무료 검증 명령

한국어가 정본입니다. 영어·중국어 간체·일본어 문서는 같은 사용 범위를 설명하며, 문서 언어가 CLI·MCP 출력 언어를 바꾸지는 않습니다.

## 라이선스

[MIT](LICENSE).
