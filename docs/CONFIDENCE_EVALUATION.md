# Confidence 정책 평가 — 기본 동작 유지

[Issue #14](https://github.com/abruption/aptly/issues/14)의 초기 평가입니다. 2026-11-08 비민감 합성 작업을 실제 Aptly MCP `recommend_agent` → Decisions 경로로 분류했습니다. 숫자 임계값·자동 적용 기본값·호스트 설정은 변경하지 않았습니다.

## 현재 계약

| 사례 | 실제 Decisions provider | 일반 Router·저장 결과 | 자동 적용 |
|---|---|---|---|
| confidence 0·0.16·1의 허용 프로필 | 유한한 [0,1] 값으로 유효 | 추천 및 완료 결과를 보존 | confidence 자체로 차단하지 않으며 나머지 조건을 검사합니다 |
| confidence 누락 | `invalid_json`으로 거절 | 선택 메타데이터이므로 허용합니다 | 일반 Router의 허용과 실제 provider의 응답 계약을 구분합니다 |
| 범위 밖·NaN·잘못된 타입 | 거절 | 잘못된 응답으로 유지 처리 | 적용할 유효 추천이 아닙니다 |
| `keep_current` | 명시적 추천 보류 | `provider_abstained` | enabled defaults의 적격 호출은 deny, advisory는 안내만 제공합니다 |
| `needs_context` | 명시적 문맥 부족 | `provider_needs_context` | 기존 문맥 보충·차단 계약을 유지합니다 |

이 평가에서 confidence를 보정된 정답 확률로 검증하지 않았으며 그렇게 해석해서는 안 됩니다. 추천 보류나 문맥 충분성의 대체 기준으로도 사용하지 않습니다. 명시된 모델·effort·역할·이력·권한과 기존 deny를 보존합니다. 완료 캐시는 동일 ID로 재사용하고 불명 결과는 새 ID로 재호출하지 않습니다.

## 사전 고정 조건

- [8개 과제와 사전 기대 분류](../test-support/confidence-evaluation-cases.json)를 결과 관측 전에 고정했습니다. corpus SHA-256은 `e63957ad1f3352500d8a02033b9faf65b377fe8381164a8ecfb8dc18340f53cd`입니다.
- 단순 2개·일반 2개·심층 2개·정보 부족 2개이며, Codex와 Claude 후보를 각 4개 과제에서 사용했습니다. 각 과제를 새 요청 ID로 두 번씩 순차 분류했습니다. 반복 호출은 불명 요청의 재시도가 아닌 사전 계획된 표본입니다.
- 기대 프로필은 작성자가 카탈로그 설명에 따라 배정한 평가 기준입니다. 독립 정답·모델 역량·실제 작업 성공 기준이 아닙니다. 모든 설명은 영어이며 실제 사용자 업무·원문·자격정보를 포함하지 않습니다.
- 정보 부족 과제도 provider의 보류를 관측하기 위해 `context_sufficient: true`로 보냈습니다. 로컬 false gate와 실제 내용 충분성을 혼동하지 않습니다.
- 실제 분류 최대 16회, 로컬 추정 예약액은 회당 $0.01 × 16 = $0.16으로 계획했습니다. 이는 실제 청구액이나 API 요금 상한이 아닙니다. unavailable·unknown·예산 소진 시 중단하고 대체 표본을 만들지 않는 조건이었습니다.
- 연결된 서버의 policy `aptly-v010`·catalog `catalog-037c98753595cb6d0c5dabeab47bbc8b`와 6개 후보를 확인했습니다. 도구가 실행 중 서버의 빌드 SHA를 제공하지 않아 바이너리 소스 일치까지 인증하지 않았습니다.

## 실제 분류 결과

| 과제 | 사전 기대 | 두 회의 관측 결과 | 두 회의 confidence |
|---|---|---|---|
| sort / Codex | simple | simple / simple | 0.99 / 0.99 |
| format / Claude | simple | simple / simple | 1 / 1 |
| translation / Codex | routine | simple / simple | 0.43 / 0.43 |
| scoped-code / Claude | routine | routine / routine | 0.84 / 0.84 |
| concurrency / Codex | deep | deep / deep | 0.74 / 0.74 |
| security / Claude | deep | deep / deep | 0.75 / 0.75 |
| missing / Codex | needs_context 또는 keep_current | needs_context / needs_context | 0.99 / 0.99 |
| ambiguous / Claude | needs_context 또는 keep_current | needs_context / needs_context | 0.89 / 0.89 |

- 사전 기대와 14/16회 일치했습니다. 고유 과제 기준은 7/8개이며 두 회의 선택은 8/8개 과제에서 같았습니다. 표본은 16개의 독립 작업이 아닙니다.
- 번역 검토는 routine 기대와 달리 simple을 추천했습니다. 실제 자식 산출물을 비교하지 않았으므로 이는 분류 기준 불일치이며 번역 품질 저하의 실증은 아닙니다.
- 추천 12회·문맥 부족 4회였고 실패·unknown은 관측되지 않았습니다. 0·누락·명시적 keep_current는 실제 응답에서 나오지 않았으므로 별도 합성 회귀 검증과 구분합니다.
- sort 첫 ID 재조회는 `cached: true`였습니다. 캐시가 반환한 원래 usage·latency를 신규 유료 표본에 더하지 않았습니다.

## 비용과 지연

16회 합계는 입력 **7,616토큰**, 출력 **0토큰**입니다. [공식 Decisions 안내](https://developers.openai.com/api/docs/guides/decisions)를 2026-11-08 확인한 비캐시 입력 $0.10/1M에 전량 환산하면 **$0.0007616**입니다. 계정 실제 청구액을 조회한 값이 아닙니다. 현재 Aptly usage는 cache read/write 세부치를 노출하지 않으므로 캐시 할인·쓰기 요금·지역/장문 가산은 반영하지 않았으며 이 금액을 비용 상한으로 취급하지 않습니다.

| 지연 범위 | 최소 | 중앙값 | 최대 |
|---|---:|---:|---:|
| Router의 provider 호출 경로 | 219.042ms | 370.481ms | 608.906ms |
| 호출자가 측정한 MCP 전체 왕복 | 303ms | 450.5ms | 696ms |

provider 호출 경로에는 직렬화·전송·응답 검증 등이 포함됩니다. 순수 서버 추론 시간이나 end-to-end 자식 작업 지연이 아닙니다. 부모의 평가 진행·도구 호출·서브에이전트 테스트 작성·기타 세션 비용과 자식 실행 비용은 위 수치에서 제외했습니다.

## 사후 임계값 비교 — 정책 제안 아님

관측 후 0·0.25·0.5·0.75·0.9 기준을 서술용으로 계산했습니다. 추천된 12건만 대상으로 `confidence >= cutoff`를 가정하며, `needs_context`를 높은 confidence라는 이유로 추천으로 바꾸지 않습니다.

| 가상 기준 | 추천 유지 | 제외 | 제외 중 사전 기대와 일치한 건수 |
|---|---:|---:|---:|
| 0 | 12 | 0 | 0 |
| 0.25 | 12 | 0 | 0 |
| 0.5 | 10 | 2 | 0 |
| 0.75 | 8 | 4 | 2 |
| 0.9 | 4 | 8 | 6 |

0.5가 이 표본의 번역 불일치를 제외한다는 사실은 임계값의 타당성을 입증하지 않습니다. 사후 기준·8개 고유 과제·작성자 배정 기대값이며 별도 검증 집합도 없습니다. 0.75는 기대에 맞는 심층 추천도 제외합니다. 분류 비용은 이미 발생했으므로 제외 건수를 비용 절감액으로 환산하지 않습니다. 자식 성공·재작업·사용자의 원래 모델·대기 비용을 측정하지 않아 총비용이나 품질 개선을 주장하지 않습니다.

## 재계산과 무료 회귀

[공개 관측 JSON](CONFIDENCE_EVALUATION.json)은 합성 과제 ID와 허용된 결과 메타데이터만 포함합니다. 다음 명령은 저장된 표본을 읽어 해시·표본 중복·형식·토큰 합계를 검사하고 통계를 다시 계산합니다. 키·네트워크·유료 API를 사용하지 않습니다.

```sh
node scripts/summarize-confidence-evaluation.ts
node --test test/confidence-policy.test.ts
```

회귀는 실제 provider의 confidence 누락 거절, 일반 Router의 선택 메타데이터, 0·0.16·1, 보류와 문맥 부족, 완료 캐시·재시작·unknown 보호, 양 클라이언트 defaults/advisory와 명시 선택 보존을 다룹니다. 주입된 합성 provider/fetch를 사용하며 실제 API 응답 관측으로 표현하지 않습니다.

## 판단과 남은 범위

기본 동작을 유지합니다. 이 파일럿은 숫자 cutoff나 0 차단을 도입할 충분한 근거가 아닙니다. 후보의 실제 작업 품질을 비교하려면 같은 고정 입력에 대해 추천 모델과 기준 모델의 산출물·재작업·전체 비용·지연을 별도로 평가해야 합니다. 이번에는 native 자식 실행이나 Claude CLI 호출을 하지 않았습니다.

추후 임계값 정책을 제안한다면 적용 위치는 Hook만으로 제한하지 않습니다. retry가 반환하는 `set_if_unspecified`와 fresh가 반환하는 명시 실행 인자에도 일관된 적용 기준이 필요하며, 원장의 추천 사실과 실행 가능 여부를 구분해야 합니다. 기존 pins·이력·deny·불명 유료 요청 보호를 완화하지 않습니다. 공유 정책 #15는 별도 결정으로 남깁니다.
