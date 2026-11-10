# 예산 한도

[한국어](../ko/budget.md) · [English](../en/budget.md) · [简体中文](../zh-CN/budget.md) · [日本語](../ja/budget.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [예산 한도와 사용량 (0.1.8부터)](#guide-budget-limits)

<a id="guide-budget-limits"></a>

## 예산 한도와 사용량 (0.1.8부터)

예산 환경변수와 사용량 조회는 Aptly 0.1.8부터 지원합니다. `aptly set default`는 선택한 호스트의 누락된 예산 환경변수도 추가합니다. 추가 예산 질문 없이 기존 값과 명시한 `0`을 보존하며 사용량·원장·캐시를 리셋하지 않습니다. API 전송 범위를 선택하는 기존 질문은 별개입니다. 예산 변수가 없는 기존 등록도 업그레이드 후 새 런타임 기본값을 사용합니다. 이전의 암묵적 20회/50회/$0.50 제한은 유지되지 않으므로 필요한 상한은 명시적으로 설정하십시오.

| 환경변수 | 기본값 | 의미 |
|---|---:|---|
| `APTLY_MAX_DAILY_CALLS` | `200` | 원장별 UTC 일일 분류 시도 상한 |
| `APTLY_MAX_TOTAL_CALLS` | `0` | 원장별 누적 분류 시도 상한 |
| `APTLY_MAX_ESTIMATED_USD` | `0` | 누적 로컬 비용 예약액 상한 |
| `APTLY_ESTIMATED_CALL_USD` | `0.002` | 새 분류 시도마다 예약할 추정 달러 금액 |

세 상한에서 `0`은 무제한입니다. 회당 예약 단가는 상한이 아니므로 양수여야 합니다. 무제한은 정확한 `0`만 사용하고 `0.0`·`0.00` 같은 표기는 거절합니다. 미설정은 기본값을 사용하며 빈 값·음수·비정상 숫자·지수 표기는 거절합니다. 호출 수는 정수, 금액은 소수점 이하 최대 6자리의 십진수입니다. 일일 호출 수의 최대 유한값은 100,000, 누적은 1,000,000이며 금액 설정의 최대 유한값은 100입니다. 유한 금액 상한은 회당 예약액 이상이어야 합니다. 기존에 잘못 설정한 값은 조용히 덮어쓰지 않습니다.

```sh
aptly set env APTLY_MAX_DAILY_CALLS
aptly set env APTLY_MAX_TOTAL_CALLS
aptly set env APTLY_MAX_ESTIMATED_USD
aptly set env APTLY_ESTIMATED_CALL_USD
aptly budget status --client codex
aptly budget status --client claude
```

설정 명령은 `--client codex|claude|all`과 기존 숨김 입력·명시적 `--stdin`을 지원합니다. 변경 후 MCP를 재시작하십시오. Codex의 기존 `env_vars` 예산 전달 설정과 이 CLI 실행 환경에서 관찰된 Claude 상속 예산값도 기본값으로 가리지 않습니다. `inherited`에 보존한 항목을 표시합니다. 직접 `recommend`·`capabilities`는 해당 CLI의 환경변수를 사용하고 호스트 설정 파일을 자동으로 읽지 않습니다. 상태 조회는 기존 gate를 잠시 점유하므로 동시에 실행한 요청은 일시적 `ledger_locked`를 받을 수 있습니다. 상태는 등록된 설정과 허용된 현재 환경의 스냅샷이며, 사용자 래퍼나 실제 실행 중 프로세스의 값을 인증하지 않습니다. 키·API·작업 원문을 조회하지 않으며 원장이나 잠금 파일을 만들지 않습니다. 무제한은 `Unlimited`, 잔여 한도는 `null`로 표시합니다. 여러 세션이 같은 원장을 쓰면 예산을 공유하지만 다른 원장이나 OpenAI 계정 전체 사용량은 합산하지 않습니다.

`budget_exhausted`는 로컬 제한이며 OpenAI 인증·청구 잔액 오류가 아닙니다. 직접 추천·문맥 보충 응답의 `budget_limit`과 상태의 `exhausted_by`가 소진 항목을 구분합니다. 예약액은 실제 청구 상한이 아니며 월별로 자동 초기화하지 않습니다. 단가 변경은 과거 예약을 다시 계산하지 않고 키 재입력·기본값 적용도 예약을 환불하지 않습니다.

새 HTTP 전 예산 거절은 캐시하지 않습니다. 검증 가능한 기존 기본 정책의 미지불 거절만 같은 ID로 다시 평가하며, 성공·보류·문맥 부족의 완료 결과와 `unknown`은 유지합니다. 한도 회복은 원래 retry 참조의 5분 만료나 프로세스 수명을 연장하지 않고 이력·권한 제약도 해제하지 않습니다. 임의의 과거 커스텀 정책 digest를 추측해 재사용하지 않으며 충돌·불명 결과를 새 ID나 원장 삭제로 우회하지 마십시오.

## 관련 문서

[Decisions API 전송 범위](transmission.md) · [비용 실측](benchmarks.md) · [문제 해결](troubleshooting.md)

[가이드 목차](../ko.md)
