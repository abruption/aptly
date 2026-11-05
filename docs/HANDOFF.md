# Aptly 전환을 위한 상세 세션 인계

## 공개 소스 저장소 — abruption/aptly

사용자가 공개 저장소 생성과 소스 push를 명시적으로 승인했어요. 개인 GitHub 계정과 작성자 정보를 확인하고 [abruption/aptly](https://github.com/abruption/aptly)를 공개 저장소로 생성했어요. 로컬 기본 브랜치는 main이며 작성자 identity는 이 저장소에만 지정했고 전역 Git 설정은 변경하지 않았어요. package.json의 repository/homepage/issues 주소를 실제 저장소로 설정했으며 npm `private:true`와0.1.0 버전은 유지해요. 이번 승인은 소스 공개와 해당 CI 확인 범위이고 npm 게시·릴리스 태그·계정 설정 변경으로 확대하지 않아요.

공개 후보는 Git 제외 규칙과 소스 허용 목록으로 검사해111개 파일을 선정했어요. `AGENTS.md`·개인 실행 래퍼·원본 증거·자격 파일·node_modules·dist·로컬 report·release archive는 제외해요. 보류한 호스트 연구 자료는 설명과 upstream LICENSE/NOTICE를 포함한 보존 자료로 구분해요. 원격 CI의 최신 결과는 [Actions](https://github.com/abruption/aptly/actions)에서 확인하고, 소스 공개·CI 성공·npm 게시 성공을 별도로 기록해요. 아래의 Git 미초기화·원격 미생성 문구는 이전 checkpoint예요.

## 최신 CI 준비 — npm OIDC와 Git 제외 규칙

사용자 지시로 npm OIDC 배포 CI와 `.gitignore`를 준비했어요. `.github/workflows/publish.yml`은 `workflow_dispatch`의 release_tag/dry_run 입력을 사용하며 기본값은 검증·pack만 하는 dry run이에요. OIDC 권한은 `npm` environment의 publish job에만 있고, 준비 job에서 검증한 archive를 immutable source SHA와 artifact ID로 전달해 SHA-256·내부 package metadata·태그·저장소를 재검증한 뒤 게시하도록 구성했어요. npm 장기 token fallback과 lifecycle script 실행은 사용하지 않아요. 안정 버전 latest/프리릴리즈 next를 명시해요.

새 `scripts/publish-check.ts`와 무료 회귀는 Node24/npm11.5.1 이상, tag/version/HEAD/eventSHA, 공개 repository와 package metadata, OIDC 환경, token/프로젝트 npmrc 혼입, archive 변조 등을 검사해요. SHA 검증은 tar 파싱 전에 수행해 Mac/GNU tar 오류 차이를 피했어요. 현재 `private:true`와 저장소 metadata 미확정은 유지했으며 dry run만 허용하고 실제 게시 모드는 선행 조건에서 중단해요. 실제 사용 전 release commit에서 공개 설정을 확정하고 npm Trusted Publisher의 실제 owner/repository·`publish.yml`·environment `npm`·Allow npm publish를 연결해야 해요. `docs/RELEASING.md`에 실행·연결·최초 등록 확인 범위를 정리했어요.

기존 `ci.yml`에는 자동 setup 제외와 fixture MCP smoke를 추가했어요. `.gitignore`에는 기존 개인 자료 제외에 더해 로컬 aptly-local 설치, npm 캐시·coverage·TypeScript 산출물·OS/편집기 파일·auth.json·Claude 개인 설정을 정비했고 공개 README/guide·package-lock·워크플로·.env.example은 추적 가능해요. 초기59개·추가12개 표본을 고립 Git fixture에서 검사했으며 프로젝트 Git을 초기화하지 않았어요.

최종 무료 **277/277**, 타입·빌드·fixture MCP smoke·release 검사155/54, 공식checksum 검증 actionlint1.7.12의 두 workflow 검사, 실제 npm pack을 사용한 고립 Git dry-run과 변조/비공개 게시 차단을 통과했어요. 실제 GitHub 원격 실행·OIDC 교환·npm 게시·계정 설정·원격 생성·push는 수행하지 않았고 green remote CI라고 주장하지 않아요. 근거는 `.release/npm-oidc-ci-20261105/verification.json`과 같은 디렉터리의 검사 기록이에요.

## 최신 문체 기준 — session-peer PR #374

사용자 요청으로 [abruption/session-peer PR #374](https://github.com/abruption/session-peer/pull/374)의 번역본 전체와 diff를 읽고, 확인한 head `40864f0d947262def4f261caa15e3e677d184d28`의 어투를 사용자용8개 문서에 적용했어요. 한국어 정본 README·가이드는 해요체에서 **합니다/입니다·하십시오**체로 바꿨어요. 일본어는 **です/ます・ください**, 중국어 간체는 중립 설명·**请** 지시문, 영어는 간결한 설명과 직접 지시 문체를 유지·정비했어요. 직역된 용어는 풀어 설명하고, 추천/실행/권한/지원 범위가 뜻하는 바를 명확히 했으며 타 저장소 기능은 가져오지 않았어요. 채팅의 결과 보고 해요체 원칙과 문서의 격식체는 구분해요.

서브에이전트가 한·중·일 문서를 나눠 수정했고 영어는 주 에이전트가 통합했어요. 모든 README45줄·가이드190줄을 유지하고, 변경 전과 코드 블록·인라인 식별자·숫자·제목·링크 대상의 정확 일치를 확인했어요. `gemini-3.8-flash-medium`(medium effort)의 독립 어투/번역 검수는8개 문서 모두 확인해4언어 PASS·필수 수정0·warnings0을 반환했어요. 실제 문서와 대조해 선택적 제안7건을 반영한 뒤 기술/링크/패키지 검사를 다시 통과했어요. 선택적 다듬기 후 모델 재검수는 반복하지 않았어요.

새 후보와 최종 검증은 `.release/pr374-tone-20261105/`에 보관해요(54개 npm파일, archive 바이트 일치). 비교 전 문서·PR참조본·원본검수는 private `.local/documentation-tone-pr374/`예요. 제품 코드·설정·런타임을 변경하지 않아 제품 회귀는 재실행하지 않았고, registry 게시·PR/원격 수정·설치도 수행하지 않았어요. 이전 다국어 검수·archive는 당시 checkpoint로 보존해요.

## 최신 문서 개편 — 한국어 정본과 4개 언어

사용자 지시로 서브에이전트를 활용해 `abruption/session-peer`·`abruption/dots-tailscale`의 실제 README를 읽고, 언어 선택·짧은 빠른 시작·상세 가이드 연결 구조를 참고했어요. 한국어 `README.md`를 정본으로 188줄에서45줄로 축소했고 `README.en.md`·`README.zh-CN.md`·`README.ja.md`를 추가했어요. 설치·Hook·직접 추천·모델/환경변수·맥락 전달·비용 실측·진단은 언어별 `docs/guide/ko.md`·`en.md`·`zh-CN.md`·`ja.md`(각190줄)로 연결해요. 언어 선택은 문서 범위이며 CLI/MCP 출력 국제화를 구현한 것은 아니에요. 기존 개발·과거 연구 문서는 보존했어요.

별도 서브에이전트가 npm files와 release 검사 허용 목록을 갱신해 README4개·가이드4개를 포함하면서 비공개/예상 밖 경로 차단을 유지했어요. 관련 회귀14개·strict typecheck/build·문서 링크/앵커/코드블록/JSON/모델/실측 수치 검사·release 검사150/54를 통과했어요. 전체 제품 회귀를 이번 문서 변경에서 다시 실행했다고 주장하지 않아요. 패키지는 `.release/multilingual-docs-20261105/`에 별도 생성했으며54개 파일의 실제 archive 바이트 일치도 확인했어요. 호스트 설정·제품 실행 코드·의존성·버전/private 정책은 변경하지 않았고 registry 게시·재설치는 하지 않았어요.

요청한 Antigravity CLI `gemini-3.8-flash`는 설치된 실제ID `gemini-3.8-flash-medium`(medium effort)으로 독립 검수했어요. 첫 파일 기반 호출은 응답 형식 때문에 검수 완료를 확인하지 못했고, 문서 전문을 직접 제공한 읽기 전용 plan/sandbox 호출에서8개 문서를 모두 검토하고4언어 PASS·필수 수정0·warnings0을 받았어요. 권한 우회 flag를 사용하지 않았으며 snapshot/source 불변을 확인했어요. 실제 문서와 대조해 선택적 표기/문장 개선5건을 반영하고 기술 검사를 다시 통과했어요. 선택적 다듬기 후 별도 모델 재검수는 하지 않았어요.

원본 독립 검수는 private `.local/documentation-review-20261105/inline.json`, 공개용 요약·hash·패키지 manifest·최종 검증은 `.release/multilingual-docs-20261105/`에 있어요. 이후 사용자 문서 변경은 한국어 정본과3개 번역을 함께 동기화해요.

## 최신 재시험 — GitHub 저장소·파일 URL 추가 컨텍스트

사용자가 저장소 경로도 제공해 재시험하라고 요청했어요. 현재 자동 Hook에는 별도 평문 URL 필드가 없어, **기존 recommend_agent MCP에 컨텍스트를 명시 → 추천 프로필을 native 인자로 전달**하는 경로임을 먼저 알리고 진행했어요. Hook의 URL 전달 기능을 구현·검증한 결과로 표현하지 않아요. 제품 코드·호스트 설정은 바꾸지 않았어요.

기존 작업명 요약에 저장소와 고정 커밋의 README.md/README.ko.md URL만 추가한3회, 여기에 직접 읽은 문서의 크기·줄 수·작업 범위 요약도 추가한3회가 모두 **codex-routine(Terra/high)**을 추천했어요. 파일은 공개 raw 고정 커밋과 로컬 사본의 바이트/hash 일치를 확인했어요. 우리 provider는 URL을 GET하지 않으므로 URL을 보낸 것을 Decisions가 문서를 열람했다는 증거로 사용하지 않아요.

사전에 정한 URL+요약 조건의 추천3회를 native 자식에 명시 적용했고 실제 context에서 Terra/high를 확인했어요. 문서·자식 작업 지시는 이전과 동일하고, 세 실행 모두 문서 전체 읽기·원문 인용 일치·수정안6개 형식을 통과했어요. 이전 Sol/high3회를 기준군으로 재사용했으며 동시 새 기준군은 아니에요.

검토 자식+한 번의 분류비를 공식 Standard API 단가로 환산하면 회당평균 **$0.0135435** 대 기존Sol **$0.0322873**으로 **58.05% 낮았어요**. 입력을 전부 비캐시로 환산하면 **$0.0536309** 대 **$0.1125433**, **52.35% 낮았어요**. 분류비는 URL만621토큰/$0.0000621, URL+요약756토큰/$0.0000756이며 총6회의 분류 환산 합계는$0.0004131이에요. 독립 품질 동등성·통계적 유의성·구독 실청구/한도 차감은 측정하지 않았어요. 메인/조사·컨텍스트 수집·요약 준비 비용은 제외했으므로 전체 파이프라인의 순절감률로 승격하지 않아요.

새 보고서·JSON은 `.release/readme-repository-context-20261105/`, 고정 계획·각분류응답·native 관측·수정안은 `.local/benchmarks/readme-repository-context-20261105/`예요. 이전 자동Hook 작업명만3회보류 결과와 비용 보고서는 보존해요.

## 최신 실측 — README 번역 검토 비용 비교

사용자 요청으로 session-peer의 기존 고정 커밋 `6e9efda7588e1df638748eeb7ad1b2707e0a3bf4` 영어·한국어 README(합계17,964바이트)를 사용해 현재 대화에서 새 자식6회를 실행했어요. Sol/high 명시3회와 Aptly Hook 기본값3회이며, 같은 지시·문서로 각각 수정안6개를 작성했어요. 원본·복사본 불변, 문서 전체 읽기, 인용 일치·출력 형식을 확인했어요. 본문을 수정하지 않았고 제품 코드·호스트 설정도 변경하지 않았어요.

**Aptly3회 모두 Decisions가 needs_context로 보류해서 실제 자식은 전부 Sol/high였어요. 모델 전환에 따른 절감은 확인되지 않았어요.** 현재 Hook은 암호문 대신 구체적인 작업명만 분류에 제공했어요. 분류는 각514입력토큰·출력0이며 Standard 환산비는 회당$0.0000514예요.

실측 native토큰에 공식 Standard API 단가를 적용하면 평균 Sol고정$0.0322873, Aptly(분류 포함)$0.0289831로 명목10.23% 차이가 났어요. 캐시 차이를 제거해 모든 입력을 비캐시로 환산하면 $0.1125433 대 $0.1119954, 차이0.49%예요. 같은 모델의 캐시·입력·출력·추론 생성량 변동을 Aptly 모델 선택의 인과적 절감으로 표현하지 않아요. 추론은 output_tokens에 포함돼 중복 합산하지 않았고 캐시 쓰기는 전 실행0이에요. 구독 청구·실제 한도 차감은 조회하지 않았으며 메인 에이전트의 조사 비용은 비교에서 제외했어요. 독립 품질 동등성 평가도 아니에요.

보고서는 `.release/readme-cost-20261105/report.html`·`summary.json`, private 원본 측정·출력·고정 계획은 `.local/benchmarks/readme-cost-20261105/`예요. 고립 app-server 실행의 preflight2회는 모델/분류 호출 전에 중단됐고 실측에서 제외했어요. 대체 측정은 이 현재 대화의 활성 native Hook에서 실제 수행했어요. 새로운 유료 분류는3회이며 제품 무료264개 회귀의 수치는 별개예요.

## 최신 후속 상태 — Codex 신뢰 승인과 native 적용 확인

사용자가 Codex 재시작을 완료한 뒤 **현재 대화 세션에서도** 모델·effort를 생략하고 구체적인 task_name과 fork_turns:none으로 새 자식을 한 번 호출했어요. 명시적인 recommend_agent 호출 없이 Hook이 실제 Decisions를 1회 호출했고, 원장의 codex-simple·자식 native turn context의 gpt-6-luna/max·정렬 결과를 확인했어요. 현재 세션의 MCP 갱신 확인을 마쳤으며 재연결 대기는 해소됐어요. 후속 공개 근거는 `.release/0.1.0-hooks-diagnostics/restart-verification.json`, private 관측은 `.local/runtime/aptly-auto-hooks/codex-restart-observation.json`이에요. 아래의 재연결 필요 문구는 보완 전 서버에 대한 당시 안내예요.

사용자가 Codex Hook 신뢰 승인을 완료했어요. 승인 후 native 점검에서 메시지가 암호문으로 Hook에 전달되는 환경을 확인해, 작업 맥락 부족으로 원래 모델을 유지하던 원인을 찾았어요. 호스트 패치·해독·승인 우회 없이 `src/automatic-hook.ts`에 구체적인 평문 `task_name`만 사용하는 제한된 fallback을 추가했어요. snake_case 여섯 부분·24바이트·세 영문 단어 이상을 요구하고, 요약에 출처와 본문 미확인을 표시해요. 암호문은 분류 제공자에 전송하지 않으며 원래 native 메시지를 보존해요. 짧거나 잘못된 이름·누락된 본문·명시 선택·fork·resume 보호는 유지해요.

제품 `get_routing_capabilities.automatic_hook.last_result`에는 해당 MCP 프로세스의 마지막 적용/보존 사유를 메모리에만 보관해 제공해요. 본문·경로·설정 값은 반환하지 않아요. `null`은 처리 기록이 없다는 뜻이고, 필드 자체가 없으면 이전 서버가 실행 중일 수 있어요. 패키지 갱신 후 실행 중인 MCP는 재연결하거나 호스트를 재시작해 새 코드를 읽게 해야 해요. Hook 정의를 바꾸지 않아 기존 신뢰 승인은 유지했어요.

무료 **264/264**, strict typecheck/build·fixture MCP smoke·release 검사143/47을 통과하고 `.release/0.1.0-hooks-diagnostics/`의 새 npm 후보를 같은 로컬 prefix에 재설치했어요. Codex의 정상 app-server native 세션에서 Hook trusted/enabled·MCP connected를 먼저 확인한 뒤, 모델·effort 생략과 `fork_turns:none`, `task_name:sort_supplied_numbers_3_1_2_ascending_without_tools`로 호출했어요. **실제 Decisions 1회 → codex-simple → 자식 gpt-6-luna/max → 정렬 결과**를 native turn context와 원장에서 확인했어요. 신뢰 우회는 없었어요. 이전 Claude Haiku native 성공과 합쳐 두 호스트의 지원 경로를 확인했지만, 임의의 작업 이름·모든 세션·총비용 절감을 인증하지 않아요.

private 근거는 `.local/runtime/aptly-auto-hooks/codex-app-native-verified.json`과 같은 디렉터리의 진단 기록이에요. 그 전의 기존 대화 세션·standalone exec 점검은 경유 실패로 보존해요. 일부 standalone exec에서 Aptly 도구가 노출되지 않는 현상은 해당 실행의 제한으로 남기며, app-server 경로 성공으로 소급해 성공 처리하지 않아요. 이전 hooks-draft archive·검증은 당시 checkpoint로 보존해요. 아래의 Codex 미검증/승인 대기 문구는 이 후속 작업 전 이력이에요.

## 최신 후속 상태 — npm 자동 Hook 등록과 로컬 재설치

2026-11-05 후속 사용자 지시로 npm `postinstall` → `aptly setup --automatic`을 구현했어요. 현재 설정이 있는 Claude Code·Codex에 MCP와 서브에이전트용 PreToolUse Hook을 등록하며 기존 설정·인증 래퍼·다른 Hook을 보존해요. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`, CI·`APTLY_SKIP_SETUP=1`·npm `--ignore-scripts`를 지원해요. `aptly setup`과 소유 항목만 제거하는 `aptly remove`도 추가했어요.

사용자는 **모델·effort를 명시하지 않은 새 일반 서브에이전트의 기본값만 자동 선택**하는 정책을 명시 승인했어요. `src/automatic-hook.ts`는 private operator 정책으로 Router.advise를 사용하며 전체 host evidence를 확보했다고 선언하지 않아요. 명시 model/effort·고정 역할·fork/이력·resume은 유지하며 Codex는 `fork_turns: none`만 대상이에요. 기본값 재작성은 Decisions provider에서만 가능하고 fixture·실패·취소·변경된 호출은 유지해요. 기존 엄격한 host evidence 경로와 호스트 내부 패치 보류는 유지해요.

무료 회귀 **262/262**, strict typecheck/build·fixture MCP smoke·release 검사(소스143개·npm47개)를 통과했어요. compiled lifecycle을 mock home에서 시험했고 실제 로컬 npm 재설치, 두 호스트 등록, 재실행 멱등성, 다른 설정 보존을 확인했어요. 기존 Codex MCP의 장치 전용 자격 래퍼를 유지하고 Claude에도 같은 메모리 주입 경로를 등록했으며 키 값을 설정·패키지·로그에 저장하지 않았어요.

등록된 두 MCP에 최소 Hook 이벤트를 전달한 실제 Decisions 분류 **2회**에서 Codex Luna/max·Claude Haiku 재작성 응답과 cache·재시작 후 재사용·명시 모델 보존을 확인했어요. 이 두 회는 native Hook dispatch 시험이 아니에요. 별도 Claude Code 2.1.314의 실제 Agent **1회**는 부모 Sonnet·모델 인자 생략 → Hook/MCP/Decisions claude-simple → 자식 `claude-haiku-5-5` 실행·정렬 결과를 확인했어요. 이 작업의 유료 분류는 합계3회이며 품질·총비용 절감 평가가 아니에요.

Codex 0.166.0 Hook은 현재 계정의 CODEX_HOME에 등록됐지만 **native 자식 적용은 미검증**이에요. 사용자는 설치 전에 시작한 현재 세션의 `/hooks` 목록에 Aptly가 없다고 회신했어요. 세션 시작과 등록 시각·활성 경로 일치를 확인했고, 같은 계정의 Codex를 재시작한 뒤 `/hooks`에서 정확한 정의를 검토·신뢰 승인하는 단계가 남아 있어요. 신뢰 hash·관리 정책을 수정하거나 승인 우회 flag를 사용하지 않았어요. 설치 완료를 현재 세션의 활성화 완료로 표현하지 않아요.

이번 후보는 `.release/0.1.0-hooks-draft/`, private 설치·MCP·native 결과는 `.local/runtime/aptly-auto-hooks/`예요. 기존 `.release/0.1.0-draft/` 등 과거 checkpoint는 보존해요. 로컬 설치 prefix는 기존 `.local/installations/aptly-0.1.0-draft`를 재사용했어요. 아래 이전 기록의 수동 추천 전용 범위는 이번 명시 지시로 확장됐어요. npm registry·원격 게시·전역 설치는 하지 않았어요.

## 최신 후속 상태 — 0.1.0 패키지 초안

사용자 요청으로 [0.1.0 초안](DRAFT_0_1_0.md)에 세 단계 기본값(Claude Haiku/Sonnet/Opus, Codex Luna/max·Terra/high·Sol/medium), JSON 문자열 후보 환경변수, 공식 Markdown 명시 갱신·7일 cache를 구현했어요. 버전은0.1.0/private:true이며 `.release/0.1.0-draft/`가 이번 전달 후보예요. 이전 preview archive는 덮어쓰지 않아요.

무료 시험226개·strict typecheck/build·fixture MCP smoke·release 검사와 공식 문서 refresh8 facts가 통과했어요. 최종 archive 설치 결과는 해당 후보의 verification.json을 기준으로 확인해요. 새 모델별 품질/비용/실제 native 적용은 평가하지 않았고 추가 유료 분류·child 실행도 하지 않았어요. host 내부 패치 보류는 유지하고 IMP-001은 이번 후보 배열만 반영했어요. 강제 덮어쓰기·제외 목록·제외 경로는 미착수예요.

과거 원장의 정확한 이전4/current8 tuple은 보관·로딩할 수 있도록 했지만, 새 요청의 캐시 재사용은 현재 후보/설명 version·전체 tuple·digest로 검증해요. unknown 기록을 지우거나 새 ID로 자동 재호출하지 않아요. 아래193개/실제11회 기록은 이전 preview 카탈로그의 이력이에요.

---


## 현재 상태 — 추천 preview AD-001~005 실행

사용자가 ROADMAP 구현과 필요한 유료 호출을 허용해 AD-001~005를 수행했어요. **호스트 내부 패치와 IMP-001은 계속 보류/미착수**이며 재개하지 않았어요. 현재 상세 근거는 [ROADMAP](ROADMAP.md), [사용 안내](ADVISORY_USAGE.md), [실제 연동·평가](ADVISORY_RESULTS.md)에 있어요. 아래의 이전 조사·Rust 작업 기록은 과거 이력이에요.

직접 추천은 Router.advise를 통해 host 검증 선언 없이 사용하며 caller-declared pin은 보존해요. 기존 Router.recommend의 Hook gate와 digest는 유지했고 advisory는 같은 원장 안에서 다른 digest 용도로 분리했어요. provider/Router의 누락·부분 usage는 무료 회귀로 안전한 유지 동작을 확인했어요.

현재 Node 무료 회귀 **193/193**, 타입·빌드·fixture MCP smoke·release 검사를 통과했어요. 실제 제품 MCP에서 비민감 smoke3회와 초기 평가8회, 합계11회 Decisions를 완료했고 unknown0, 입력2,959토큰/출력0, 동일 ID cache·서버 재시작 후 재사용을 확인했어요. 초기 평가 기대 범주는8/8 일치하지만 실제 자식 실행·전체 업무 품질·총비용 절감의 검증이 아니에요. corpus는 호출 전에 고정했고 실제 청구는 조회하지 않았어요.

전달 후보는 `.release/advisory-preview-20261105/`에 source·npm archive와 hash/검증 manifest를 남겨요. `.local/advisory-validation-20261105/`는 private 원장·실행 결과이며 공개하지 않아요. 기존 자격 wrapper는 메모리/서버 환경 주입에만 사용하고 키를 파일·로그에 저장하지 않았어요. 운영 CLI·호스트 설정·원격 저장소·npm 게시는 변경하지 않았어요.


---


기록일: **2026-11-05 KST**. 같은 날 Aptly 경로 재개와 브랜딩 전환 지시를 반영했어요. 새 경로에서 연 Codex가 이전 대화 없이 이어갈 수 있도록 현재 파일·검증 메타데이터·사용자 결정을 정리했어요. 이 문서는 작업 폴더를 기준으로 상대 경로를 사용해요.

## 새 세션이 가장 먼저 확인할 것

1. 현재 디렉터리의 `AGENTS.md` → 이 문서 → [README](../README.md) 순서로 읽어요.
2. `pwd`와 실제 파일을 확인해 현재 폴더가 기준 경로임을 확정해요. 예전 경로로 돌아가거나 다른 사본을 기준으로 작업하지 않아요.
3. **현재 작업 폴더는 `Aptly`이고, 사용자 요청에 따라 표시명 `Aptly`, 패키지·CLI·MCP 식별자 `aptly`로 전환했어요.** 이전 폴더·제품 식별자는 `subagent-decisions`였어요.
4. 현재 소스 진입점은 `bin/aptly.ts`, compiled 진입점은 `dist/bin/aptly.js`예요. 과거 archive·report·PoC 증거는 원래 이름을 보존하며 현재 빌드로 재사용하지 않아요.
5. [개선과제 IMP-001](BACKLOG.md)은 **기록만 하라는 사용자 지시**예요. 인계를 받았다는 이유로 즉시 구현하지 않아요.
6. 현재 사용자 지시 순서는 위 **AD-001~005**예요. 이전의 브랜딩 → 호스트 통합 → 평가는 과거 계획이며 대체됐어요. 공개 준비를 원격 생성·push·npm 게시·전역 설치 승인으로 확대하지 않아요.

현재 폴더 전체를 이동하면 Git에서 제외한 `AGENTS.md`, `.local/`, `.poc/`, `.release/`도 같이 이동해요. 공개 소스 archive나 Git 파일만 옮기면 로컬 지침·원본 증거·개인 래퍼는 포함되지 않아요. `AGENTS.md`는 사용자가 명시적으로 `.gitignore`와 공개 archive에서 제외하도록 요청했어요.

## 사용자 결정과 요청 이력

| 항목 | 현재 결정·상태 |
|---|---|
| 제품 목적 | Claude Code와 Codex 공통의 서브에이전트 실행 프로필 추천 MCP예요 |
| 분류 제공자 | 우선 OpenAI Decisions API 하나, 사용자 OpenAI API 키 사용 |
| 실제 실행 | 각 호스트의 기존 인증·native spawn을 사용해요. MCP가 자식을 직접 실행하지 않아요 |
| 현재 흐름 | MCP/CLI 추천 → Decisions → 허용 프로필 제안. 선택·실행은 기존 호스트에서 명시적으로 해요 |
| 과거 자동 적용 흐름 — 보류 | native PreToolUse Hook → MCP → 분류·로컬 검증 → 지원되는 생성 인자 재작성. 현재 추천 preview의 선행 조건이 아니에요 |
| 라이선스 | 사용자가 **MIT**를 선택했고 LICENSE·package metadata에 반영했어요 |
| 소스 형식 | 사용자가 모든 프로젝트 `.mjs`를 `.ts`로 바꾸도록 요청했고 전환했어요 |
| 로컬 지침 | AGENTS.md는 남기되 Git·공개 archive에서 제외해요 |
| 오류 제보 | report가 MD·JSON 파일을 생성하고 사용자가 검토 후 GitHub 양식에 수동 첨부해요 |
| 환경변수 확장 | 사용자 지정 덮어쓰기·모델 포함/제외·동작 제외 경로 등을 **미착수 과제 IMP-001로만** 등록했어요 |
| 이름 | **Aptly**를 선택했고, Aptly 폴더에서 패키지·CLI 명칭 통일과 후속 작업 순서를 지시했어요 |
| 공개 상태 | 공개 준비용 preview예요. 문서 작성 시 프로젝트 루트에 `.git`이 없고 원격·npm 게시를 수행한 기록도 없어요 |

현재 전환 기준은 표시명 `Aptly`, 패키지·CLI·MCP 식별자 `aptly`예요. 공개 저장소 생성이나 npm 게시를 수행했다는 뜻은 아니에요. 부제 제안은 `Model and reasoning recommendations for subagents.`였어요.

## 이름 검토 결과와 한계

아래는 당시 npm 공개 registry 직접 조회 결과예요. 현재 게시 가능성·예약·유사 이름 제한·scope 소유·GitHub 계정 내 저장소명·상표를 보장하지 않아요. 실제 등록 직전에 다시 확인해야 해요.

| 이름 | 조회 당시 결과 |
|---|---|
| `subagent-router` | 2026-11-03에 0.2.3 등록 확인. 유사 분야의 다른 패키지였어요 |
| `subagentrouter` | 2026-11-03에 404 |
| `decision-maker` | 2026-11-03에 1.0.0 등록 확인 |
| `decisionmaker` | 2026-11-03에 404 |
| `subagent-advisor`, `subagent-model-router`, `agent-profile-router` | 2026-11-05에 404 |
| `subroute`, `routelet`, `sift` | 2026-11-05에 각각 1.0.1, 0.1.1, 17.1.4 등록 확인 |
| `subpick`, `taskfit`, `modapt`, **`aptly`** | 2026-11-05에 404 |

Antigravity CLI의 사용자 지정 모델 `gemini-3.8-flash-high`로 네이밍 후보를 두 번 받았어요. 첫 결과는 추상적이라는 사용자 의견이 있었고, 기능이 드러나는 이름을 다시 검토한 뒤 짧은 후보 중 Aptly를 선호했어요. naming용 임시 파일은 정리했고 후보가 별도의 확정 공개 계약으로 저장된 것은 아니에요.

## 현재 구현 상태

| 파일·경로 | 역할 |
|---|---|
| `src/core.ts` | 입력·허용 프로필·제약·캐시·원장·예산·timeout·오류 처리 |
| `src/provider.ts` | 고정 OpenAI Decisions endpoint·고정 선택지·응답 검증. 자동 재시도 없음 |
| `src/provenance.ts` | 명시 선택과 effective-setting 증거의 우선순위·출처·호출별 결합 판단 |
| `src/inspect.ts` | 명시한 설정 파일만 검사해 값 대신 pin/unset/unknown을 설명 |
| `src/config.ts`, `src/files.ts` | private 설정·host context·source fingerprint·안전한 파일 접근 |
| `src/hook.ts` | native Hook 입력 정규화와 허용된 모델 필드만 재작성 |
| `src/server.ts` | 제품용 stdio MCP 서버 |
| `src/diagnostics.ts`, `src/report.ts` | 무료 로컬 진단·엄격한 allowlist·MD/JSON 첨부 파일 생성 |
| `src/types.ts`, `src/version.ts` | 공유 타입·버전 |
| `bin/aptly.ts` | 현재 CLI 진입점 |
| `scripts/poc.ts` | 키 없이 fixture MCP smoke 실행 |
| `scripts/release-check.ts` | 공개 후보·개인 정보 패턴·닫힌 npm file allowlist 검사 |
| `scripts/mark-bin-executable.ts` | 빌드된 CLI를 실행 가능하게 설정 |
| `test/` | 무유료 회귀와 실제 stdio 연결 시험 |
| `test-support/poc-server.ts` | **합성 시험 전용** manifest·fault·deny·종료 관측 서버. 제품 서버와 분리 |
| `test-support/temp.ts` | 작업 볼륨에 맞춘 전용 임시 경로·권한·정리 |
| `examples/` | MCP 등록 조각, shadow 정책, 명시 설정 검사 목록 |
| `.github/` | 무유료 CI, JSON 첨부 필수 오류 제보 양식 |

제품 MCP 도구는 `get_routing_capabilities`, `recommend_agent`, `get_routing_precedence`, `route_spawn_hook` 네 개예요. 제품 서버에 PoC manifest 활성화·임의 deny·transcript 읽기/경로 관측 도구를 추가하면 안 돼요.

이전 preview 카탈로그는 `codex-routine`(Sol/low), `codex-deep`(Astra/high), `claude-routine`(Haiku), `claude-deep`(Sonnet) 네 조합이었어요. 현재0.1.0 기본값은 위 초안 안내를 따라요. 정확한 값은 `src/core.ts`를 기준으로 해요. Claude effort는 적용하지 않아요. 이 값은 현재 호스트의 실제 접근 가능성을 보장하지 않으며 live 시험 전 공식 계약과 설치 버전을 재확인해요.

## TypeScript·빌드·의존성

- package name: `aptly`
- version: `0.1.0-preview.0`, `private: true`, MIT
- Node.js: 24 이상
- 직접 의존성: MCP SDK 1.32.2, smol-toml 1.9.1, zod 4.6.7
- 개발 의존성: TypeScript 7.0.2, @types/node 24.19.2
- `tsconfig.json`: strict NodeNext, ES2024, declaration, rewriteRelativeImportExtensions, noEmitOnError
- strict compiler 대상: `src/`, `bin/`, `scripts/`. 테스트는 Node의 native `.ts` 실행으로 검증해요.
- 프로젝트 소스·테스트·스크립트와 보존한 개인 실행 스크립트는 `.ts`예요. vendor node_modules와 과거 기록을 일괄 치환하지 않아요.
- 빌드 출력은 Git에서 제외한 `dist/`예요. npm에는 `dist/src/`, `dist/bin/`의 `.js`·`.d.ts`와 examples·README·LICENSE·필수 metadata만 넣어요.
- `npm run build`는 `tsc` 후 실행 권한 설정 스크립트를 실행해요. CLI 실행 비트 설정을 빼먹지 않아요.
- 설치된 node_modules 안에서 `.ts`를 직접 실행하지 않아요. 설치용 CLI는 `dist/bin/aptly.js`예요.
- CLI의 MCP 설정 출력은 source 실행이면 `.ts`, compiled 실행이면 `.js`를 가리켜요. 문자열 URL은 compiler의 import 확장자 치환만으로 고쳐지지 않아 별도로 처리했어요.

## 안전한 기본 동작과 현재 한계

**기본은 `ROUTER_PROVIDER=fixture`, Hook mode `shadow`예요.** 이름 변경 때문에 기본 동작을 apply나 live로 바꾸지 않아요.

명시 model/effort·고정 역할·이력 상속 fork·resume은 보존해요. 파일 검사·부모 모델·native MCP 인자·서버 환경만으로 현재 호스트의 CLI·세션·환경·관리 설정 전체를 확인했다고 추정하지 않아요. `inspect`는 명시 파일만 읽고 항상 미검증 증거를 반환해요.

일반 자동 적용은 **완전한 effective host evidence를 자동 수집하는 어댑터가 아직 없어서 일반 세션에 바로 제공되는 기능이 아니에요.** 별도 신뢰된 호스트 통합이 private envelope로 현재 version/session/cwd/tool call ID/input digest/시간/모든 계층·환경·확장 정보를 제공해야 해요. 파일의 authority 문자열이나 private 권한이 증거 내용의 진실성을 독립적으로 증명하지 않아요.

그 증거가 있어도 pin·unknown·불충분한 맥락이면 유지해요. provider 응답 후 source fingerprint·증거·운영자 설정을 다시 확인해요. 일부 설정만 바꾸어 역할·문맥·권한을 우회하지 않아요. 세부 계약은 [CONFIGURATION](CONFIGURATION.md)에 있어요.

Codex 0.166.0 V2에서 실측한 Hook 이름은 구분자 없는 `collaborationspawn_agent`예요. `spawn_agent`와 `Agent`도 처리하지만 이 둘만 matcher에 쓰면 해당 V2 경로를 놓쳤어요. Claude 2.1.314는 tool_input을 JSON 문자열로 전달할 수 있어 bounded 파싱을 지원해요. Codex는 updatedInput과 allow 조합을 요구하고, Claude는 updatedInput만 반환해요. 다른 보안 Hook의 deny가 우선하는 합성 시험을 통과했어요.

원장 기본 가드는 일 20회·누적 50회·동시성 1·요약 4,000바이트·분류 10초·호출당 추정 예약액 0.01 USD·추정 합계 0.5 USD예요. 이는 원장별 가드이고 실제 계정 청구 상한이나 일반 품질 평가가 아니에요. 완료 요청은 재사용하고 unknown 결과를 새 ID로 자동 재호출하지 않아요.

## 환경변수와 자격 취급

| 현재 지원 값 | 용도 |
|---|---|
| `OPENAI_API_KEY` | MCP 프로세스의 분류 키. host 실행 인증과 분리 |
| `ROUTER_PROVIDER` | fixture 또는 decisions |
| `ROUTER_LEDGER_PATH` | live 분류 시 필수인 절대 원장 경로. 부모 디렉터리는 사용자 소유·private이어야 해요 |
| `ROUTER_CONFIG_PATH` | private operator JSON 설정 경로. mode와 context_path를 읽어요 |
| `POC_TEST_TMP_ROOT` | 테스트 임시 루트 override. 외장 작업 볼륨 밖으로 조용히 우회하지 않아요 |

사용자 지정 덮어쓰기 boolean, 모델 포함·제외 string[], 동작 제외 경로 string[]와 추가 정책 환경변수는 **아직 지원하지 않아요**. [BACKLOG](BACKLOG.md)의 IMP-001에 결정할 의미·기본값·우선순위·테스트 기준을 기록했어요. 이를 구현하라는 지시가 오기 전에는 기존 보존 정책을 유지해요.

공개 실행 경로는 특정 Vault 서비스·SSH 계정·개인 서버에 의존하지 않아요. 과거 live PoC의 개인 credential 조회 래퍼는 `.local/scripts/` 안에 보존돼 있으며 공개·패키지 대상이 아니에요. 이 문서에 키·개인 인프라 식별자를 복사하지 않아요. live가 필요하다고 사용자 지시를 받은 경우에만 자격 저장소에서 읽고, 과거 PoC 키의 만료 여부도 private metadata로 확인해요. 이름 변경 때문에 키를 재발급하거나 자격 항목을 임의로 바꾸지 않아요.

## report와 GitHub 오류 제보

```sh
node bin/aptly.ts report --format both --output-dir reports
```

새 보고서는 `tool.name=aptly`, `schema_version=1`을 사용해요. renderer·export 검증기는 과거 `tool.name=subagent-decisions`도 원래 식별자를 보존해 받아들이고, 기존 보고서 파일은 변경하지 않아요. `ROUTER_*` 환경변수 이름도 유지해요.

동일한 무작위 report_id의 JSON·Markdown이 기본으로 생성돼요. `--format json`·`md`도 지원해요. 디렉터리 700·파일 600, 덮어쓰기 거부, 실패 시 이번에 만든 파일만 되돌리는 동작을 검증했어요. 파일 안의 error/unknown 진단과 파일 생성 명령의 성공은 별개예요.

report는 현재 tool/Node/OS 종류·아키텍처와 7개 고정 검사 코드만 담아요. 키 값·개인 경로·작업 본문·환경변수 값·원시 오류·transcript는 담지 않아요. 키 존재는 인증 성공이 아니고, host context를 로드한 사실도 현재 호출의 유효성을 인증하지 않아요. 실제 API·호스트 CLI 버전·과거 실패를 자동 조사하지 않아요.

GitHub issue form은 JSON upload 필수, 같은 report_id의 Markdown은 선택이에요. 현상·합성 재현·기대 결과·report_id·사용자 검토 체크박스를 받아요. JSON 확장자 검사가 내부 스키마나 비밀 비포함을 검증하지는 않아요. 원격 양식 렌더링·실제 issue 제출은 아직 확인하지 않았고 자동 업로드 기능은 없어요. [REPORTING](REPORTING.md), [SECURITY](../SECURITY.md)를 확인해요.

## 검증된 것과 증거 위치

### 2026-11-05 Aptly 브랜딩 전환 검증

Aptly 경로에서 다음 무료 검증을 완료했어요. 유료 API·실제 에이전트 시험은 실행하지 않았고 `paid_calls=0`이에요.

- strict typecheck·build 통과
- `npm test`: **144/144 통과**
- fixture MCP smoke 통과
- 릴리스 검사 통과: 공개 소스 후보 97개·npm 패키지 파일 35개 확인
- 격리된 임시 위치에 npm archive를 오프라인 설치해 `aptly` 실행 파일과 실행 권한을 확인하고, 옛 이름 실행 파일이 없음을 확인
- `--no-experimental-strip-types`로 compiled CLI 실행 확인
- 새 report의 `tool.name=aptly`, `schema_version=1` 확인
- 두 호스트용 generated MCP config와 MCP 서버 이름 `aptly`·제품 도구 네 개 확인

Aptly 이름의 source archive·npm archive·검증 metadata를 `.release/aptly-*`에 새로 생성해요. 기존 이름의 검증 metadata와 archive는 보존하며 새 결과로 간주하지 않아요. 현재 목록과 SHA-256은 `.release/aptly-public-source-files.json`, 현재 검증은 `.release/aptly-branding-verification.json`을 기준으로 확인해요.

### 이전 이름의 검증 기록

이전 TypeScript 전환 검증은 142/142 통과, skip 0이었어요. 당시 typecheck·build·fixture smoke·release file 검사와 별도 npm archive 설치·compiled CLI·report·MCP 네 도구·실행 비트·개인 자료 제외를 확인했어요. 이는 이전 이름으로 수행한 기록이며 위 Aptly 브랜딩 검증과 구분해요.

| 위치 | 의미·주의 |
|---|---|
| `.release/source-verification.json` | 2026-11-03의 마지막 TS 전환·142개 시험·AGENTS 제외 등의 로컬 검증 메타데이터 |
| `.release/package-verification.json` | 이전 이름의 compiled npm 설치·CLI·report·MCP 검증. 이번 Aptly 전환 검증 metadata가 아니에요 |
| `.release/public-source-files.json` | 당시 공개 소스 파일 목록·hash. 현재 인계 문서·개선과제 등 이후 문서 변경까지 자동 반영한 목록은 아니에요 |
| `.release/subagent-decisions-*-source.tar.gz`, `.release/subagent-decisions-*.tgz` | **기존 이름으로 만든 과거 archive**. 현재 파일과 Aptly 이름 전환을 반영한 최신 배포물로 간주하지 않아요 |
| `.poc/` | 과거 합성·live 시험의 private 원본 증거·원장·관측. 공개·새 작업의 자동 설정 자료로 사용하지 않아요 |
| `.local/history/` | 개인 식별정보가 있을 수 있는 원래 인계·PoC 문서의 보존 사본 |
| `.local/scripts/` | 과거 장비용 secret/poc/host-poc/vault-server TypeScript 래퍼. 키·내용을 공개 자료로 복사하지 않아요 |
| `reports/` | 생성한 MD·JSON 진단 첨부 예시. Git에서 제외해요 |
| `docs/POC_RESULTS.md` | 공개용으로 정리한 과거 실제 관측 요약 |

과거 실제 PoC는 두 CLI의 Hook → MCP → Decisions → 자식 모델 적용을 확인했어요. Codex 자식 Sol/low는 turn_context로, Claude 자식 Haiku는 실제 child message.model로 관측했고 42를 반환했어요. 오류 시 기본 자식 1개, 별도 deny 시 자식 0개도 확인했어요. 6회 분류·입력 1,551토큰 기록은 과거 합성 시험 수치예요. 일반 업무의 최적 모델·비용 절감·품질 성공률을 검증한 것은 아니에요. 30~50건 평가와 모든 호스트 지원은 미완료예요.

## 폴더 이동 뒤 작업 재개 순서

의존성이 그대로 이동됐으면 불필요하게 재설치하지 않아요. node_modules가 없거나 lockfile과 달라졌다면 먼저 잠긴 의존성을 설치해요.

```sh
pwd
node --version
cat package.json
# 필요한 경우에만:
npm ci --ignore-scripts --no-audit --no-fund
```

Aptly 전환 이후의 검증·실행 명령은 아래와 같아요. 실제 소스·빌드 파일과 새 검증 결과를 확인해요.

```sh
npm run typecheck
npm test
npm run poc
npm run check:release
node bin/aptly.ts --help
node bin/aptly.ts config claude
node bin/aptly.ts config codex
node --no-experimental-strip-types dist/bin/aptly.js --version
```

`check:release`는 build를 포함해요. 테스트와 smoke는 fixture·무료 경로로 실행하고 live 키를 자동 조회하지 않아요. 마지막 두 config 명령은 현재 위치의 MCP 등록 조각을 출력하며 설정을 설치하지 않아요.

폴더 이동으로 외부 앱의 폴더 컨텍스트, 셸 cwd, IDE·MCP 등록의 절대 실행 경로가 오래될 수 있어요. 실제 사용 위치만 확인해요. 기존 설정을 무조건 덮어쓰거나 전역 설치를 추가하지 않아요. `.poc`의 과거 mcp/settings JSON이나 host evidence의 옛 cwd·fingerprint는 새 경로의 설정·현재 호출 증거로 재사용하지 않아요.

`ROUTER_CONFIG_PATH`, operator 설정의 `context_path`, `ROUTER_LEDGER_PATH`가 이동한 디렉터리 내부의 옛 절대 경로를 가리키면 새 위치로 조정해야 해요. 외부 private 경로에 있던 값은 폴더 이동만으로 수정할 필요가 없어요. 과거 계정·IDE·호스트의 실제 외부 설정은 이번 인계 작업에서 열람하거나 변경하지 않았어요.

필요한 외장 볼륨은 mount·UUID·잠금 해제·쓰기 가능 상태를 확인해요. 임시물은 해당 볼륨의 tmp 아래 codex- 접두사·권한 700의 전용 디렉터리에 두고, 자신이 만든 것만 정리해요. 현재 디렉터리와 다른 장비의 경로를 가정하지 않아요.

## Aptly 제품 식별자 전환 점검

2026-11-05 사용자 지시에 따른 제품 이름 전환에서는 다음을 함께 확인해요. 단순 전역 문자열 치환은 현재 계약과 과거 기록을 섞을 수 있어요.

1. package.json과 lockfile의 name·bin·exports·types·script 경로, `bin/aptly.ts` 파일명과 compiled 진입점
2. `scripts/mark-bin-executable.ts`의 compiled CLI 대상 경로, CLI가 생성하는 source/compiled MCP 실행 경로
3. `src/server.ts`의 MCP 이름, CLI help·오류 접두사·설정 key, examples의 MCP 이름·command
4. `src/diagnostics.ts`와 `src/report.ts`의 **tool.name 고정값·타입·검증·정규화 allowlist**. 한쪽만 Aptly로 바꾸면 report가 스키마 검증에 실패할 수 있어요. 과거 JSON의 호환 방침을 정하고 schema_version을 브랜드 문자열처럼 치환하지 않아요
5. smoke·통합·report·release 테스트의 기대 이름·진입점, issue template·README·문서·LICENSE copyright 표시
6. 이름이 바뀐 생성 파일이 남지 않게, 이 프로젝트가 만든 빌드 출력임을 확인한 `dist/`를 정리한 뒤 새 이름으로 typecheck/build/test/smoke/release 검사와 실제 npm archive 설치·실행 파일·report·MCP·generated config 확인
7. 새 경로와 이름 기준으로 공개 source archive·패키지·검증 metadata 재생성. 공개 archive에 AGENTS.md·private 자료가 들어가지 않는지 재확인

private credential 항목·과거 request ID·원장·캐시·PoC transcript·report 원본은 브랜드 변경만을 이유로 수정하지 않아요. 기존 evidence hash와 unknown 요청의 재사용 규칙도 보존해요. `ROUTER_*` 환경변수 prefix 변경 여부는 별도 호환성 결정이며 Aptly 폴더명만으로 자동 변경하지 않아요.

`tsc`는 없어진 소스에 대응하는 과거 `.js`·`.d.ts`를 자동 삭제하지 않아요. 릴리스 검사는 dist/bin 내부의 옛 CLI 파일을 거부해요. 파일명 변경 뒤 단순 build만 하면 구 실행 파일이 생성물에 남을 수 있으므로 정리 후 검사해요. 생성물 정리 후 archive의 **실제 파일 목록**을 확인해요. MCP 서버 key를 바꾸는 경우 Hook이 참조하는 server 이름과 클라이언트 도구 namespace도 함께 맞춰요.

공개 저장소 생성·commit·push·npm 게시를 실제로 요청받은 경우에는 정확한 대상과 현재 계정·개인 Git identity를 확인해요. 회사 identity·전역 Git 설정을 임의로 사용하지 않아요. 현재 `private:true`를 폴더명 변경만을 이유로 해제하지 않아요.

## 남은 과제와 문서 안내

- Aptly 브랜딩 전환의 새 경로 기준 검증·패키지 확인. 이름 가용성은 실제 게시 직전에 재확인해요
- 완전한 effective host evidence를 현재 native 세션에서 얻는 호스트 통합
- 일반 작업의 품질·재작업·총지연·총비용 평가
- 설치·제거·원상복구와 update·doctor의 실제 범위 결정. report는 이미 구현됐지만 독립 doctor/update 명령은 없어요
- 원격 GitHub·CI 실제 실행·npm 게시와 정식 패키징 결정
- IMP-001은 계속 미착수로 유지하며 후속 지시에 따라 설계해요

읽을 문서: [CONFIGURATION](CONFIGURATION.md), [COMPATIBILITY](COMPATIBILITY.md), [VALIDATION](VALIDATION.md), [REPORTING](REPORTING.md), [RELEASING](RELEASING.md), [BACKLOG](BACKLOG.md), [REQUIREMENTS](REQUIREMENTS.md), [ARCHITECTURE](ARCHITECTURE.md), [PRIOR_ART](PRIOR_ART.md).

현재 후속 상태: 사용자가 별도 호스트 확장을 허용했고 [통합 설계](HOST_INTEGRATION.md)와 [작업 순서·평가안](ROADMAP.md)을 작성했어요. Codex 설치 버전의 공개 schema를 읽기 전용으로 탐색했으며, adapter·broker 구현·native 적용 검증·실무 평가는 아직 수행하지 않았어요.


## Codex 설정 관측 prototype 후속 검증 — 2026-11-05

사용자 요청에 따라 `test-support/codex-host-probe.ts`와 읽기 전용 RPC transport, fixture 회귀 13건, 개발용 `npm run probe:codex`를 추가했어요. Codex 0.166.0에서 격리된 테스트 설정의 조회·변경·CLI override를 실제 관측했어요. 출처는 user/sessionFlags로 구분됐고 파일 변경 후 두 model/effort 출처의 계층 버전 변화도 확인했어요. 원시 config·경로·model 값·fingerprint는 공개 출력에 남기지 않아요.

현재 전체 회귀는 **157/157 통과**, skip 0이에요. 제품 typecheck·build, fixture MCP smoke, 릴리스 검사(소스 후보 101개·npm 파일 35개)도 통과했어요. 기본 CI 시험은 fake process와 fixture만 사용하며 실제 Codex probe는 명시 실행 명령이에요.

전체 native 설정 출처·누락 없는 세션 변경 감지·spawn 직전 원자적 재확인은 확보하지 못했어요. prototype은 evidence writer나 제품 MCP에 연결하지 않았고, 모델 turn·native 자식 실행·실제 사용자 설정 쓰기·분류 API 호출도 하지 않았어요. OS managed 설정이나 초기화 네트워크까지 완전히 미접근했다고 주장하지 않아요. 결과는 항상 shadow/미검증이며 상세 인터페이스와 한계는 [Codex 관측 결과](CODEX_HOST_PROBE.md)에 있어요.

현재 검증 결과는 `.release/aptly-codex-host-probe-verification.json`에 별도로 기록해요. 기존 `.release/aptly-branding-verification.json`과 source/npm archive는 브랜딩 시점의 과거 checkpoint이며 이번 prototype·문서 변경을 포함한 최신 archive로 간주하지 않아요. 다음 작업은 같은 native 세션의 resolver 출처와 원자적 dispatch 경계를 제공하는 호스트 인터페이스를 확보하는 것이며, 전체 broker 구현·실무 평가는 계속 미완료예요.


## 호스트 resolver·dispatch 계약 후속 작업 — 2026-11-05

같은 세션의 resolver 상태와 원자적 적용 경계를 구체화하라는 사용자 요청에 따라 [호스트 API 제안](HOST_DISPATCH_CONTRACT.md), `test-support/host-dispatch-contract.ts`의 ReferenceDispatchHost, fixture 회귀 20건을 추가했어요. capture·최종 candidate 승인·revision/epoch/call/input 재확인·한 번의 enqueue·결과 조회·취소를 모델링했어요. ABA·중복·재진입·승인 중 만료·시계 역행·unknown queue 결과·재연결 뒤 ledger 보존도 시험했어요.

전체 시험은 **177/177 통과, skip 0**이며 제품 typecheck/build와 fixture reference model의 별도 strict 타입 검사, MCP smoke, 릴리스 검사(소스 후보 104개·npm 파일 35개)가 통과했어요. 이번 작업은 실제 Codex 세션이나 모델을 실행하지 않았어요. 검증 기록은 `.release/aptly-host-dispatch-contract-verification.json`에 별도로 남겨요.

이 API는 현재 Codex RPC가 아니며 reference model은 제품에서 import하지 않아요. fixture의 synthetic context·동기 보안 callback·in-memory ledger를 실제 resolver 완전성·OS 인증·native queue crash 원자성으로 승격하지 않아요. 실제 호스트 측 resolver hook, 모든 변경의 revision 증가, 최종 보안 결정과 enqueue 경계, 영속 실행 원장과 인증 제어 채널 구현이 남아 있어요. 제품 기본값과 기존 v1 envelope는 그대로이며 실무 apply 평가는 아직 시작하지 않았어요. 과거 archive와 검증 metadata는 각 기록 시점의 checkpoint예요.


## Codex 릴리스 소스 추적 — 2026-11-05

설치 package/CLI 0.166.0과 같은 public tag의 peeled commit `6ff1e1ca3b30fc8b914720681fcf5fe62e95f856`을 임시 clone에서 읽기 전용으로 조사했어요. 설치 binary와 이 commit의 재현 가능한 빌드 일치까지 증명하지는 않았어요. [소스 경로 지도](CODEX_SOURCE_MAP.md)에 resolver 우선순위, frozen step, 보안 Hook·review, native initial input admission과 기존 Rust host API의 재사용 범위를 기록했어요.

중요한 수정은 **최신 thread 설정 대신 호출이 캡처한 StepContext.settings**에 ticket을 결합한다는 점이에요. role overlay는 SessionFlags로 투영되므로 merge 이전의 출처 trace가 필요해요. 기존 host invocation lookup은 재사용할 수 있지만 observe-only contributor만으로 native 입력을 재작성할 수는 없어요. 활성 ID map·PendingSpawn cleanup은 durable dedup 원장이 아니에요.

호스트 코드·제품 코드·설치 binary·사용자 설정을 변경하지 않았고 Rust 빌드·native 시험·모델 실행도 하지 않았어요. 기존 177개 시험 결과는 직전 fixture 작업의 기록이며 이번 문서 작업에서 재실행하지 않았어요. 공개 파일 릴리스 검사만 수행해요. `.release/aptly-codex-source-trace-verification.json`에 tag/commit·binary hash·검토한 소스 hash를 남기고 임시 clone은 정리해요. 다음 구현은 같은 릴리스 호스트에서 동작을 바꾸지 않는 provenance capture부터 시작해요.


## Native provenance capture 구현 — 2026-11-05

사용자 지시에 따라 `.local/codex-host`의 고정 release 소스에 실제 Rust 관측 패치를 구현했어요. `PreparedSpawnConfig`의 내부 provenance·captured settings Arc, role 파일의 같은 읽기에서 얻은 SHA-256/필드 존재 관측을 추가했어요. 기존 설정 선택·권한·fork·오류 동작은 유지했어요. native 호출자가 새 데이터를 아직 소비하지 않으므로 외부 전달·broker·자동 적용은 미연결이에요.

검토용 artifact는 `scripts/codex-host-patch/`의 patch·manifest·upstream Apache LICENSE/NOTICE이고 상세 안내는 [구현·검증](CODEX_PROVENANCE_PATCH.md)이에요. Rust1.95.0 core library/test target check 통과, 새 13개를 포함한 native 관련 40개 통과(upstream 8MiB stack), 독립 모듈 3개 통과, Aptly 177개·타입·빌드·MCP smoke·release 검사 통과예요. 기존 sandbox 시험의 기본 stack overflow는 upstream justfile의 RUST_MIN_STACK=8388608로 재실행해 통과했어요. V8 fetch SecureTransport 오류는 Git CLI 방식으로 복구했어요.

locked 검사를 위해 release workspace package 버전만 Cargo.toml과 맞추고 core sha2 참조를 추가했으며 registry/git 의존성 버전·내용은 바꾸지 않았어요. 전역 Rust·PATH·운영 Codex binary·사용자 설정은 수정하지 않았어요. 개발 source·도구체인·공개 cache·target 위치는 private `.local/codex-host-development.json`에 보존해요. 이번 검증 metadata는 `.release/aptly-codex-provenance-capture-verification.json`이에요. 이전 archive는 이전 작업 시점의 checkpoint로 유지해요.
