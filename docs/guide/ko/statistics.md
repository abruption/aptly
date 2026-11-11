# 실행 통계

[한국어](../ko/statistics.md) · [English](../en/statistics.md) · [简体中文](../zh-CN/statistics.md) · [日本語](../ja/statistics.md)

[가이드 목차](../ko.md)

## 이 문서의 목차

- [실행 통계 (0.1.10부터)](#guide-execution-statistics)

<a id="guide-execution-statistics"></a>

## 실행 통계 (0.1.10부터)

실행 통계는 Aptly 0.1.10부터 지원합니다. 0.1.10 이상을 설치하거나 [패키지 업데이트](installation.md#guide-package-updates) 안내에 따라 업그레이드한 뒤 아래 예제를 사용하십시오. 기존 Aptly 설정이 필요합니다. 초기 수집은 POSIX에서만 지원하며 Windows 통계 수집은 미지원입니다. Windows의 일반 Aptly 사용에는 영향이 없습니다.

```sh
aptly stats
aptly stats --today --client codex
aptly stats enable --client codex
aptly stats enable --client codex --codex-native-metadata
aptly stats disable --client codex
```

`aptly stats` 조회와 `--today` 결과의 최상위 `status`는 조회가 완료되면 `complete`(종료 코드 0), 지원하지 않는 통계 요청이나 손상·읽기·저장소 오류가 있으면 `partial`(종료 코드 1)입니다. 수집이 꺼져 있거나 실제로 설정되지 않은 경우도 완료된 조회입니다. 일부 클라이언트가 실패해도 성공한 결과는 유지합니다. 기존 클라이언트 JSON 필드와 값은 유지되므로 전체 객체를 엄격히 검사하는 소비자는 추가된 `status`를 허용해야 합니다. `complete`는 호스트 라우팅·모델·신뢰 준비 상태를 인증하지 않습니다. 예상치 못한 통계 오류는 `statistics_failed`로 보고하며 원시 경로·입력·키·스택은 출력하지 않습니다. 조회는 자동 복구·동의·provider 호출을 수행하지 않습니다.

명령 형식은 `aptly stats [--today] [--client codex|claude|all]`, `aptly stats enable [--client] [--codex-native-metadata]`, `aptly stats disable [--client]`입니다. 수집은 기본적으로 꺼져 있고 postinstall에서도 자동 활성화하지 않습니다. enable은 Aptly 소유 명령 관찰자를 설치하고 별도의 `stats-ownership.json`에 기록하며 기존 receipt·MCP·launcher·키·예산·전송 설정은 유지합니다. 활성화 후 MCP와 호스트를 재시작하고 Codex에서는 `/hooks`의 native Hook 신뢰를 검토하십시오.

disable은 수집을 끄고 변경되지 않은 소유 관찰자만 제거합니다. 수정되거나 사용자 정의된 관찰자는 경고와 함께 보존하며 데이터와 키도 유지합니다. `remove`는 통계 소유 정의를 검증·제거하지만 데이터는 유지합니다. 별도로 관리하는 수동 관찰자나 사용자 정의 Hook은 자동 채택하지 않습니다.

비공개 상태는 예산 원장과 별개의 `stats.sqlite`, `stats-config.json`, `stats-key`(HMAC 비밀키)를 사용합니다. 키를 공유하지 마십시오. 기록에는 작업 원문·대화 기록·원시 ID·경로·오류·자격 증명이 없습니다. 통계 조회는 API·키·자격 저장소에 접근하지 않고 초기화나 알림도 실행하지 않습니다.

집계는 `model_match`, `model_mismatch`, `model_changed`, `unknown`, `pending`, `expired_pending`, `application_unconfirmed`를 표시하며 advisory는 별도로 표시합니다. `blocked`, `explicit_preserved`, `unbound`는 분모에서 제외합니다. 실제 적용 effort는 측정하지 않으며 설정 effort는 실제 effort가 아닙니다. Claude 별칭 `haiku`, `sonnet`, `opus`, `fable`는 실제 정식 모델로 해석할 수 없어 `unknown`입니다. 정확한 정식 모델만 지원하며 모델 관측이 모든 별칭의 일치를 보장하지 않습니다. 사용자 수용이나 품질을 증명하는 수치가 아닙니다.

직접 advisory·retry·native 연속성이 없는 새 unbound 호출은 대략적인 시간으로 결합하지 않습니다. `--today`는 바인딩 최초 생성일의 UTC 날짜를 사용합니다. 용량은 위임 10,000건과 자식 10,000건으로 고정되며 자동 정리하지 않습니다. 집계는 전체 누적이 아닌 보존된 기록 기준입니다. 용량 도달 시 새 ID를 버리고 도달 플래그를 표시합니다. 콜백 누락은 우회를 증명하지 않습니다. 토큰·비용 합계, 실시간 할당량이나 절감액은 제공하지 않습니다.

Codex native 메타데이터는 명시적 옵션이 없으면 꺼져 있습니다. 정확한 자식 ID로 SQLite native 메타데이터만 읽으며 대화 기록 조회·복구·app-server 실행은 하지 않습니다. 이전된 `sqlite_home`, 미지원 스키마·경로, 모호한 결합은 unknown입니다. SQL 읽기가 기존 SHM 읽기 표시를 갱신할 수 있지만 행·스키마를 쓰거나 sidecar를 의도적으로 생성하지 않습니다.

수집은 최선 노력 방식이므로 누락·지연·용량 초과로 모델 이력이 불완전할 수 있습니다. `model_match`는 보존된 증거의 일치이며 모든 요청이 해당 모델을 사용했다는 뜻이 아닙니다. Codex 수집 해제·설정 제거 또는 `--codex-native-metadata` 없는 활성화는 native 메타데이터 접근 동의도 해제합니다. Node나 패키지 경로가 바뀌면 수집을 해제한 뒤 다시 활성화하여 명령을 갱신하십시오. 사용할 수 없거나 손상된 저장소는 보존합니다. 키를 삭제하거나 사용량이 0이라고 판단하지 말고 로컬에서 검토하십시오.

## 관련 문서

[자동 추천](routing.md) · [Decisions API 전송 범위](transmission.md) · [문제 해결](troubleshooting.md)

[가이드 목차](../ko.md)
