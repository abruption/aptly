# 검증

기본 검증은 `npm test`, `npm run poc`, `npm run check:release`예요. 키·유료 API·실제 자식 없이 실행해요. source의 fixture 시험을 실제 호스트나 모델 품질의 증거로 승격하지 않아요.

| 범위 | 필수 회귀 |
|---|---|
| core/provider | 허용 프로필, 입력 크기, malformed 응답, timeout·late result, 오류 분류, 예산·동시성·원장 권한·캐시 충돌 |
| Hook | 모델·모든 effort 철자·role·fork·resume·권한·cwd·원래 task 보존, Claude 문자열 정규화, 실제 관측된 Codex alias |
| provenance | source별 pin·필드별 근거, 누락 CLI/session/managed/env·host 확장, version/session/cwd/call/input digest·시간 불일치 |
| 파일 검사 | 명시 파일만 읽기, JSON/TOML/frontmatter, 비밀 경로·symlink·크기·파싱 실패, raw값·경로 비노출 |
| product MCP | PoC 우회 env 무효, 도구 목록, context 자기 선언 불허, private 증거의 per-call 적용과 stale/changed-source 거부 |
| 공개 준비 | MIT·닫힌 npm file allowlist·개인 인프라/실제 키 패턴·패키지 외 파일 혼입·이식 가능한 임시물·CI 무유료 실행 |

과거 실제 CLI의 모델 적용·오류/deny 시험은 [PoC 결과](POC_RESULTS.md)에 별도로 기록했어요. 새로운 제품 코드의 무유료 회귀가 모든 호스트 버전에서 같은 실제 적용을 증명하지는 않아요.

아래 조건은 **운영 자동 적용을 지원한다고 표시할 때만** 필요하며 추천 전용 preview의 출시 조건은 아니에요. 사용자 결정으로 호스트 내부 패치와 그 후속 검증은 보류했어요.

운영 자동 적용을 지원한다고 표시하려면 전체 effective-source 통합, native Hook 전달, 실제 자식 모델·effort, 다른 보안 Hook 보존, 오류 시 기본 실행·중복 방지와 기준선 대비 품질·재작업·지연·총비용 평가가 모두 필요해요. 현재 일반 업무 평가와 자동 host evidence 수집은 미완료예요.

현재 추천 흐름에서 남은 검증은 AD-001 계약 분리의 무료 회귀 → 최신 제품 MCP의 3~5개 live smoke → 5~10개 초기 추천 평가 → 최종 수동 패키지 확인이에요. [ROADMAP](ROADMAP.md)의 순서와 실행 범위를 따라요. 기존 Node 177개에는 보류한 host 연구 fixture도 포함되며 실제 API/업무 평가 횟수가 아니에요. 범위 재정리 뒤 사용자의 실행 허용에 따라 AD 검증을 수행했어요. 현재 Node193개 무료 회귀, provider→Router usage 조합 검증, 실제 제품 MCP의 smoke3건과 초기 추천 평가8건을 완료했어요. [실제 결과](ADVISORY_RESULTS.md)와 [ROADMAP](ROADMAP.md)에 근거와 한계가 있어요. host/native 검증은 재개하지 않았어요.
