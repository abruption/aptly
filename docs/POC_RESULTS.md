# 합성 PoC 결과

2026-11-03에 macOS arm64, Node 24, Codex CLI 0.166.0, Claude Code 2.1.314로 관측한 결과예요. 이 문서는 공개용으로 정리한 요약이며 사용자 자격·개인 인프라 식별자·호스트 절대 경로·원문 transcript를 포함하지 않아요.

전용 분류 키를 사용자 브라우저에서 발급해 사용자 자격 저장소에 보관했고, 재조회 일치와 실제 API 호출을 확인했어요. 키 값은 프로젝트 소스·문서·로그에서 발견되지 않았어요. 공개 실행 경로는 별도 서버 계정이나 특정 자격 저장소에 의존하지 않아요.

| 경로 | 추천·적용·완료 관측 |
|---|---|
| 공통 MCP | fixture와 실제 Decisions의 세 합성 입력에서 각각 codex-routine·codex-deep·claude-routine 선택 및 동일 요청 캐시 재사용 |
| Claude shadow | 추천은 Haiku, 실행은 기존 Sonnet 유지, 자식 결과 42 |
| Claude Decisions apply | updatedInput만으로 Haiku를 요청, 실제 자식 Haiku와 42 관측. 실제 effort 미확인 |
| Codex Decisions apply | 실제 Hook 이름을 관측해 matcher 보완, Sol/low 요청, 부모 ID와 연결된 실제 자식 turn_context의 Sol/low 및 42 확인 |
| 두 CLI 분류 실패 | 재작성 없음, 기본 자식 1개가 42, 중복 자식 없음 |
| 두 CLI 별도 deny | 라우팅 재작성 요청과 deny를 함께 관측, 실제 자식 0개·최종 DENIED |

Codex deny 시험의 초기 matcher가 capabilities부터 차단해 판정이 잘못 통과한 사례를 발견했어요. spawn 전용 matcher와 recognized·application_requested 필수 판정으로 바꿔 실제 충돌 시험을 다시 수행했어요. 초기 탐색 결과를 성공 근거로 사용하지 않았어요.

완료된 실제 Decisions 요청은 6회, 기록된 입력 1,551토큰·출력 0토큰, 불명 결과는 0건이었어요. 당시 공식 uncached 입력 단가로 계산한 분류 비용 추정은 $0.0001551이며 실제 청구 조회 결과는 아니에요. CLI 실행 사용량·캐시·구독 사용량과 분리한 값이고 총비용 절감의 증거가 아니에요. [Decisions 공식 가이드](https://developers.openai.com/api/docs/guides/decisions)

PoC 당시 코어·provider·Hook·MCP 회귀는 49건 통과했어요. 이후 공개 준비에서 일반 우선순위·호출별 증거·파일 검사·제품 서버 분리·패키지 검증 회귀를 추가했어요. 현재 상태는 `npm test`로 다시 확인해요. 실제 키 없이 fixture를 실행하는 `npm run poc`도 제공해요.

합성 apply는 알려진 작업과 검증한 launcher 설정에 한정됐어요. 새로운 일반 우선순위 판별은 별도 host evidence 계약을 사용하며, 합성 manifest나 PoC 환경변수는 제품 서버를 활성화하지 않아요. 테스트 전용 서버는 npm 패키지에서 제외해요.

30~50건의 일반 검색·요약·수정·디버깅·보안 검토 평가와 품질·재작업·총사용량 비교는 수행하지 않았어요. 이 작은 산술·연결 시험을 최적 모델·비용 절감·모든 호스트 지원의 증거로 일반화하지 않아요. 공개 준비 회귀에서는 추가 유료 API·실제 에이전트를 호출하지 않았어요.
