<div align="center">

# Aptly

[![npm version](https://img.shields.io/npm/v/aptly)](https://www.npmjs.com/package/aptly)
[![npm downloads](https://img.shields.io/npm/dm/aptly)](https://www.npmjs.com/package/aptly)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abruption/aptly/blob/main/LICENSE)

**Model and reasoning recommendations for subagents, powered by the OpenAI Decisions API.**

**한국어** · [English](README.en.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

</div>

Claude Code·Codex 서브에이전트의 모델과 추론 강도를 추천합니다. 작업 요약을 OpenAI Decisions API로 보내며, 명시한 모델·추론 강도·실행 권한은 보존합니다.

## 빠른 시작

Node.js **24 이상**, Claude Code 또는 Codex, OpenAI API 키가 필요합니다.

```sh
npm install -g aptly@latest --allow-scripts=aptly
aptly set default
aptly set env OPENAI_API_KEY
```

`set default`에서 전송 범위를 선택하고 API 키는 숨김 입력으로 등록합니다. 호스트를 재시작한 뒤 **Codex는 `/hooks`에서 새 Hook을 검토·승인**하십시오. [설치·키 설정](docs/guide/ko/installation.md)에서 npm 호환 옵션과 계정별 설정을 확인할 수 있습니다.

## 업데이트

관련 호스트·MCP 서버·CLI 프로세스를 중지한 뒤 실행하십시오.

```sh
aptly update
aptly setup --client all
```

호스트를 재시작하십시오. 키를 다시 입력할 필요는 없습니다. stable 실행기나 이전 버전에서 전환하는 경우 [업데이트 안내](docs/guide/ko/installation.md#guide-package-updates)를 확인하십시오.

## 문서

- [사용 가이드](docs/guide/ko.md): 설정·자동 추천·예산·통계·문제 해결
- [모델 후보 설정](docs/guide/ko/configuration.md#guide-models-and-environment)
- [전송 범위](docs/guide/ko/transmission.md): Decisions API에 보내는 정보
- [비용 실측](docs/guide/ko/benchmarks.md): 소규모 README 검토 시험에서 자식 검토·분류비의 API 환산액 약 52~58% 감소. 전체 작업 비용이나 구독 실청구 절감률은 아닙니다.
