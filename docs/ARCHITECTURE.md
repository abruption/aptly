# 구조

현재 설치·사용 계약은 [사용 가이드](guide/ko.md)와 [호환성](COMPATIBILITY.md)을 따르며, Hook에는 두 경로가 있어요.

1. 운영자 자동 정책: `automatic-hook`이 명시적 선택·역할·fork·resume을 보존하고 `Router.advise`를 호출해요. `defaults`는 기본값을 재작성하고 `advisory`는 추천 문맥만 제공해요. 전체 호스트 설정 검증을 주장하지 않아요.
2. 기존 strict 경로: 자동 정책 경로가 선택되지 않으면 아래 private evidence 기반 처리를 사용해요. 기본값은 shadow이며 적용에는 유효한 현재 호출 증거가 필요해요.

아래 그림은 두 번째 경로를 설명해요.

```text
host native spawn → PreToolUse MCP Hook → route_spawn_hook
                                      → 현재 호출의 private host evidence 검증
                                      → 공통 Router → fixed Decisions endpoint
                                      ← allowlisted profile / 보존 / 불명 / 오류
                                      → 설정·증거 재검증 → 허용 필드만 재작성
host native spawn → 실제 자식 실행 (기존 인증·권한·문맥 유지)
```

- core: 입력·프로필·캐시·원장·예산·timeout·응답 정규화
- provider: 최소 구조화 입력과 고정 choice 질문, 재시도 없는 고정 OpenAI endpoint
- provenance: native pin·role·fork·resume 및 호출별 effective-setting 증거의 순수 해석
- inspect: 명시한 설정 파일과 관련 환경변수 이름만 확인하는 읽기 전용 진단
- config: private operator 설정·host envelope·source fingerprint의 안전한 로딩
- automatic-hook: 운영자 defaults/advisory 정책, 호출 결합, 명시적 설정 보존, 분류 후 정책·호출·카탈로그 재확인
- server: 네 MCP 도구, 자동 정책 경로 선택과 기존 strict 경로의 기본 shadow·증거 재확인
- bin: stdio 서버·진단·advisory 입력·MCP 설정 조각 출력

모델별 원문 정책을 중복 구현하지 않아요. 자유로운 모델명이나 셸 명령을 API가 생성하도록 하지 않아요. 키는 MCP 환경에서 읽고 provider에만 전달해요.

제품 서버에는 합성 manifest·fault injection·deny 도구·transcript 경로 관측이 없어요. 이전 PoC 재현은 test-support의 명시적 fixture 서버에 격리하고 npm 패키지에서 제외해요.

strict 경로의 호스트 snapshot은 자동 발견한 설정 파일 목록이 아니에요. 신뢰된 호스트 통합이 현재 호출의 모든 설정 출처를 관측했음을 제공해야 하며, 이 완전성은 통합의 책임이에요. file detector는 해당 증거로 승격되지 않아요. 구체적 계약은 [CONFIGURATION](CONFIGURATION.md)에 있어요.
