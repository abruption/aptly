> 편집자용 메모 — **npm 배포 후 적용할 README 초안이며, 현재 게시가 완료됐다는 주장이 아니에요.** 현재 `package.json`은 `private: true`예요. 아래 본문은 향후 npm에 `aptly@0.1.0`이 게시된 뒤 루트 `README.md`에 적용하는 구성이며, 링크도 루트 README 기준이에요. 이 문서 자체를 npm 게시 완료의 근거로 사용하지 않아요.

---

# Aptly

Claude Code와 Codex의 서브에이전트 실행 프로필을 선택하는 로컬 stdio MCP예요. 작업의 최소 요약을 OpenAI Decisions API로 분류하고 허용된 모델·effort 조합을 골라요. 설치한 Hook이 명시 선택 없는 새 일반 서브에이전트의 기본값을 자동으로 선택하며, 실제 실행과 권한 결정은 기존 호스트가 담당해요.

새 자동 등록은 **decisions / defaults**를 사용해요. 명시 모델·effort·고정 역할·fork·resume은 보존해요. API 키가 없거나 추천에 실패하면 기존 호출을 유지해요. 키 없는 수동 시험은 fixture로 할 수 있고, fixture로는 자식 모델을 자동 변경하지 않아요. 직접 추천의 `application: advisory_only`는 호스트 설정 확인·모델 사용 권한·자식 실행 승인을 뜻하지 않아요. 품질이나 총비용 절감을 보장하지 않아요.

Node.js **24 이상**과 npm이 필요해요. 라이선스는 MIT예요.

## 1. 설치하기

```sh
npm install --global aptly@0.1.0
aptly --version
```

버전 출력은 `0.1.0`이에요. 설치한 CLI와 MCP 서버는 컴파일된 JavaScript를 사용하므로 소스 체크아웃이나 TypeScript 빌드가 필요하지 않아요.

`postinstall`이 현재 사용자의 Claude Code·Codex 설정 디렉터리를 찾아 Aptly MCP와 서브에이전트용 `PreToolUse` Hook을 등록해요. 기존 다른 MCP·Hook·설정과 기존 Aptly의 실행 명령·환경은 보존해요. 키를 읽어 저장하지 않아요. 아직 없는 호스트 설정 디렉터리는 자동 설치에서 건너뛰어요. `CODEX_HOME`·`CLAUDE_CONFIG_DIR`을 사용하면 설치 프로세스에도 같은 환경을 전달해요.

자동 등록을 원하지 않으면 `APTLY_SKIP_SETUP=1 npm install --global aptly@0.1.0` 또는 npm의 `--ignore-scripts`를 사용해요. CI 환경에서도 자동 등록을 건너뛰어요. 나중에 `aptly setup`으로 직접 등록할 수 있어요.

## 2. 키 없이 추천해 보기

다음 요청은 파일을 만들지 않고 그대로 표준 입력에 전달할 수 있어요.

```sh
ROUTER_PROVIDER=fixture aptly recommend <<'JSON'
{
  "request_id": "demo-codex-sort-001",
  "client": "codex",
  "task": {
    "summary": "Sort the supplied numbers [3, 1, 2] into ascending order. No files or network are needed.",
    "operation": "analysis",
    "context_sufficient": true
  }
}
JSON
```

fixture는 키·네트워크·자식 실행 없이 로컬 규칙으로 합성 결과를 반환해요. 위 요청의 출력에는 다음 필드가 포함돼요. 그 밖의 metadata는 생략한 예예요.

```json
{
  "status": "recommended",
  "reason": "allowed_profile",
  "application": "advisory_only",
  "profile_id": "codex-simple",
  "profile": {
    "id": "codex-simple",
    "client": "codex",
    "model": "gpt-6-luna",
    "reasoning_effort": "max"
  },
  "provider": "fixture"
}
```

`client`를 `claude`로 바꾸고 별도의 `request_id`를 쓰면 같은 작업을 Claude 후보에서 추천해요. 이 예제의 fixture 결과는 `claude-simple`이에요. fixture 출력은 실제 Decisions의 판단이나 품질 시험 결과가 아니에요.

## 3. Hook 연결과 자동 선택 확인하기

호스트를 새로 시작하거나 MCP 서버를 재시작해 등록을 읽게 해요. **Codex에서는 `/hooks`에서 새 Hook의 정확한 정의를 한 번 검토하고 신뢰 승인해야 해요.** 설치 프로그램은 승인을 우회하지 않아요. 연결·인증·시간 제한 오류에서는 원래 호출을 유지해요.

자동 선택은 명시 모델·effort·고정 역할·resume·이력 상속 fork가 없는 새 일반 호출에 적용해요. Codex는 `fork_turns: "none"`, Claude Code는 `subagent_type: "general-purpose"`인 호출이 대상이에요. 대상 호출은 `route_spawn_hook` → Decisions를 자동 경유해요. 이는 해당 범위의 호스트 기본 모델보다 Aptly 선택을 우선하도록 운영자가 허용한 정책이며, 호스트의 모든 설정 출처를 검증했다는 선언은 아니에요.

자동 등록을 건너뛰었거나 특정 호스트만 사용할 때는 직접 등록해요.

```sh
aptly setup --client codex --mode defaults
aptly setup --client claude --mode defaults
```

`--client all`은 두 호스트를 대상으로 해요. 직접 setup은 선택한 호스트의 설정 디렉터리가 없어도 생성할 수 있어요. `--mode advisory`는 추천만 전달하고 인자를 변경하지 않아요. 기존 정책과 다른 mode를 선택하려면 기존 등록을 제거한 뒤 다시 등록해요.

```sh
aptly remove --client all
aptly setup --client all --mode advisory
```

제거는 Aptly의 소유 기록과 일치하는 항목만 대상으로 해요. 사용자가 변경한 항목은 덮어쓰거나 삭제하지 않고 충돌을 알려요. setup 결과의 `partial`과 client별 안전한 오류 코드를 확인해요.

수동 MCP 등록 조각만 필요하면 `aptly config codex` 또는 `aptly config claude`를 사용해요. 이 명령은 설정을 수정하거나 Hook을 설치하지 않아요. 생성된 수동 조각의 fixture 기본값은 자동 setup의 decisions 기본값과 구분해요.

## 4. 실제 Decisions로 전환하기

실제 분류는 API 비용이 발생할 수 있어요. 키는 사용자 자격 저장소나 안전한 실행 환경에서 **CLI 또는 MCP 서버 프로세스의 `OPENAI_API_KEY` 환경변수로 주입**해요. 키를 CLI 인자·요청 JSON·MCP 설정 JSON·소스·로그·임시 파일에 적지 않아요. 특정 자격 저장소 서비스는 요구하지 않아요.

원장에는 요청 상태와 완료 결과를 보관해요. 먼저 직접 선택한 **새 디렉터리**를 현재 사용자 소유·권한 700으로 만들어요. 아래 절대 경로는 실제 사용할 위치로 바꿔요. 기존 디렉터리나 원장의 권한을 임의로 바꾸지 않아요.

```sh
mkdir -m 700 /absolute/private-aptly-state
export ROUTER_PROVIDER=decisions
export ROUTER_LEDGER_PATH=/absolute/private-aptly-state/advisory-ledger.json
# OPENAI_API_KEY는 이 프로세스의 안전한 환경 주입으로 준비해요.
```

CLI에서는 이 환경에서 `aptly recommend`에 작업 JSON을 전달해요. 첫 실제 요청에는 예를 들어 `demo-codex-sort-live-001`처럼 별도의 ID를 선택하고, 결과를 재조회할 때 그 ID를 유지해요. 키는 분류에 사용하며 자식 모델의 실행·구독 인증과는 별개예요.

자동 setup이 새로 만드는 MCP에는 decisions와 호스트별 private 원장 경로가 이미 지정돼요. 기존 Aptly 등록의 provider·원장 경로는 보존하므로 fixture 설정이 남아 있으면 직접 확인해요. API 키는 호스트를 시작하는 안전한 환경에서 MCP 프로세스로 전달해요. 자동 설치는 키를 설정 파일에 저장하지 않아요.

`aptly config`로 만든 수동 조각을 사용할 때는 다음을 확인해요.

- **Claude Code:** 생성한 조각의 `mcpServers.aptly.env`에서 고정 fixture 값을 decisions로 바꾸고 절대 원장 경로를 추가해요. 아래는 해당 `env` 필드만 보여 주는 예예요. 키는 설정 JSON 밖의 안전한 실행 환경에서 서버에 전달해요.
- **Codex:** 생성한 `env_vars`에 이미 `OPENAI_API_KEY`·`ROUTER_PROVIDER`·`ROUTER_LEDGER_PATH`가 포함돼 있어요. 호스트를 시작하는 환경에 위 값을 준비해 서버에 전달해요. 별도로 고정한 fixture 값이 있다면 함께 확인해요.

```json
{
  "env": {
    "ROUTER_PROVIDER": "decisions",
    "ROUTER_LEDGER_PATH": "/absolute/private-aptly-state/advisory-ledger.json"
  }
}
```

환경을 준비한 뒤 호스트가 새 환경을 받도록 실행하고 MCP 서버를 재시작해요. 부모 셸의 환경을 바꾸는 것만으로 실행 중인 서버가 전환되지는 않아요. 이미 열린 GUI 호스트도 다른 터미널의 `export`를 자동으로 상속하지 않으므로 호스트의 안전한 환경 전달 방법을 확인해요. 원장 경로는 서버가 실행되는 장비에서 접근 가능한 절대 경로여야 해요.

원장은 완료 결과 재사용·unknown 재호출 방지·호출 수·지연·추정 비용 가드에 사용해요. 로컬 가드는 실제 계정의 청구 상한이 아니에요. 결과의 usage와 latency는 분류 관측값이며 자식 실행 비용·구독 사용량·총비용 절감과 구분해요.

## 기본 후보와 환경변수

Codex가 자식 메시지를 암호문으로 Hook에 전달하면 Aptly는 그 본문을 해독하지 않아요. `sort_supplied_numbers_3_1_2_ascending_without_tools`처럼 작업 종류와 범위를 설명하는 `task_name`을 사용해요. 이런 구체적인 이름만 평문 요약으로 분류하며 짧거나 모호한 이름은 원래 모델을 유지해요. `get_routing_capabilities`의 `automatic_hook.last_result`에서 마지막 Hook의 적용·보존 사유를 확인할 수 있어요. 작업 본문과 개인 설정 값은 진단에 포함하지 않아요.

기본 후보는 다음 여섯 프로필이에요. 등급은 Aptly의 운영 프리셋이며 서로 다른 모델의 성능이 동급이라는 뜻은 아니에요. Claude 프로필에는 effort를 지정하지 않아요.

| 호스트 | 프로필 ID | 모델 | effort | 대표 작업 |
|---|---|---|---|---|
| Codex | `codex-simple` | `gpt-6-luna` | `max` | 추출·형식 변환·작은 기계적 수정 |
| Codex | `codex-routine` | `gpt-6.1-terra` | `high` | 문맥을 고려한 작성·번역·범위가 명확한 구현 |
| Codex | `codex-deep` | `gpt-6.1-sol` | `medium` | 복합 디버깅·설계 판단·심층 검토 |
| Claude Code | `claude-simple` | `haiku` | 지정 안 함 | 추출·형식 변환·작은 기계적 수정 |
| Claude Code | `claude-routine` | `sonnet` | 지정 안 함 | 문맥을 고려한 작성·번역·범위가 명확한 구현 |
| Claude Code | `claude-deep` | `opus` | 지정 안 함 | 복합 디버깅·설계 판단·심층 검토 |

프로세스 환경에서 모델명 배열을 **JSON 문자열**로 전달해 후보를 좁힐 수 있어요.

```sh
export APTLY_CLAUDE_MODELS='["haiku","sonnet","opus"]'
export APTLY_CODEX_MODELS='["gpt-6-luna","gpt-6.1-terra","gpt-6.1-sol"]'
```

MCP의 `env`에 적을 때도 배열 자체가 아닌 문자열을 사용해요. 기존 provider·원장·Hook 정책 설정과 병합해요. `config codex`의 수동 조각은 이 이름들을 `env_vars`에 포함하지만, 자동 setup이 새로 만드는 등록에는 필요한 후보·캐시 환경을 별도로 추가해요.

```json
{
  "env": {
    "APTLY_CLAUDE_MODELS": "[\"haiku\",\"sonnet\",\"opus\"]",
    "APTLY_CODEX_MODELS": "[\"gpt-6-luna\",\"gpt-6.1-terra\",\"gpt-6.1-sol\"]"
  }
}
```

미지정이면 기본 후보를 사용하고, `[]`이면 해당 호스트의 추천을 비활성화해요. 빈 문자열·중복·지원하지 않는 모델·잘못된 JSON은 설정 오류예요. `CLAUDE_MODELS`·`CODEX_MODELS`도 별칭으로 지원하지만 같은 제공사의 기본 이름과 별칭을 동시에 설정하면 오류예요.

후보 설정은 계정의 모델 사용 가능성을 인증하거나 기존 모델·effort·역할·fork·권한 선택을 덮어쓰지 않아요. 현재 활성 후보는 API 호출 없이 확인할 수 있어요.

```sh
aptly capabilities
```

## 공식 모델 정보 갱신하기 — 선택 사항

기본 모델 설명이 동봉돼 있어 처음 실행할 때 문서를 가져올 필요는 없어요. 최신 공식 Markdown을 반영하려면 명시적으로 갱신해요. 앞에서 준비한 현재 사용자 소유·권한 700 디렉터리를 사용하거나, 같은 조건으로 새 parent 디렉터리를 먼저 준비해요.

```sh
aptly catalog refresh --output /absolute/private-aptly-state/model-info.json
export APTLY_MODEL_INFO_PATH=/absolute/private-aptly-state/model-info.json
```

이 명령은 고정된 공개 공식 문서 두 곳에 네트워크 요청을 보내며 API 키를 요구하지 않아요. 출력 parent는 자동 생성하지 않아요. 검증한 짧은 모델 정보만 캐시하고, 기존의 유효한 Aptly 캐시는 갱신할 수 있지만 관계없는 기존 파일은 덮어쓰지 않아요. 갱신 실패 시 기존 파일을 보존해요. 서버는 시작할 때 캐시를 읽고, 7일을 넘기거나 유효하지 않으면 동봉 설명을 사용해요.

MCP에는 `APTLY_MODEL_INFO_PATH`를 `env`에 추가하거나, 호스트의 안전한 환경 전달 설정을 통해 전달해요. 경로를 지정하거나 캐시를 바꾼 뒤 MCP 서버를 재시작해요. 문서 갱신은 새 모델을 후보에 자동 추가하거나 계정 접근 가능성을 확인하지 않아요.

## 요청·결과·오류 처리

요청의 `task.summary`에는 분류에 필요한 최소 요약만 넣어요. `task.operation`은 `read_only`·`write`·`review`·`analysis` 중 하나예요. `context_sufficient`는 호출자가 맥락의 충분함을 선언하는 값이에요.

`eligible_profile_ids`를 생략하면 해당 호스트의 활성 후보를 사용해요. 지정하면 그 안에서 후보를 더 제한해요. `constraints`에는 보존할 `model_pinned`·`effort_pinned`·`role_pinned`·`fork_inherits` boolean을 선언할 수 있어요. 하나라도 true이면 기존 선택을 보존해요. 이를 생략한 요청이 실제 호스트에 pin이 없다고 인증하는 것은 아니에요.

| status | 다음 행동 |
|---|---|
| `recommended` | `profile`을 검토하고 기존 호스트에서 별도로 선택해요 |
| `keep_current` | 명시 선택을 유지하거나 추천을 보류해요 |
| `needs_context` | 필요한 요약을 보완하고 변경된 요청에는 새 ID를 사용해요 |
| `unavailable` | `reason`을 확인하고 이전 요청의 상태부터 확인해요 |

CLI는 결과 JSON을 stdout에, 실행·설정 오류의 안전한 코드를 stderr에 출력해요. 종료 코드만으로 추천 성공을 판단하지 않고 JSON의 `status`와 `reason`을 확인해요. MCP에서는 `recommend_agent` 응답의 structuredContent를 확인해요. MCP 인자 형식 오류는 도구 validation 오류로 표시될 수 있어요.

같은 결과를 재조회할 때는 **같은 `request_id`·입력·정책·provider·원장**을 유지해요. 완료 결과는 캐시에서 재사용해요. 입력이나 후보·설명이 바뀐 채 같은 ID를 쓰면 `request_conflict`가 될 수 있어요.

`outcome_unknown`은 이전 호출의 결과나 청구 여부가 불명확하다는 뜻이에요. 새 ID로 자동 재호출하거나 원장을 비워 우회하지 않아요. 기존 ID의 상태와 실행 중인 프로세스를 먼저 확인해요. 재조회만으로 원격 API의 미확인 결과가 자동 복원되지는 않아요. `ledger_locked`이면 기존 프로세스가 실행 중인지 확인하고 실행 중인 lock을 삭제하지 않아요.

자세한 계약과 복구 예제는 [추천 사용 안내](docs/ADVISORY_USAGE.md)에 있어요. 이 동봉 문서의 소스 실행 예제는 소스 체크아웃용이며, npm 설치에서는 앞의 `aptly` 명령을 사용해요.

## 진단하기

```sh
aptly --help
aptly capabilities
aptly report --format both --output-dir /absolute/private-aptly-state/reports
```

`report`는 같은 report ID의 Markdown·JSON 첨부 파일을 로컬 private 디렉터리에 만들어요. API 호출이나 업로드는 하지 않아요. 업무 본문·키·환경 값·개인 경로·원시 오류는 첨부 내용에 넣지 않아요. 공유 전에 파일을 검토해요. 키 존재 여부를 확인한 결과는 API 인증 성공이나 호스트 전체 설정 확인을 뜻하지 않아요.

## 기여자를 위한 소스 개발

소스 체크아웃에서 개발할 때만 아래 명령을 사용해요. 설치한 npm 패키지의 `node_modules`에서 `.ts`를 직접 실행하지 않아요.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
npm test
npm run poc
npm run check:release
```

기본 시험과 fixture smoke는 유료 API·실제 자식 실행 없이 동작해요. 릴리스 검사는 공개 후보와 npm file allowlist·패키징을 확인하며 npm 게시나 Git push를 하지 않아요. 현재 호스트 내부 패치 연구는 보류 상태이고 추천 사용의 선행 조건이 아니에요.

---

> 편집자용 배포 전 점검 — 아래는 README 본문에 포함하지 않아요.
>
> - 현재 `private: true`이므로 실제 게시 결정 후 별도로 배포 설정을 준비해야 해요. 이 초안은 해당 값을 변경하지 않아요.
> - 게시 직전에 npm 이름·소유 계정·권한·버전을 확인해야 해요. `aptly@0.1.0`의 현재 가용성이나 소유권은 이 초안에서 확인하거나 주장하지 않아요.
> - 현재 npm `files`에는 README·LICENSE·examples와 `docs/ADVISORY_USAGE.md`·`docs/DRAFT_0_1_0.md`만 문서로 포함돼요. 기존 README의 다른 문서 링크는 대부분 npm archive 밖을 가리키므로, 본문 적용 시 실제 패키지에 들어가는 문서와 링크를 다시 확인해야 해요. 동봉 ADVISORY_USAGE의 소스 경로·제외 문서 링크도 함께 검토해야 해요.
> - 현재 안내는 미래의 npm 설치 경로를 가정해요. 실제 공개 후보에서 postinstall·건너뛰기·재설치·제거·버전·fixture·MCP 연결·진단·문서 링크를 검증한 뒤 적용해요. 검증 전 npm 설치 성공·원격 저장소 URL·게시 완료를 추가하지 않아요.
