# 현재 범위와 잔여 작업

후속 사용자 지시로 [0.1.0 초안](DRAFT_0_1_0.md)을 준비했어요. 아래 AD-001~005의193개/실제11회는 이전 preview 완료 기록이며, 현재 초안의 세 단계 후보·환경변수·공식 설명 캐시의 검증은 초안과 `.release/0.1.0-draft/verification.json`을 확인해요.


2026-11-05 사용자 결정에 따라 **호스트 내부 패치를 보류**하고 기존 **MCP → Decisions → 실행 프로필 추천** 흐름으로 돌아왔어요. 아래 계획이 이전의 “호스트 통합 완료 뒤 평가” 순서를 대체해요. 이후 사용자가 이 ROADMAP의 구현과 필요한 유료 호출을 허용했고, 아래 AD-001~005를 수행했어요. 호스트 패치 보류와 IMP-001 미착수는 유지해요.

## 이번 preview의 목표

사용자가 최소 작업 요약으로 허용된 프로필 추천을 받고, 선택·실행은 기존 호스트에서 명시적으로 하는 추천 전용 preview예요. 추천 자체가 호스트 설정 확인이나 실행 권한을 뜻하지 않아요. 명시 선택은 보존하고 불명확한 자동 적용은 계속 보류해요.

native resolver 패치·broker·원자적 dispatch·영속 spawn 원장은 추천 기능의 출시 전제에서 제외해요. 기존 Hook/apply 코드를 느슨하게 바꾸거나 현재 일반 자동 적용이 가능하다고 표시하지 않아요. IMP-001도 기존 지시대로 미착수예요.

## 이미 구현·검증된 부분

| 범위 | 현재 근거 | 다시 만들 필요가 없는 것 |
|---|---|---|
| 추천 core/provider | 고정 후보·응답 검증, 최소 요약, timeout·오류·예산·동시성·원장·완료 캐시와 unknown 재호출 방지 | 새 분류 엔진·새 provider 계층 |
| 제품 MCP/CLI | stdio 네 도구, CLI recommend, fixture smoke·제품 서버 회귀 | 서버 재작성·native spawn 소유 |
| 진단·패키징 | report MD/JSON, compiled CLI, file allowlist·비밀 검사·설치 archive의 과거 로컬 검증 | doctor/update·자동 installer를 출시 필수로 추가 |
| 실제 API 과거 관측 | 2026-11-03 합성 PoC에서 6회 Decisions 완료 | 일반 업무 품질이나 최신 제품 E2E가 이미 검증됐다고 주장 |

최근 Node 시험 177개에는 제품 회귀뿐 아니라 보류된 host probe 13개와 dispatch reference fixture 20개도 포함돼요. 이를 “177개 실제 API·업무 평가”로 표현하지 않아요. native Rust 관련 40개 시험도 추천 도구의 출시 조건과 분리해요. [기존 관측](POC_RESULTS.md), [검증 범위](VALIDATION.md)를 참고해요.

## 수행한 작업과 완료 기준

| 순서·ID | 작업 유형 | 실제 남은 일 | 완료 기준 |
|---|---|---|---|
| 1 · AD-001 | 완료 · 구현/무료 회귀 | 추천 eligibility와 Hook 자동 적용용 host evidence 조건 분리 | 일반 추천이 허위 host 검증 선언 없이 동작하고, pins·잘못된 입력은 보존. Hook의 미검증 입력은 계속 재작성하지 않음 |
| 2 · AD-002 | 완료 · 문서/예제/CLI help | 작업 요약·후보·제약을 넣는 추천 요청과 결과/오류 예제, MCP 수동 사용, fixture→Decisions 전환 안내 | README에서 fixture 추천 재현 가능. 키를 JSON/인자에 넣지 않고 provider·private ledger를 준비할 수 있음 |
| 3 · AD-003 | 완료 · 무료 조합/실제 연결 | provider→Router의 usage 계약을 먼저 fixture로 확인하고, 공식 API 계약·분류 모델/후보를 확인한 뒤 최신 src/server.ts에서 3~5개 비민감 요약으로 Decisions 경로 확인 | 허용 응답·usage/지연, 같은 ID의 완료 결과 재사용, 안전한 실패 동작을 기록. mock·과거 PoC와 구분 |
| 4 · AD-004 | 완료 · 초기 평가 | 5~10개 작은 업무의 추천을 사전 기준과 비교 | 추천 적합/과도/부족/보류와 이유, 관측한 분류 usage·지연을 기록하고 개선 여부 판단 |
| 5 · AD-005 | 완료 · 수동 전달/릴리스 검증 | 수동 source/compiled archive 설치 안내, 최신 artifact·CLI·config·report·MCP 확인 | 추천 preview 지원 범위·제약이 명확하고 archive가 현재 코드/문서와 일치 |

AD-001은 `Router.advise`로 직접 추천을 분리해 해결했어요. 후보/제약은 생략할 수 있고 legacy provenance flag는 권한 근거로 사용하지 않아요. 기존 `Router.recommend`는 Hook용 엄격한 gate와 과거 digest를 그대로 유지해요. 같은 원장에서 advisory와 Hook이 같은 ID를 다른 용도로 쓰면 충돌하며 unknown 요청 재호출을 허용하지 않아요. 새 core 12건과 제품/CLI/조합 3건의 무료 회귀로 확인했어요.

현재 일반 사용자의 추천 진입점은 recommend_agent/CLI recommend예요. 기본 shadow Hook은 원래 인자를 유지하는 {}를 반환하며 추천 결과를 보여주는 UI가 아니에요. task 요약만 추가해도 기존 host evidence gate가 해제되지는 않아요.

AD-002는 AD-001에서 확정한 계약으로 작성해요. 현재 동작하지 않는 미래 요청 형식을 지원 예제로 공개하거나, 동작시키기 위해 검증되지 않은 provenance를 true로 적으라고 안내하지 않아요. Claude generated config와 두 examples는 fixture provider를 명시해요. Codex generated config는 ROUTER_PROVIDER를 env_vars로 전달하고 미지정이면 runtime 기본값 fixture를 사용해요. 실제 API 전환 시 각 설정과 ledger를 함께 확인해야 해요. 원장 lock·crash 후 복구 안내도 제공하되, unknown 요청을 새 ID로 다시 부르거나 원장을 비워 회피하지 않도록 해요. stale lock 처리는 기존 프로세스 종료 여부를 먼저 확인하는 절차로 설명하며 자동 삭제 기능을 출시 필수로 추가하지 않아요.

AD-003에서는 provider와 Router를 붙여 full/missing/partial usage를 먼저 무료로 검증해요. 현재 provider는 부분 usage를 반환할 수 있지만 Router는 완전한 usage만 받아요. 이것은 확인할 호환성 지점이지 실제 API 오류가 확정됐다는 뜻은 아니며, 공식 계약과 조합 시험 결과에 따라 필요한 경우에만 수정해요.

AD-003의 3~5개는 연결 확인용이에요. 정상 입력·보류가 적절한 입력과 완료 ID 재조회를 포함하고, 인증/429/timeout 등 장애는 이미 있는 mock 회귀를 우선 활용해요. 같은 ID 조회는 같은 입력·정책·원장으로 해야 해요. unknown 요청은 새 ID로 자동 재호출하지 않아요. 최신 제품 MCP의 live 기록이 없다는 점을 과거 PoC로 대신 채우지 않아요.

AD-004는 우선 추천 결과의 유용성을 판단하는 작은 평가예요. 실제 child 실행이나 기본 모델과의 총비용·품질 비교는 별도 실행 범위와 예산을 정한 경우에만 해요. 작은 추천 평가를 모델 실행 성공·비용 절감의 증거로 일반화하지 않아요. 30~50개 확대 평가는 필요성이 확인된 뒤 선택해요.

AD-003/004를 실행하기 전 요약 내용·호출 수·시간·금액 한도·키 주입을 정해야 해요. 기존 원장 가드는 실제 청구 상한이나 새 평가 예산 승인이 아니에요. 이번 실행은 이후 사용자가 허용한 구현·필요 유료 호출 범위로 진행했어요. 고정 corpus와 ID로 최대 11개 분류, 호출당 10초, 추정 예약액 합계 $0.11 이내로 제한했고 실제 분류는 11회·unknown 0건이었어요. native 자식 실행은 하지 않았어요.

## 완료 근거와 전달물

- AD-001: `src/core.ts`, `src/server.ts`, `bin/aptly.ts`와 `test/advisory-{core,flow}.test.ts`. Hook 미검증 재작성 불가·pins 보존·원장 용도 충돌을 포함해 Node **193/193**, typecheck/build, fixture smoke 통과예요. 193개는 실제 API/업무 평가 횟수가 아니에요.
- AD-002: [사용 안내](ADVISORY_USAGE.md), Codex/Claude의 최소 JSON 예제와 recommend --help를 source/compiled CLI 및 설치 package에서 재현했어요. 사용 안내는 npm의 닫힌 파일 allowlist에 정확한 파일 하나로 동봉했어요.
- AD-003/004: [현재 실제 연동·평가](ADVISORY_RESULTS.md), [공개 결과 JSON](ADVISORY_RESULTS.json), [사전 고정 corpus](../test-support/advisory-evaluation-cases.json). 실제 smoke 3/3, 초기 기대 범주 8/8, 입력 2,959토큰·출력 0, 프로세스 재시작 전후 cache 재사용 확인이에요. 작은 합성 평가이며 실제 모델 실행 품질·총비용 비교가 아니에요.
- AD-005: 현재 전달 후보는 `.release/advisory-preview-20261105/`의 source tar.gz·compiled npm tgz·manifest/검증 metadata예요. 깨끗한 source 설치와 별도 npm 설치에서 예제·CLI/config/report·MCP 네 도구를 확인해요. 공개 게시·전역 설치·운영 설정 변경은 하지 않아요.

source archive는 검토 가능한 전체 공개 소스와 **보류 표시한 연구 기록**을 함께 보존해요. 호스트 연구가 추천의 설치 전제라는 뜻은 아니에요. npm에는 그 patch·연구용 코드·private 자료를 넣지 않고 compiled 제품·예제·사용 안내만 포함해요. 최종 파일 목록과 hash는 위 전달 후보의 manifest를 기준으로 확인해요. 기존 `.release/` 상위 archive는 과거 checkpoint로 보존해요.

## 보류·선택 항목

| 항목 | 상태·재개 조건 |
|---|---|
| 호스트 내부 provenance capture와 관련 Rust 개발 빌드 | 사용자 지시로 보류. 소스·patch·검증 기록을 보존하고 추가 구현/시험/운영 설치는 명시적 재개 때만 진행 |
| host probe·새 resolver/dispatch 계약·broker·revision·영속 spawn 원장 | 보류한 확장 연구. 현재 추천 작업의 다음 단계나 선행 조건이 아님 |
| 일반 native 자동 적용 | 현재 지원한다고 주장하지 않음. 기존 보수적 유지 동작 보존 |
| IMP-001 사용자 정책/환경변수 확장 | 기록만 유지, 미착수 |
| 자동 설치·제거·doctor/update·전역 설치·원격 호스팅 | 현재 preview의 필수 작업에서 제외 |
| GitHub 공개·원격 CI·npm 게시 | 대상·계정·identity·지원 범위를 정한 뒤 실제 요청에 따라 별도 진행. 현재 private:true 유지 |

보류 자료는 [호스트 설계](HOST_INTEGRATION.md), [계약](HOST_DISPATCH_CONTRACT.md), [소스 지도](CODEX_SOURCE_MAP.md), [Rust 패치](CODEX_PROVENANCE_PATCH.md)에 남아 있어요. 파일이나 시험을 삭제하지 않았으며 과거 성공 기록도 보존해요. 현재 추천 사용 흐름의 안내에서는 이 연구를 필수 설치 단계로 제시하지 않아요.
