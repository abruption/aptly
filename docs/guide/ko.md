# Aptly 사용 가이드

**한국어** · [English](en.md) · [简体中文](zh-CN.md) · [日本語](ja.md)

[README](../../README.md)

한국어가 정본입니다. 처음 사용한다면 설치 → 초기 설정 → 자동 추천 순서로 읽으십시오.

| 작업 | 문서 |
|---|---|
| 설치·업데이트·제거 | [설치](ko/installation.md) |
| API 키·계정 홈·모델 후보·stable 실행기 | [설정](ko/configuration.md) |
| Hook 동작·추천 보류·적용 조건 | [자동 추천](ko/routing.md) |
| OpenAI Decisions API에 보낼 정보 선택 | [전송 범위](ko/transmission.md) |
| 호출·비용 한도 | [예산](ko/budget.md) |
| 추천과 실제 실행 비교 | [통계](ko/statistics.md) |
| 등록·자격 저장소·원장 오류 | [문제 해결](ko/troubleshooting.md) |
| 수동 MCP 설정·직접 추천·개발 | [고급 연동](ko/advanced.md) |
| 측정 방법과 비용 환산 | [비용 실측](ko/benchmarks.md) |

<details>
<summary>이전 문서 링크</summary>

<a id="설치"></a>
- [설치](ko/installation.md#guide-installation)
<a id="npm-설치-스크립트-허용"></a>
- [npm 설치 스크립트 허용](ko/installation.md#guide-npm-install-scripts)
<a id="패키지-업데이트"></a>
- [패키지 업데이트](ko/installation.md#guide-package-updates)
<a id="새-버전-알림"></a>
- [새 버전 알림](ko/installation.md#guide-version-notifications)
<a id="명령-도움말-018부터"></a><a id="command-help"></a>
- [명령 도움말 (0.1.8부터)](ko/installation.md#guide-command-help)
<a id="cli로-설정하기"></a>
- [CLI로 설정하기](ko/configuration.md#guide-cli-configuration)
<a id="실행-경로-오류-복구"></a>
- [실행 경로 오류 복구](ko/troubleshooting.md#guide-launcher-recovery)
<a id="키와-재시작"></a>
- [키와 재시작](ko/configuration.md#guide-keys-and-restart)
<a id="mcp-환경변수-설정-순서"></a>
- [MCP 환경변수 설정 순서](ko/advanced.md#guide-manual-mcp-setup)
<a id="설정-파일-위치"></a>
- [설정 파일 위치](ko/configuration.md#guide-host-config-locations)
<a id="api-키-전달"></a>
- [API 키 전달](ko/advanced.md#guide-key-environment)
<a id="codex-예제"></a>
- [Codex 예제](ko/advanced.md#guide-codex-configuration)
<a id="claude-code-예제"></a>
- [Claude Code 예제](ko/advanced.md#guide-claude-configuration)
<a id="건너뛰기제거"></a>
- [건너뛰기·제거](ko/installation.md#guide-skip-and-remove)
<a id="자동-hook"></a>
- [자동 Hook](ko/routing.md#guide-automatic-routing)
<a id="confidence와-추천-보류"></a>
- [confidence와 추천 보류](ko/routing.md#guide-confidence-and-abstention)
<a id="예산-한도와-사용량-018부터"></a><a id="budget-limits"></a>
- [예산 한도와 사용량 (0.1.8부터)](ko/budget.md#guide-budget-limits)
<a id="실행-통계-0110부터"></a><a id="execution-statistics"></a>
- [실행 통계 (0.1.10부터)](ko/statistics.md#guide-execution-statistics)
<a id="decisions-api-전송-범위"></a><a id="외부-전송과-자동-공유-끄기"></a>
- [Decisions API 전송 범위](ko/transmission.md#guide-transmission-scope)
<a id="전송-내용과-필터-한계"></a>
- [전송 내용과 필터 한계](ko/transmission.md#guide-transmission-limits)
<a id="불투명-호출에-명시적-설명-전달-014부터"></a>
- [불투명 호출에 명시적 설명 전달 (0.1.4부터)](ko/advanced.md#guide-explicit-spawn-context)
<a id="맥락-보충-후-재추천-015부터"></a>
- [맥락 보충 후 재추천 (0.1.5부터)](ko/advanced.md#guide-context-retry)
<a id="자동-경유의-보장-범위와-차단-결과-015부터"></a>
- [자동 경유의 보장 범위와 차단 결과 (0.1.5부터)](ko/routing.md#guide-routing-guarantees)
<a id="상속-추천에서-별도-독립-위임-준비-016부터"></a>
- [상속 추천에서 별도 독립 위임 준비 (0.1.6부터)](ko/advanced.md#guide-fresh-delegation)
<a id="직접-추천"></a>
- [직접 추천](ko/advanced.md#guide-direct-recommendations)
<a id="모델과-환경변수"></a>
- [모델과 환경변수](ko/configuration.md#guide-models-and-environment)
<a id="공식-설명과-캐시"></a>
- [공식 설명과 캐시](ko/advanced.md#guide-model-info-cache)
<a id="맥락-전달"></a>
- [맥락 전달](ko/advanced.md#guide-context-delivery)
<a id="비용-실측"></a>
- [비용 실측](ko/benchmarks.md#guide-cost-benchmarks)
<a id="중단된-프로세스와-원장-잠금"></a>
- [중단된 프로세스와 원장 잠금](ko/troubleshooting.md#guide-ledger-lock-recovery)
<a id="진단과-개발"></a>
- [진단과 개발](ko/advanced.md#guide-diagnostics-and-development)

</details>
