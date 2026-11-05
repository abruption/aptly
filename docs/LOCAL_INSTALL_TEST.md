# 0.1.0 로컬 설치 시험

2026-11-05, `.release/0.1.0-draft/aptly-0.1.0.tgz`를 SHA-256 확인 후 프로젝트 전용 위치에 실제 설치했어요. 임시 설치 검증과 달리 이 설치본은 이후 사용을 위해 보존해요. 버전은0.1.0, 설치는 offline/ignore-scripts로 수행했고 전역 PATH·기존 MCP 등록·호스트 설정은 변경하지 않았어요.

## 로컬 실행

프로젝트 루트에서 다음 launcher를 사용해요.

```sh
./.local/bin/aptly --version
./.local/bin/aptly catalog
ROUTER_PROVIDER=fixture ./.local/bin/aptly recommend < examples/recommend.codex.json
```

실제 설치 위치는 `.local/installations/aptly-0.1.0-draft/`예요. `mcp.claude.json`·`mcp.codex.toml` 등록 조각도 이 위치에 준비했지만 실제 호스트 설정에 설치하지 않았어요. 키를 조각에 넣지 않았고 실제 Decisions 환경은 별도로 주입해야 해요.

## 확인한 것

무료 검사16개 그룹이 모두 통과했어요. 기본6개/요청 effort, 후보 필터·별칭·비활성화·설정 오류, pins·맥락 부족, compiled MCP4도구·cache·미검증 Hook 유지, report·config·실제 공식 설명 refresh·fresh/stale/invalid cache 처리를 포함해요. 실제 모델·native 자식 실행은 하지 않았어요.

설치된 compiled 서버에서 비민감 입력6개를 실제 Decisions에 보냈고6개 모두 허용된 추천을 반환했어요. 동일 ID와 서버 재시작 후 cache 재사용, 추가 호출 없음, unknown0을 확인했어요. 기대 범주는 호출 전에 고정했으며 결과5/6이 일치했어요. 입력3,034토큰·출력0이고 실제 청구는 조회하지 않았어요.

| 사례 | 기대 | 실제 추천 | confidence |
|---|---|---|---|
| codex-simple | codex-simple | codex-simple | 0.94 |
| codex-routine | codex-routine | codex-simple | 0.16 |
| codex-deep | codex-deep | codex-deep | 0.94 |
| claude-simple | claude-simple | claude-simple | 0.99 |
| claude-routine | claude-routine | claude-routine | 0.76 |
| claude-deep | claude-deep | claude-deep | 0.99 |

## 발견한 보완점

일반적인 Codex 번역 검토는 예상한 Terra/high 대신 Luna/max를 confidence0.16으로 선택했어요. 현재 구현은 낮은 confidence라고 자동 보류하지 않기 때문에 이 응답도 그대로 추천돼요. API 연결·후보 범위·모델/effort 매핑은 정상이나 등급 분류와 낮은 confidence 처리 정책은 추가 조정 여지가 있어요. confidence를 정답 확률로 단정하거나, 이 작은 표본으로 작업 수행 품질/비용을 일반화하지 않아요.

이번에는 이 차이를 맞추기 위해 prompt·기본값·threshold를 바꾸거나 새 ID로 반복 호출하지 않았어요. 후보에 없는 모델·권한 변경·native 실행도 없었어요. 같은 원장의 완료/unknown 보존 규칙을 유지했어요.

공개 [시험 JSON](LOCAL_INSTALL_TEST.json)은 허용 metadata와 비민감 합성 사례만 포함해요. private 원장과 원본 실행 결과는 `.local/local-tests-v010-20261105/`에 남겨 공개하지 않아요. 앞선 패키지 초안의226개 회귀/설치 검증과 이번 실제 로컬 설치 후 시험을 구분해요. 기존 archive는 변경하지 않았어요.
