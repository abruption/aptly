<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents.**

**한국어** · [English](README.en.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**작업에 맞는 Claude Code·Codex 서브에이전트 모델과 effort를 선택하는 로컬 MCP입니다.**

</div>

Aptly는 최소한의 작업 요약을 OpenAI Decisions API로 분류하고 허용된 실행 프로필을 추천합니다. 설치한 Hook은 명시 선택이 없는 새 일반 서브에이전트의 기본값을 자동으로 선택할 수 있습니다. 실제 실행과 권한 결정은 기존 호스트가 담당합니다.

자체 테스트에서 **API 환산 비용이 약 52~58% 감소했습니다**. [측정 조건과 상세 결과](docs/guide/ko.md#비용-실측)를 확인하세요.

## 빠른 시작

Node.js **24 이상**과 Claude Code 또는 Codex가 필요합니다. 다음 명령으로 최신 안정 버전을 전역 설치하십시오.

```sh
npm install -g aptly@latest
aptly setup --client all --mode defaults
aptly --version
```

`aptly --version`으로 설치된 버전을 확인하십시오.

설치 시 `postinstall`은 기존 호스트 설정 디렉터리에 MCP와 `PreToolUse` Hook을 등록합니다. 명시적인 `setup`은 자동 등록을 건너뛰었거나 아직 설정 디렉터리가 없는 호스트에도 사용할 수 있습니다. 기존 다른 설정·Hook과 기존 Aptly 실행 명령·환경은 보존합니다.

분류용 `OPENAI_API_KEY`는 `aptly set env OPENAI_API_KEY`의 숨김 입력으로 OS 자격 저장소에 보관하거나 안전한 실행 환경에서 MCP 프로세스에 전달하십시오. 키를 명령행·요청·설정 JSON·저장소에 기록하지 마십시오. 호스트 또는 MCP를 재시작한 뒤, **Codex에서는 `/hooks`에서 새 Hook을 검토하고 신뢰를 승인하십시오.** [설치·키·등록 상세](docs/guide/ko.md#설치)를 참고하십시오.

## 사용 방식

| 방식 | 동작 |
|---|---|
| 자동 Hook | 모델·effort·고정 역할·이력 상속·resume을 지정하지 않은 새 일반 호출의 기본값을 선택합니다 |
| 직접 추천 | `recommend_agent` 또는 `aptly recommend`로 프로필을 받고 호스트에서 명시적으로 실행합니다 |
| fixture | 키·네트워크 없이 시험용 추천을 확인합니다. 실제 Decisions 결과가 아닙니다 |

자동 선택 대상은 Codex의 `fork_turns: "none"`, Claude Code의 `subagent_type: "general-purpose"` 호출입니다. 명시 선택이나 맥락 부족·인증·연결 오류가 있으면 원래 호출을 유지합니다. 추천은 모델 접근 권한이나 호스트 전체 설정의 확인을 뜻하지 않습니다.

## 문서

- [CLI 설정](docs/guide/ko.md#cli로-설정하기)
- [사용 가이드](docs/guide/ko.md): 설치·제거, 키, Hook, 직접 추천, 오류 복구
- [설치·제거](docs/guide/ko.md#설치): npm 전역 설치, 호스트 등록, 재시작과 신뢰 승인
- [모델과 환경변수](docs/guide/ko.md#모델과-환경변수): 여섯 기본 프로필과 후보 설정
- [맥락 전달](docs/guide/ko.md#맥락-전달): 암호화된 메시지와 저장소 URL의 한계
- [비용 실측](docs/guide/ko.md#비용-실측): README 번역 검토의 토큰·환산 비용과 측정 범위
- [진단·개발](docs/guide/ko.md#진단과-개발): 로컬 진단 보고서와 무료 검증 명령

한국어가 정본입니다. 영어·중국어 간체·일본어 문서는 같은 사용 범위를 설명하며, 문서 언어가 CLI·MCP 출력 언어를 바꾸지는 않습니다.

## 라이선스

[MIT](LICENSE).
