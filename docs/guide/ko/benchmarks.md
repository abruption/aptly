# 비용 실측

[한국어](../ko/benchmarks.md) · [English](../en/benchmarks.md) · [简体中文](../zh-CN/benchmarks.md) · [日本語](../ja/benchmarks.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [비용 실측](#guide-cost-benchmarks)

<a id="guide-cost-benchmarks"></a>

## 비용 실측

2026-11-05에 [session-peer의 영어 README](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.md)를 정본으로 [한국어 번역](https://github.com/abruption/session-peer/blob/6e9efda7588e1df638748eeb7ad1b2707e0a3bf4/README.ko.md)을 검토했습니다. 합계 17,964바이트의 같은 문서와 같은 지시로 실행마다 수정안 6개를 작성했고 원본은 수정하지 않았습니다.

작업명만 제공한 자동 Hook 시험은 3회 모두 `needs_context`로 보류됐습니다. `recommend_agent`에 저장소·파일 URL을 추가한 3회와 URL에 문서 요약까지 추가한 3회는 모두 Terra/high를 추천했습니다. 아래는 URL+요약 조건의 실제 Terra/high 3회를 직전 Sol/high 3회와 비교한 회당 평균입니다.

| Standard API 환산 기준 | Sol/high | Terra/high + 분류비 | 감소율 |
|---|---:|---:|---:|
| 실제 캐시 사용량 반영 | $0.03229 | $0.01354 | 58.05% |
| 입력 전체를 비캐시로 환산 | $0.11254 | $0.05363 | 52.35% |

호스트에 기록된 실측 토큰에 [공식 Standard API 단가](https://developers.openai.com/api/docs/pricing)를 적용한 USD 환산값입니다. 구독 실청구액이나 실제 한도 차감액은 아닙니다. Terra 쪽에는 [Decisions 분류 비용](https://developers.openai.com/api/docs/guides/decisions) 회당 $0.0000756을 포함했습니다. 비교 범위는 검토 자식 에이전트와 분류이며 문서 수집·요약 준비·메인 에이전트 조사 비용은 제외했습니다.

측정은 **명시적 MCP 추천 → 추천 프로필을 인자로 전달한 호스트의 기본 실행**입니다. 자동 Hook의 URL 수집·전달 기능 검증이 아닙니다. 기준군은 직전 실측을 재사용했고 조건별 표본은 3회입니다. 문서 전체 읽기·원문 인용 일치·출력 형식은 확인했지만 품질 동등성, 통계적 유의성, 다른 업무의 절감을 보장하지 않습니다.

## 관련 문서

[예산 한도](budget.md) · [실행 통계](statistics.md) · [고급 MCP 연동·개발 참고](advanced.md)

[가이드 목차](../ko.md)
