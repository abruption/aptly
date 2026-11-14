# Decisions API 전송 범위

[한국어](../ko/transmission.md) · [English](../en/transmission.md) · [简体中文](../zh-CN/transmission.md) · [日本語](../ja/transmission.md)

[가이드 목차](../ko.md)

## 목차

- [전송 범위 선택](#guide-transmission-scope)
- [전송 내용과 제한](#guide-transmission-limits)

<a id="guide-transmission-scope"></a>

## 전송 범위 선택

전송 대상은 **OpenAI Decisions API**이며 Aptly 개발자가 아닙니다. 신규 등록은 미선택(`unselected`) 상태로 자동 전송하지 않습니다.

| 범위 | 자동 추천에 보낼 수 있는 정보 |
|---|---|
| `none` | 자동 전송하지 않고 원래 호출 보존 |
| `description` | 호출자가 제공한 설명만 전송. 없으면 문맥 보충 요청 |
| `excerpt` | 명시 설명과 지원되는 native 작업 발췌 허용 |

처음 대화형 `setup`·`set default`를 실행하면 검토 대기 중인 홈의 범위를 묻습니다. 권장 항목은 `excerpt`이며 Enter는 기존 선택을 유지하고 미선택이면 `none`을 선택합니다. 자동 설치·CI·비터미널 실행은 동의로 처리하지 않습니다. 취소하면 전송 선택은 바뀌지 않지만 앞선 기본 등록은 완료됐을 수 있습니다.

다시 검토하려면 다음을 실행하십시오(0.1.11부터).

```sh
aptly set transmission --review
```

현재 값을 조회하거나 범위를 직접 선택할 수도 있습니다. 아래 변경 명령 중 원하는 하나만 실행하십시오. 대상은 `--client codex|claude|all`로 고릅니다.

```sh
aptly set transmission --show
aptly set transmission none
aptly set transmission description
aptly set transmission excerpt
```

변경 후 MCP를 재시작하십시오. 기존 v1 정책은 변경 전까지 legacy `excerpt`로 유지됩니다. 운영자 변경·다른 래퍼는 자동 인수하지 않습니다. 진행 중 전송을 회수하지 못하며 변경 전 결과·retry·fresh는 새 정책에 적용하지 않습니다. 충돌을 새 유료 ID로 우회하지 마십시오.

`--show`의 `complete`/종료 코드 0은 조회 완료이며 실제 미설정·`none`도 포함합니다. 예상된 설정의 손상·누락·충돌은 `partial`/종료 코드 1입니다. 호스트 실행 준비나 동의를 확인하는 명령은 아닙니다.

`advisory`는 적용을 제한하는 모드이며 전송 금지가 아닙니다. `description`의 설명이 부족하면 `defaults`는 스폰을 차단하고 `advisory`는 안내합니다. `recommend_agent`·`aptly recommend`는 별도 명시 요청이므로 자동 전송 설정으로 금지되지 않습니다.

<details>
<summary>정책을 직접 편집해 긴급 중단</summary>

`APTLY_HOOK_POLICY_PATH`의 기존 비공개 정책에서 `enabled`만 `false`로 바꾸면 자동 분류·바인딩 전에 원래 호출을 보존합니다. 다른 필드·소유권 기록은 편집하지 마십시오. 소유권 충돌이 생길 수 있으므로 일반 변경은 위 CLI를 쓰십시오. 정책 경로를 지우면 strict 경로로 전환될 수 있어 중단 방법으로 쓰지 않습니다. 이미 시작한 전송과 명시 직접 추천은 취소하지 못합니다.

</details>

<a id="guide-transmission-limits"></a>

## 전송 내용과 제한

`excerpt` 범위에서 사전 등록 설명이 없는 자동 분류의 `summary`는 허용된 작업 라벨과 본문의 **첫 문단을 잘라 붙인 발췌문**입니다. 의미를 새로 요약하거나 익명화하지 않습니다. UTF-8 크기는 `min(4000, max_summary_bytes)` 이하이며 전체 HTTP 요청의 크기 제한은 아닙니다. Codex의 opaque 메시지 fallback은 본문을 해독·전송하지 않고 충분히 구체적인 `task_name`만 사용합니다. 라벨에도 민감한 정보가 들어갈 수 있습니다.

`prepare_spawn_context`에 유효한 설명을 등록하면 고정 접두사와 그 설명이 native 발췌 대신 분류에 사용됩니다. 등록 자체는 API를 호출하지 않습니다. `retry_spawn_recommendation`은 문맥 부족 응답 이후 고정 접두사와 새 보충 설명으로 한 번 재추천하며, 이전 본문을 덧붙이지 않습니다. 두 경로 모두 원시 설명은 `min(3800, max_summary_bytes - 96)` 바이트 이하이고 접두사 포함 설명은 `min(4000, max_summary_bytes)` 바이트 이하입니다. `prepare_fresh_delegation` 자체는 완료된 추천을 재사용해 추가 분류를 호출하지 않으며, 독립 지시를 로컬의 다음 호출 인자로 반환합니다. 반환된 모델·effort를 그대로 명시한 Codex 호출은 현재 Hook에서 `explicit_model`로 분류 없이 보존됩니다. 이후 호출의 경유 검사가 추가 분류를 뜻하지는 않습니다. 어느 경로도 설명의 비민감성이나 자동 익명화를 보장하지 않습니다.

Decisions에는 `client`, `task.summary`, `task.operation`, `task.context_sufficient`와 후보 프로필 ID·모델·effort 설명 및 설정된 모델 특성이 전달됩니다. 분류용 API 키는 `Authorization` 헤더로, 요청 ID는 `X-Client-Request-Id` 헤더로 전송됩니다. 자동 경로의 ID는 해시이며 직접 추천의 ID는 호출자가 지정합니다. ID나 후보 설명에도 비밀을 넣지 마십시오.

공유할 요약을 직접 선택하려면 자동 공유를 끈 뒤 직접 추천에 필요한 정보만 작성하십시오. Aptly는 요약에 적은 URL의 문서나 소스 파일을 자동으로 읽어 첨부하지 않습니다. 알려진 키·Bearer 패턴을 거르는 검사는 완전한 비밀 탐지나 전송 안전성 보장이 아닙니다.

원장과 Hook 바인딩에는 요청 메타데이터·해시·캐시 결과를 저장하며 작업 발췌문을 저장하지 않습니다. Aptly의 진단 결과에도 원문을 넣지 않습니다. 다만 로컬 호스트가 실행을 이어가도록 Hook의 `updatedInput`에는 원래 작업이 유지됩니다. 호스트 자체의 대화·로그 저장은 Aptly가 제어하지 않습니다.

[자동 추천](routing.md) · [예산](budget.md) · [가이드 목차](../ko.md)
