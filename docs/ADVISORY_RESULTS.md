# 추천 preview의 실제 연동·초기 평가

> 이 기록은 0.1.0-preview.0의 이전 4개 후보 카탈로그에 대한 관측이에요. 0.1.0 초안의 새 6개 기본 후보·effort에 대한 품질/비용 평가로 해석하지 않아요.


2026-11-05, 현재 제품 `src/server.ts`의 `recommend_agent`를 실제 Decisions에 연결했어요. test-support PoC 서버나 host patch는 사용하지 않았어요. 비민감 합성 입력과 기대 범주를 [corpus](../test-support/advisory-evaluation-cases.json)에 먼저 고정하고, 같은 corpus hash를 유지해 smoke 3건과 초기 평가 8건을 실행했어요. 키는 기존 자격 조회 경로에서 메모리·서버 환경으로만 전달했어요. 공개 결과는 allowlist metadata만 담은 [JSON](ADVISORY_RESULTS.json)이에요.

## 관측한 결과

- 실제 분류 11회 완료, unknown 0건. MCP 서버 재시작 전후의 같은 ID 결과 재사용을 확인했고 캐시 재조회가 추가 분류를 만들지 않았고 원장 호출 수는 실제 분류 11건과 일치했어요.
- smoke 3/3, 사전 기대 범주와 초기 추천 8/8 일치. 초기 평가의 단순 작업 3건·심층 작업 3건은 해당 routine/deep 프로필, 정보 부족 2건은 needs_context였어요.
- 입력 2,959토큰, 출력 0토큰. 관측 latency 범위 213.492–1,801.502ms, 중앙값 300.746ms예요. cold start와 작은 표본의 변동을 포함하며 성능 SLA가 아니에요.
- uncached 입력 $0.10/1M 기준 산술 추정은 **$0.0002959**예요. 실제 청구를 조회한 값이나 자식 실행 비용·총비용 절감이 아니에요. [공식 Decisions 안내](https://developers.openai.com/api/docs/guides/decisions)

| 사례 | 기대 범주 | 실제 결과 | 일치 |
|---|---|---|---|
| smoke-sort | codex-routine | codex-routine | 예 |
| smoke-race | codex-deep | codex-deep | 예 |
| smoke-extract | claude-routine | claude-routine | 예 |
| eval-rename | codex-routine | codex-routine | 예 |
| eval-table | claude-routine | claude-routine | 예 |
| eval-lock | codex-deep | codex-deep | 예 |
| eval-auth | claude-deep | claude-deep | 예 |
| eval-architecture | codex-deep | codex-deep | 예 |
| eval-count | claude-routine | claude-routine | 예 |
| eval-missing | needs_context / keep_current | needs_context | 예 |
| eval-ambiguous | needs_context / keep_current | needs_context | 예 |

## 해석과 다음 판단

명확한 기계적 작업·복잡한 분석·맥락 부족을 나누는 작은 corpus에서는 원하는 분류가 관측됐어요. 현재 추천 전용 preview의 연결과 기본 사용성을 확인한 근거로 사용하고, 더 큰 품질 주장이나 분류 정책 변경을 정당화하는 통계로 쓰지 않아요. 비교군의 실제 task 수행·재작업·총비용을 측정하지 않았고, child를 실행하지 않았어요. 모델 접근 권한·native Hook 자동 적용의 검증도 아니에요. 이 결과 때문에 보류한 host 확장을 재개하거나 평가 규모를 자동 확대하지 않아요.

무료 회귀는 provider→Router의 full/missing/partial/inconsistent usage를 붙여 검증했어요. 공식 응답처럼 완전한 usage는 추천을 반환하고, 누락·부분·불일치 usage는 invalid_response로 유지하며 같은 ID에 추가 API 호출을 하지 않아요. 인증·429·timeout 등을 실제 유료 오류로 반복하지 않았어요.

실제 요청에는 host 검증 flag가 필요하지 않았고 모든 결과가 advisory_only였어요. 선택·실행은 기존 호스트에서 별도로 결정해야 해요. 공개 JSON에 원장 원본·키·개인 경로·원시 오류·사용자 업무 원문은 포함하지 않았어요. 과거 2026-11-03 합성 live6회와 이번 11회는 다른 검증 기록이에요.
