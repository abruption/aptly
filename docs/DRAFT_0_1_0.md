# Aptly 0.1.0 패키지 초안

이 초안은 기존 MCP+Decisions 흐름에 사용자 요청한 후보·effort 기본값과 모델 정보 수집을 반영해요. 후속 요청으로 npm 설치 시 MCP·Hook 등록과 새 일반 서브에이전트의 기본 모델 자동 선택도 추가해요. 패키지 버전은 `0.1.0`이며 `private: true`를 유지해요. 로컬 패키지·호스트 재설치는 이번 요청 범위이고 원격 저장소 생성·push·registry 게시·전역 설치는 포함하지 않아요.

## 반영 범위

| 등급 | Claude Code | Codex |
|---|---|---|
| simple | haiku | gpt-6-luna / max |
| routine | sonnet | gpt-6.1-terra / high |
| deep | opus | gpt-6.1-sol / medium |

이 등급은 Aptly의 운영 프리셋이고 모델 간 동등 성능이나 최소 토큰·비용을 보장하지 않아요. 사용자 지정 후보 배열은 추천 범위를 제한하며 모델·effort·역할 pin을 덮어쓸 수 없어요. Claude effort는 이 카탈로그에서 지정하지 않아요.

- `APTLY_CLAUDE_MODELS`·`APTLY_CODEX_MODELS`: JSON 문자열 배열. 생략은 위 기본값, `[]`는 해당 client 비활성화예요. 둘 다 비활성화하면 분류 API를 호출하지 않아요.
- `CLAUDE_MODELS`·`CODEX_MODELS`: 별칭. 같은 제공사의 두 이름을 동시에 지정하면 오류예요. 오타 `CODEX_MODESL`, 잘못된 JSON·중복·비문자열·빈 문자열·지원하지 않는 ID도 안전한 설정 오류예요.
- 선택 후보 `fable`·`gpt-6-astra`: 각각 claude-frontier·codex-frontier(high)이며 기본 목록에는 없어요. 문서가 소개하는 모든 모델을 자동 추가하지 않아요.
- 실제 모델명·Codex effort·공식 특성·등급의 작업 기준을 Decisions의 각 선택지 설명에 함께 넣어요. 모델 목록과 실효 설명의 변경은 카탈로그 version/digest에 반영해요. 과거 4개 또는 현재 8개 tuple의 저장 기록은 읽을 수 있게 보존하지만, 캐시 재사용은 현재 후보의 전체 model/effort·version·digest가 맞아야 해요. 필터 변경 때문에 원장을 지우지 않으며 이전 unknown 요청은 재호출하지 않아요.
- `aptly catalog refresh --output ABS_PATH`: 고정된 공식 Markdown 두 개를 읽고 짧은 정보만 정규화해 private 파일에 저장해요. API 키나 작업 요약을 보내지 않아요.
- `APTLY_MODEL_INFO_PATH`: 시작 시 읽는 정규화 cache 경로예요. 7일 TTL을 넘거나 cache를 읽을 수 없으면 동봉 설명으로 돌아가고, explicit refresh 실패는 기존 파일을 보존해요. 추천마다 fetch하지 않아요.

가져오는 공식 문서는 [Claude Code 모델 설정](https://code.claude.com/docs/en/model-config.md)과 [OpenAI 모델 안내](https://learn.chatgpt.com/docs/models.md)예요. 공식 설명은 호스트 계정의 실제 모델 가용성이나 실행 권한을 증명하지 않아요. [사용 안내](ADVISORY_USAGE.md)에 source·compiled·MCP 호출과 환경 설정을 정리했어요.

## 후속 반영 — 설치와 자동 Hook

사용자가 명시 승인한 정책은 **모델·effort를 명시하지 않은 새 일반 서브에이전트의 기본값만 Aptly가 선택**하는 `defaults`예요. 그 범위에서 호스트 기본 모델보다 Aptly의 선택을 우선해요. 호스트의 모든 설정 출처를 관측했다는 선언으로 취급하지 않아요.

- npm `postinstall`은 현재 설정이 있는 Claude Code·Codex에 MCP와 서브에이전트용 `PreToolUse` Hook을 등록해요. `CI`·`APTLY_SKIP_SETUP=1`·npm `--ignore-scripts`에서는 자동 등록을 건너뛰어요. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`을 따라요.
- `aptly setup --client codex|claude|all --mode defaults|advisory`로 직접 등록해요. `advisory`는 추천만 전달하고 인자를 변경하지 않아요. `aptly remove --client codex|claude|all`은 소유 기록과 일치하는 항목만 제거하며 변경된 항목은 보존해요. mode를 바꿀 때는 기존 등록을 제거한 뒤 다시 등록해요.
- 기존 MCP·Hook·알 수 없는 설정, 기존 Aptly의 실행 명령·환경을 보존해요. 새 MCP는 decisions와 호스트별 private 원장을 지정해요. 키는 읽어 저장하지 않고 MCP 프로세스의 안전한 환경에서 전달해요. 키가 없거나 추천에 실패하면 원래 호출을 유지해요. 기존 fixture 설정은 유료 모드로 자동 전환하지 않으며 fixture 결과로 기본 모델을 자동 변경하지 않아요.
- Codex는 `/hooks`에서 추가된 Hook의 정확한 정의를 한 번 검토하고 신뢰 승인해야 해요. 설치 프로그램은 신뢰 설정을 조작하거나 이 절차를 우회하지 않아요. 호스트 새 세션·MCP 재시작으로 설정을 읽게 해요.
- 명시 모델·effort·고정 역할·resume·이력 상속 fork는 분류 전에 보존해요. Codex는 `fork_turns: "none"`, Claude Code는 `subagent_type: "general-purpose"`인 새 일반 호출이 대상이에요. 모델 외 권한·승인·샌드박스·MCP 권한은 변경하지 않아요.
- 작업 라벨과 제공된 message/prompt의 첫 문단에서 최대 4,000바이트의 요약만 분류해요. transcript·설정·업무 파일을 수집하지 않아요. 호출별 입력·정책·카탈로그를 결합하고 응답 후 재확인해요. 같은 native 호출의 변경된 입력이나 unknown 결과를 새 유료 요청 ID로 우회하지 않아요.

## 유지하는 경계

직접 추천은 advisory_only이고 실제 자식 실행은 기존 호스트가 담당해요. 새 operator 정책과 기존 host evidence 기반 경로를 분리해요. 자동 정책이 없는 기존 shadow/apply 경로의 미확인 출처 보존과 검증 조건은 유지해요. 완료 요청은 재사용하고 unknown 유료 요청을 새 ID로 자동 재호출하지 않아요. 호스트 내부 패치·broker/원자적 dispatch 연구는 계속 보류해요. 새 Hook의 실제 native 적용 여부는 별도 실행 메타데이터로 확인해야 해요.

IMP-001 중 이번에 명시한 추천 후보 목록 설정만 반영해요. 명시 선택 덮어쓰기·추천 제외 목록·동작 제외 경로 등 나머지 정책 확장은 이번 초안에 포함하지 않아요. 예전에 진행한 session-peer 번역 시험은 추천·spawn 시험이며 원본 README 수정은 범위가 아니었고 실제 저장소는 수정하지 않았어요.

## 전달물과 검증 상태

신뢰 승인 후 Codex native 후속 점검에서 Hook에 `message`가 암호문으로 전달되는 환경을 확인했어요. 원문 해독·호스트 패치 없이, 이런 호출은 충분히 구체적인 평문 `task_name`의 underscore를 공백으로 정규화한 요약만 사용하도록 보완해요. 최소 여섯 부분·24바이트·세 개 이상의 영문 단어를 요구하며 짧은 이름·잘못된 이름·누락된 본문은 계속 보존해요. 기존 평문 본문 경로와 pin·fork·resume 보호는 유지해요. 이 작업 이름만으로 실제 본문 전체를 확인했다고 선언하지 않아요. `get_routing_capabilities.automatic_hook.last_result`에 마지막 처리 사유를 제공하며 본문·경로·설정 값을 기록하지 않아요.

이 후속 후보는 `.release/0.1.0-hooks-diagnostics/`에 별도 보관해요. 앞선 hooks-draft 검증은 당시 결과로 남기고 native 후속 결과를 소급해 덮어쓰지 않아요.

후보·모델 정보 구현 시점의 전달물은 `.release/0.1.0-draft/`에 보관해요. Hook 후속 후보는 `.release/0.1.0-hooks-draft/`에 별도로 준비해요. npm/source archive·파일 목록·SHA-256 manifest·설치 검증 JSON을 해당 후보별로 확인해요. 기존 후보와 과거 `.release/advisory-preview-20261105/` archive는 덮어쓰지 않아요.

Hook 추가 전 후보·모델 정보 초안은 Node 무료 회귀 **226/226**, strict typecheck/build, fixture stdio MCP smoke, release 파일 검사(소스 후보130개·npm43개)를 통과했어요. 실제 공식 Markdown 두 곳의 refresh·8개 fact 정규화와 fresh cache 로딩도 확인했어요. 후보 필터·비활성화·오류, 메타데이터 크기/시간/TTL/파일 경계, 설명 변경의 cache identity와 과거 원장 보존을 포함해요. 이 수치는 새 설치·자동 Hook 구현의 검증 수치가 아니에요.

최종 archive는 별도의 source/npm 설치에서 CLI·기본 6개·환경 필터·compiled config/report·MCP 네 도구와 최소 추천 예제를 확인하고 `verification.json`에 기록해요. npm에는 사용 안내와 이 초안 안내를 동봉하며 native 연구·test-support·private 자료는 포함하지 않아요. source archive에는 보류 표시한 연구 기록을 보존해요.

후보·모델 정보 초안 작업에서는 새 후보의 유료 Decisions 호출·실제 child 실행·호스트 내부 실험을 하지 않았어요. 설치·자동 Hook 후속 작업의 실제 검증 상태는 해당 후보의 기록을 확인해요. 문서나 합성 시험만으로 native 적용 성공을 주장하지 않아요. 새 세 단계의 업무별 품질·토큰 절감·비용 최적성은 아직 평가하지 않았어요. 비용 관련 기본값은 사용자 요청한 프리셋이며 측정된 최저 비용 순위가 아니에요.

과거 Node 193개 회귀·실제 Decisions 11회·초기 범주 8/8 기록은 **이전 네 프로필 카탈로그**의 검증이에요. 이를 이번 여섯 기본 프로필이나 새 환경변수·cache의 검증으로 바꾸어 표시하지 않아요. 그 기록은 [이전 실제 결과](ADVISORY_RESULTS.md)에 보존해요.
