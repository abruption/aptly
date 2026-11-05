# 진단 파일을 첨부해 오류 제보하기

`report`는 현재 로컬 진단 결과를 Markdown·JSON 파일로 저장해요. 파일을 직접 확인한 뒤 GitHub 이슈에 수동으로 첨부해요. 파일 생성이 이슈 작성·업로드·전송을 의미하지 않아요.

## 진단 파일 생성

소스 체크아웃에서는 다음 명령을 실행해요.

```sh
node bin/aptly.ts report --format both --output-dir reports
```

실행 파일을 설치해 PATH에 연결한 환경에서는 다음 명령을 사용할 수 있어요. 패키지 레지스트리에 게시됐다고 가정하는 설치 명령은 아니에요.

```sh
aptly report --format both --output-dir reports
```

기본 형식은 `both`, 기본 출력 디렉터리는 `reports`예요. 파일은 `diagnostic-<report_id>.md`와 `diagnostic-<report_id>.json` 형태로 생성되고, 같은 실행의 두 파일은 동일한 report_id를 사용해요. 하나만 필요하면 `--format md` 또는 `--format json`을 지정해요. GitHub 오류 제보는 기계가 읽을 수 있는 JSON을 기준으로 받으므로 JSON 파일이 필요하고, Markdown은 사람이 검토하기 위한 같은 결과의 선택 자료예요.

```sh
node bin/aptly.ts report --format json --output-dir reports
```

생성한 파일은 권한 600으로 기록하고 기존 파일을 덮어쓰지 않아요. 표준 출력은 report_id·생성 파일명·검사 요약을 담은 안전한 JSON이에요. 출력 디렉터리의 개인 절대 경로나 원시 오류를 출력하지 않아요.

새 출력 디렉터리는 권한 700으로 만들어요. 기존 디렉터리가 다른 사용자 소유이거나 group/other에 열려 있으면 권한을 임의로 바꾸지 않고 거부해요. 적절한 private 디렉터리를 직접 선택해 주세요. 경로 redirect나 기존 첨부 파일도 덮어쓰지 않아요.

| 고정 오류 코드 | 의미 |
|---|---|
| `report_invalid_options` | 지원하지 않는 옵션·형식·누락·중복 인자가 있어요 |
| `report_output_unavailable` | private 출력 위치를 안전하게 생성하거나 사용할 수 없어요 |
| `report_already_exists` | 같은 report_id의 기존 파일이 있어 덮어쓰지 않았어요 |
| `report_invalid_diagnostic` | 허용 목록·스키마를 만족하지 않아 파일을 생성하지 않았어요 |

파일 생성 명령의 성공 여부와 파일 안의 진단 상태는 별개예요. 명령이 정상 종료돼도 `summary.error`나 `summary.unknown`이 있을 수 있어요. report는 현재 상태를 자료로 남기는 기능이며 자동 수정·과거 오류 수집·완전한 doctor 검사를 대신하지 않아요.

## 파일에 포함하는 정보와 한계

| 범위 | 포함하는 값 |
|---|---|
| 식별 정보 | schema_version, 무작위 report_id, 생성 시각 |
| 실행 환경 | 도구 이름·버전, Node 버전, 운영체제 종류·아키텍처 |
| 검사 결과 | 허용된 검사 ID·상태·고정 코드와 ok/warning/error/unknown 개수 |
| 수집 범위 | 비밀·본문·경로·원시 오류의 제외 여부, network_requests와 paid_calls |

Aptly가 새로 생성하는 보고서의 `tool.name`은 `aptly`이고 `schema_version`은 `1`을 유지해요. renderer·export 검증기는 이전 `subagent-decisions` 이름의 보고서도 받아들이며 원래 이름을 보존해요. 저장된 과거 보고서를 새 이름으로 일괄 변환하지 않아요.

진단은 미리 정한 필드만 수집해요. 전체 환경변수 값·개인 경로·작업 요약·대화·원문 설정·transcript·원시 오류를 파일에 넣지 않아요. 추가 설명을 자동으로 자유 텍스트에 끼워 넣지 않아요.

키가 실행 환경에 존재하는지 확인한 결과는 인증 성공이나 사용 가능한 크레딧을 뜻하지 않아요. API 요청·유료 연결 시험·외부 전송은 수행하지 않고, Codex·Claude CLI를 자동 실행해 버전을 수집하지도 않아요. 현재 호스트의 최종 모델·권한·설정 우선순위를 전부 확인했다고 표현하지 않아요.

이 파일은 **생성 시점의 상태**예요. 이전 실패의 로그를 수집하거나 오류를 다시 실행하지 않으며, 원래 문제가 재현됐다는 증거를 대신하지 않아요. 지원하지 않거나 확인할 수 없는 검사는 unknown으로 남겨요. 파일에 의도적으로 넣지 않은 정보가 필요하면 공개 가능한 합성 재현으로 별도 설명해 주세요.

## GitHub 오류 제보

1. 생성한 파일을 직접 열어 내용을 검토해요. 추가로 작성하는 이슈 본문에도 키·개인 경로·업무 본문을 넣지 않아요.
2. 저장소의 **오류 제보** 양식에서 발생한 현상·최소 재현 절차·기대한 결과를 적어요.
3. JSON 파일의 `report_id`를 양식에 적고 JSON 업로드 영역에 해당 파일을 필수 첨부해요. report_id는 MCP 요청·세션 ID와 달라요.
4. 필요하면 같은 실행에서 생성한 Markdown 파일도 선택 영역에 추가해요. UI가 .md 첨부를 거부하면 검토한 Markdown 내용을 붙여 넣어도 돼요. Markdown만 생성했다면 `--format both` 또는 `--format json`으로 다시 생성하고 새 JSON의 report_id를 사용해요. 서로 다른 실행의 파일을 같은 report_id의 짝으로 취급하지 않아요.
5. 본문·첨부의 비밀 제외와 report_id 일치를 확인하고 직접 제출해요.

현재 양식은 GitHub의 `upload` 요소에 `required:true`, `accept:.json`을 지정해 JSON 파일 첨부와 확장자를 요청해요. 이 검사는 JSON 내부 스키마·비밀 비포함·report_id 일치를 검증하지 않아요. 선택 Markdown textarea와 체크박스도 내용 검증을 대신하지 않아요. 공개 저장소의 실제 원격 양식 렌더링은 아직 확인하지 않았으며 GitHub form schema의 변경 가능성도 있어요. [GitHub 공식 form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema)

보안 취약점·노출된 자격·private 설정이 관련된 경우 공개 이슈에 첨부하지 말고 [SECURITY](../SECURITY.md)의 비공개 제보 절차를 먼저 확인해요. 이 문서는 비공개 제보 기능이 이미 설정됐다고 보장하지 않아요.
