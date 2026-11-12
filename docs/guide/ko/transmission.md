# Decisions API 전송 범위

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[가이드 목차](../ko.md)

아래 전송 검토는 **아직 출시되지 않은 소스 기능**이며, 공개된 Aptly 0.1.10 패키지에는 포함되지 않습니다.

## 이 문서의 목차

- [Decisions API 전송 범위](#guide-transmission-scope)
- [전송 내용과 필터 한계](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## Decisions API 전송 범위

이 절의 전송 범위 명령은 Aptly 0.1.7부터 지원합니다.

여기서 전송은 **로컬 작업 정보를 OpenAI Decisions API에 보내는 것**이며 Aptly 개발자에게 작업을 제공하는 기능이 아닙니다. 적용 모드 `defaults/advisory`와 전송 범위는 별개입니다. 신규 등록은 v2 정책의 `unselected` 상태이며 자동 전송하지 않습니다.

공개된 0.1.10의 대화형 `aptly set default`는 미선택 호스트에만 묻고 Enter를 누르면 `none`을 선택합니다. 비대화형 실행과 postinstall은 묻거나 동의한 것으로 처리하지 않습니다.

미출시 소스에서는 첫 일반 대화형 `aptly setup` 또는 `aptly set default`가 검토 대기 중인 클라이언트를 하나로 묶어 현재 값·출처·기본 또는 재정의된 홈을 보여 주고 질문합니다. 권장 항목은 3번 `excerpt`입니다. Enter 또는 유지 선택은 기존 명시·legacy 범위와 `none`을 그대로 보존하며, 미선택 범위는 `none`이 됩니다. 명시적인 `setup --transmission` 또는 `set transmission <scope>`는 실제 선택을 검토 완료로 기록합니다. 클라이언트 홈별 비공개 revision 1 검토 표시는 패키지 버전·모드·통계와 독립적이므로 일반 패치 업데이트나 재시작마다 다시 묻지 않습니다.

아래 새 명령은 명시적 요청에 따라 항상 다시 묻습니다. 공개된 0.1.10에서는 사용할 수 없습니다:

```sh
aptly set transmission --review
```

취소하면 범위와 검토 표시는 변경되지 않습니다. 일반 setup 또는 default의 전송 외 기본 설정은 이미 적용되었을 수 있습니다. 자동 setup, check, migrate, 전송 범위를 명시한 setup, CI, 비터미널 실행, setup 건너뛰기, npm lifecycle 스크립트, MCP, Hook, help, show, 통계 조회에서는 묻지 않습니다. 질문은 stderr에 출력하며 JSON stdout은 유지합니다. 기존 비활성 정책·모드·실행 래퍼·키·원장·통계·신뢰 설정을 보존합니다.

0.1.10 업데이트 프로세스는 새 질문을 즉시 불러올 수 없습니다. 최초 배포에서는 기능이 포함된 릴리스로 업데이트한 후 대화형 `aptly setup`, `aptly set default` 또는 `aptly set transmission --review`를 실행하십시오. 이 기능이 포함된 이후 업데이트는 새 프로세스를 실행하지 않고 다음 단계를 안내합니다.

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

`--show` 결과의 최상위 `status`는 조회가 완료되면 `complete`(종료 코드 0), 예상된 설정이 불완전하거나 손상·읽기 오류가 있으면 `partial`(종료 코드 1)입니다. `none`·`unselected`와 실제 미설정 상태(자동 정책이 예상되지 않는 수동 직접 전용 MCP 포함)는 완료된 조회입니다. 일부 클라이언트가 실패해도 성공한 결과는 유지합니다. 기존 클라이언트 JSON 필드와 값은 유지되므로 전체 객체를 엄격히 검사하는 소비자는 추가된 `status`를 허용해야 합니다. 일부 기존 클라이언트 상태는 미설정과 오류를 구분하지 않으므로 집계에는 확인된 조회 상태도 반영됩니다. `complete`는 호스트 라우팅·모델·신뢰 준비 상태를 인증하지 않습니다. 조회는 자동 복구·동의·provider 호출을 수행하지 않으며 원시 경로·입력·키·스택을 출력하지 않습니다.

위 변경 명령은 세 가지 대안을 보여 줍니다. 원하는 하나만 실행하십시오. `--client codex|claude|all`로 대상을 고를 수 있습니다. `none`은 자동 전송을 끄고 원래 호출을 보존합니다. `description`은 부모 에이전트가 제공한 설명만 허용합니다. 설명이 없으면 API 호출 전에 문맥 보충을 요청하며 native 본문·라벨로 자동 대체하지 않습니다. `defaults`는 해결 전 스폰을 차단하고 `advisory`는 안내만 제공합니다. `excerpt`는 기존 native 발췌와 명시 설명을 허용합니다. 설명의 출처·크기·민감 패턴 검사는 비민감성이나 사용자 동의를 인증하지 않습니다.

기존 v1은 `legacy` 출처의 `excerpt`로 표시하고 바이트 그대로 유지합니다. 명시 변경은 정책을 v2로 전환하고 소유권 기록을 함께 갱신합니다. 운영자가 수정한 정책·다른 실행 래퍼는 자동으로 인수하지 않으며 충돌 시 보존합니다. 키·원장·불명 기록은 삭제하지 않습니다. 변경 후 MCP를 재시작하십시오. 이미 시작된 전송을 회수하지 못하며 진행 중 결과·retry·fresh는 변경된 정책으로 적용되지 않습니다. 이전 호출 ID의 결합 충돌은 새 유료 ID로 우회하지 마십시오. 명시적 `recommend_agent`·`aptly recommend`는 별도 요청이며 이 자동 전송 설정으로 금지하지 않습니다.

수동으로 `enabled: false`를 편집하는 기존 긴급 중단도 유효하지만 소유권 충돌이 생길 수 있습니다. 일반 변경에는 위 명령을 사용하고 소유권 기록을 직접 편집하지 마십시오.

<a id="guide-transmission-limits"></a>

## 전송 내용과 필터 한계

`excerpt` 범위에서 사전 등록 설명이 없는 자동 분류의 `summary`는 허용된 작업 라벨과 본문의 **첫 문단을 잘라 붙인 발췌문**입니다. 의미를 새로 요약하거나 익명화하지 않습니다. UTF-8 크기는 `min(4000, max_summary_bytes)` 이하이며 전체 HTTP 요청의 크기 제한은 아닙니다. Codex의 opaque 메시지 fallback은 본문을 해독·전송하지 않고 충분히 구체적인 `task_name`만 사용합니다. 라벨에도 민감한 정보가 들어갈 수 있습니다.

`prepare_spawn_context`에 유효한 설명을 등록하면 고정 접두사와 그 설명이 native 발췌 대신 분류에 사용됩니다. 등록 자체는 API를 호출하지 않습니다. `retry_spawn_recommendation`은 문맥 부족 응답 이후 고정 접두사와 새 보충 설명으로 한 번 재추천하며, 이전 본문을 덧붙이지 않습니다. 두 경로 모두 원시 설명은 `min(3800, max_summary_bytes - 96)` 바이트 이하이고 접두사 포함 설명은 `min(4000, max_summary_bytes)` 바이트 이하입니다. `prepare_fresh_delegation` 자체는 완료된 추천을 재사용해 추가 분류를 호출하지 않으며, 독립 지시를 로컬의 다음 호출 인자로 반환합니다. 반환된 모델·effort를 그대로 명시한 Codex 호출은 현재 Hook에서 `explicit_model`로 분류 없이 보존됩니다. 이후 호출의 경유 검사가 추가 분류를 뜻하지는 않습니다. 어느 경로도 설명의 비민감성이나 자동 익명화를 보장하지 않습니다.

Decisions에는 `client`, `task.summary`, `task.operation`, `task.context_sufficient`와 후보 프로필 ID·모델·effort 설명 및 설정된 모델 특성이 전달됩니다. 분류용 API 키는 `Authorization` 헤더로, 요청 ID는 `X-Client-Request-Id` 헤더로 전송됩니다. 자동 경로의 ID는 해시이며 직접 추천의 ID는 호출자가 지정합니다. ID나 후보 설명에도 비밀을 넣지 마십시오.

자동 공유를 끄려면 `APTLY_HOOK_POLICY_PATH`가 가리키는 기존 비공개 정책 파일에서 **`enabled`만 `false`로 변경**하십시오. 나머지 필드와 소유권 기록은 유지하십시오. 이후 자동 Hook 호출은 분류 API나 호출 바인딩 파일을 만들기 전에 원래 호출을 보존합니다. 이미 시작한 전송을 되돌리거나 서버가 받은 내용을 회수하지는 못합니다. 생성된 정책을 바꾸면 설치·설정·제거 명령의 소유권 검사에서 충돌할 수 있으며, 해당 명령은 끄기 설정을 덮어쓰지 않습니다. 소유권 기록을 수정해 검사를 우회하지 마십시오.

전송 범위가 허용하면 `mode: advisory`도 분류 정보를 전송하므로 개인정보 보호용 비활성화가 아닙니다. `APTLY_HOOK_POLICY_PATH`를 지우면 기존 strict 경로로 전환될 수 있으므로 공유 끄기의 대안으로 사용하지 마십시오. `enabled: false`는 명시적인 `recommend_agent`·`aptly recommend` 요청까지 차단하지 않습니다.

공유할 요약을 직접 선택하려면 자동 공유를 끈 뒤 직접 추천에 필요한 정보만 작성하십시오. Aptly는 요약에 적은 URL의 문서나 소스 파일을 자동으로 읽어 첨부하지 않습니다. 알려진 키·Bearer 패턴을 거르는 검사는 완전한 비밀 탐지나 전송 안전성 보장이 아닙니다.

원장과 Hook 바인딩에는 요청 메타데이터·해시·캐시 결과를 저장하며 작업 발췌문을 저장하지 않습니다. Aptly의 진단 결과에도 원문을 넣지 않습니다. 다만 로컬 호스트가 실행을 이어가도록 Hook의 `updatedInput`에는 원래 작업이 유지됩니다. 호스트 자체의 대화·로그 저장은 Aptly가 제어하지 않습니다.

## 관련 문서

[자동 추천](routing.md) · [예산 한도](budget.md) · [실행 통계](statistics.md)

[가이드 목차](../ko.md)
