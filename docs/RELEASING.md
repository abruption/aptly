# npm OIDC 배포와 공개 준비

## 0.1.3 릴리즈 준비

현재 소스의 게시 후보 버전은 `0.1.3`입니다. 기존 표준 MCP 등록의 명시적 이전(`--include-existing`), 검증된 전역 설치의 `aptly update`와 npm dry-run 거절, 대화형 CLI의 신규 버전 알림, npm 설치 스크립트 허용 안내를 포함합니다. [한국어 릴리즈 노트 초안](release-notes/0.1.3.md)과 [Changelog](../CHANGELOG.md)를 확인하십시오.

이 항목은 **게시 준비 상태**를 기록합니다. `v0.1.3` 태그·npm 게시·0.1.3 provenance 검증은 아직 수행하지 않았습니다. 준비 PR 병합과 해당 main CI 성공 후, 별도 게시 지시를 받고 태그를 push해야 합니다. 이전 버전의 artifact·digest·OIDC 실행 결과를 0.1.3의 검증 근거로 재사용하지 않습니다. 실제 게시 후 이 문서와 릴리즈 노트를 결과에 맞게 갱신하십시오.

## 0.1.2 게시와 검증

2026-11-06에 `v0.1.2` 태그로 [Actions OIDC 게시](https://github.com/abruption/aptly/actions/runs/42151554506)를 실행하고, registry 파일·무결성과 인증서 기반 provenance를 검증했습니다. 확인 당시 npm `latest`는 0.1.2입니다. source SHA·run·attempt·digest·검증 결과는 [0.1.2 릴리즈 근거](releases/0.1.2.md)에 기록했습니다. 이후 버전도 준비 PR 병합과 main CI 확인 후 태그를 push하면 실제 게시가 시작됩니다. 일반 설치 문서는 계속 `aptly@latest`를 사용합니다.

이 버전은 실행 경로 사전 진단·명시적 갱신, 설정 중 충돌 감지와 조건부 키 복구, 프로세스 수명 원장 잠금, 분류 전송 필드 제한과 공유 안내를 포함합니다. 기본 confidence·공유 정책을 변경한 릴리즈는 아니며 #14·#15는 별도 결정 사항입니다. 상세 변경은 [Changelog](../CHANGELOG.md), 잠금 이전 경계는 [원장 잠금 안내](LEDGER_LOCKING.md)를 확인하십시오.

영속 원장 사용자는 설치 전에 관련 호스트·MCP·CLI writer를 모두 정지하고 함께 업그레이드해야 합니다. 구형 writer와 새 영구 SQLite `.lock`의 혼합 운영은 지원하지 않습니다. 기존 빈/미확인 잠금은 자동 복구하지 않으며, 원장·비용·`unknown`·완료 캐시를 보존한 보수적 오프라인 전환만 안내합니다. 이번 게시·검증에서는 실제 운영 원장을 이전하거나 키를 수집하지 않았습니다.

배포 워크플로의 일회성 설치 시험과 새 runner의 패키징을 분리한 경계는 유지합니다. 이번 실행에서 새로 만든 artifact와 registry 파일을 독립적으로 비교하고 npm 서명 검증·GitHub CLI 인증서 정책 검증을 통과했습니다. 이전 0.1.1의 archive digest·실행 번호·검증 성공을 0.1.2의 결과로 재사용하지 않았습니다. 아래 재현 절차의 버전·태그·source SHA·run·attempt는 검증할 릴리즈의 실제 값으로 바꿔 사용하십시오.

0.1.2 게시 전 GitHub `npm` environment의 `v*` 태그 제한은 조회로 재확인했습니다. 로컬 npm 관리자 세션 만료로 Trusted Publisher 설정 목록의 새 조회는 불가능했으므로, 이를 새로 확인했다고 기록하지 않습니다. 로컬 npm 로그인은 Actions 배포에 사용하지 않았으며, 기존 OIDC 경로의 실제 게시 성공과 검증된 인증서 identity로 이번 실행을 확인했습니다.

## 0.1.1 게시와 Issue #18

2026-11-05에 `aptly@0.1.1`을 GitHub Actions의 OIDC로 게시하고 registry의 provenance를 검증했습니다. [실제 릴리즈 근거](releases/0.1.1.md)에 source SHA·workflow 실행·archive digest·검증 도구와 결과를 기록했습니다. 설치 시험을 릴리즈 패키징과 분리한 job 경계를 유지합니다. 이후 버전도 준비 PR 병합과 main CI 확인 후 해당 버전의 태그를 push하면 실제 게시가 시작됩니다. 새 태그 push 자체가 게시를 시작하므로 먼저 push한 뒤 dry run으로 확인하는 순서로 진행하지 마십시오.

[Issue #18](https://github.com/abruption/aptly/issues/18)의 실제 게시·검증 근거는 위 릴리즈 기록으로 제출합니다. 준비 PR·무료 시험·dry run 성공만으로 완료를 선언하지 않습니다. 아래 절차는 실제 0.1.1 검증에도 사용했으며, 이후 버전에서는 버전·SHA·실행 번호를 해당 릴리즈에 맞게 바꾸십시오.

2026-11-05 사용자 승인에 따라 GitHub `npm` environment의 배포 대상을 **태그 `v*`만** 허용하도록 설정하고 조회로 확인했습니다. 별도 required reviewer가 있다는 뜻은 아닙니다. 0.1.1 게시 전 npm Trusted Publisher도 `abruption/aptly`·`publish.yml`·environment `npm`·직접 게시 허용에 연결됐음을 재확인했습니다. 이후 게시 전에도 연결을 확인합니다. `npm trust list aptly`가 추가 인증을 요구하면 인증을 완료하고, 자격·신뢰 설정 ID는 공개 증거에 복사하지 않습니다.

GitHub Actions용 [배포 워크플로](../.github/workflows/publish.yml)를 준비했습니다. 수동 실행의 기본값은 검증과 archive 생성만 수행하는 dry run이며, `v*` 태그 push는 OIDC 게시를 자동 실행합니다. 실제 원격 저장소 생성·push·npm 게시·계정 설정은 이 문서 준비와 별개입니다.

공개 소스 저장소는 [abruption/aptly](https://github.com/abruption/aptly)이며, `package.json`의 `repository.url`에도 같은 주소를 기록했습니다. `aptly` 0.1.0은 `private: false`와 공개 npm registry·provenance·`latest` 게시 설정을 명시합니다. CI는 메타데이터를 임시로 바꾸지 않으며 기본 dry run에서는 게시하지 않습니다.

0.1.0의 최초 게시에는 태그 `v0.1.0`의 검증된 tarball을 그대로 사용했고, 로그인한 npm 계정의 인증으로 게시했습니다. 최초 버전에는 CI provenance가 첨부되지 않았습니다. 이 부트스트랩 예외는 이후 CI 배포의 provenance 설정을 해제하지 않습니다. 후속 0.1.1은 Trusted Publisher를 사용하는 실제 Actions OIDC 게시와 registry attestation 검증을 모두 통과했습니다. dry run 성공은 실제 OIDC 게시 성공을 대신 검증하지 않습니다.

## 워크플로 동작

`npm OIDC publish`는 `v*` 태그 push에서 OIDC 게시를 자동 실행합니다. 일반 브랜치 push·PR은 게시하지 않습니다. `workflow_dispatch`도 지원하며 수동 실행의 `dry_run` 기본값은 `true`입니다.

설치된 패키지 시험은 전용 일회성 job에서 실행합니다. 이 시험은 npm 의존성의 lifecycle script를 실행할 수 있으므로 릴리즈 archive를 만드는 job과 runner를 공유하지 않습니다. 시험 job에는 OIDC 권한·게시 environment·artifact 업로드·출력·캐시를 제공하지 않습니다.

시험이 성공하면 준비 job이 새 runner에서 같은 태그를 checkout하고 `npm ci --ignore-scripts`로 잠긴 의존성을 새로 설치하여 타입 검사·빌드·검증·pack을 수행합니다. 설치 시험의 파일·캐시·archive를 전달받지 않습니다. publish job은 준비 job이 만든 artifact ID와 source SHA만 받아 검증·게시합니다. 시험의 성공 상태만 선행 조건으로 사용하며 시험 환경을 릴리즈 산출물의 출처로 사용하지 않습니다.

| 입력 | 값 |
|---|---|
| `release_tag` | `package.json` 버전과 일치하는 기존 태그. 예: `v0.1.0` |
| `dry_run` | 기본값 `true`. 검증·pack·검증 자료 보관까지만 수행 |

준비 작업은 Node.js 24에서 잠긴 의존성을 lifecycle script 없이 설치하고 타입·빌드·무료 시험·fixture MCP smoke·공개 파일 검사를 수행합니다. 이후 `npm pack --ignore-scripts`로 archive를 만들고 SHA-256과 소스 commit·태그·패키지 정보를 기록합니다. 이 작업에는 OIDC 발급 권한이 없습니다.

`v*` 태그 push 또는 수동 실행의 `dry_run: false`인 경우에만 `npm` environment의 publish 작업으로 이어집니다. 해당 작업에만 `id-token: write`를 부여하고, 준비 작업의 정확한 source SHA를 checkout합니다. 같은 실행이 생성한 artifact ID로 archive를 내려받아 commit·태그·메타데이터·SHA-256을 다시 검사한 뒤 그 archive만 게시합니다. 안정 버전은 `latest`, 프리릴리즈는 `next` dist-tag를 사용합니다. 오류나 불명 결과를 새 실행으로 무조건 재시도하지 마십시오.

게시 명령은 `--access public --provenance --ignore-scripts`와 npm registry를 명시합니다. CI 의존성 캐시와 checkout 자격 보관을 끄며 `NPM_TOKEN`·`NODE_AUTH_TOKEN` secret으로 대체 인증하지 않습니다. `setup-node`에는 `registry-url`을 주지 않고, runner 임시 경로의 npm 설정 파일에는 registry 주소만 기록합니다. 원시 npm 설정이나 자격 값을 로그로 출력하지 마십시오.

## npm과 GitHub에 연결할 항목

[공식 npm Trusted Publishing 안내](https://docs.npmjs.com/trusted-publishers/)를 기준으로 다음 값을 패키지 Settings의 Trusted Publisher에 등록하십시오. 아래 값은 현재 공개 저장소와 워크플로의 정확한 연결 정보입니다.

| npm 설정 | 이 워크플로와 맞출 값 |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `abruption` |
| Repository | `aptly` |
| Workflow filename | `publish.yml` — 전체 경로가 아닌 파일 이름 |
| Environment | `npm` |
| Allowed action | 직접 게시에 필요한 **Allow npm publish** 활성화 |

필드의 대소문자와 이름이 실행의 identity와 정확히 일치해야 합니다. 신규 설정은 첫 성공 게시로 검증되며, 생성 후 2일 안에 검증되지 않으면 만료될 수 있으므로 실제 게시 준비가 된 시점에 설정하십시오. `npm stage publish` 허용만으로는 이 워크플로의 직접 게시 권한이 생기지 않습니다.

GitHub의 `npm` environment에는 필요한 검토자와 배포 가능한 태그 규칙을 별도로 설정하십시오. YAML의 `environment: npm`은 그 연결 이름을 지정할 뿐, 보호 규칙을 생성하거나 검토 승인을 대신하지 않습니다.

[npm CLI의 trust 명령](https://docs.npmjs.com/cli/v11/commands/npm-trust/)으로 설정할 수도 있습니다. 아래 명령은 계정 설정을 변경하는 예시이며 CI에서 실행하지 않습니다.

```sh
npm trust github aptly --file publish.yml --repo abruption/aptly --env npm --allow-publish
```

신규 패키지의 소유권 확보·최초 게시 절차가 필요한 경우 CI와 별도로 결정하십시오. 이 준비는 최초 패키지 등록을 수행하거나 OIDC만으로 최초 등록이 가능함을 보장하지 않습니다. npm 패키지 Settings에서 연결할 수 있는 상태와 게시 권한을 먼저 확인하십시오.

## 실제 게시 전 확정할 사항

- 공개 저장소와 npm 패키지의 소유권·이름·접근 범위를 확정하십시오. [provenance를 사용할 공개 저장소·공개 패키지 조건](https://docs.npmjs.com/generating-provenance-statements/)과 실제 저장소에 일치하는 `repository.url`을 확인하십시오.
- 게시 후보의 `private: false`, 실제 저장소 정보와 `publishConfig`를 검토하십시오. 실제 게시는 별도로 결정하며 CI 내부에서 임시로 값을 바꾸지 마십시오.
- Node.js 24와 npm 11.5.1 이상이 필요합니다. workflow는 최소 버전을 검사하며, [setup-node의 OIDC 안내](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#publishing-to-npm-with-trusted-publisher-oidc)에 따라 캐시를 사용하지 않습니다.
- 프로젝트 `.npmrc`나 token 환경변수가 게시 인증에 섞이지 않도록 확인하십시오. 필요한 OIDC 권한은 publish 작업에서만 부여합니다.
- release tag는 패키지 버전과 일치해야 하며 그 commit에 workflow와 검증 helper가 포함돼 있어야 합니다. 태그·commit·archive가 달라지면 검증을 다시 수행하십시오.

게시 후보의 공개 설정은 다음과 같습니다. 실제 GitHub 저장소의 대소문자까지 일치해야 합니다. 아래 설정만으로 npm에 게시되지는 않습니다.

```json
{
  "private": false,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/abruption/aptly.git"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/",
    "provenance": true,
    "tag": "latest"
  }
}
```

## 실행 순서

1. GitHub Actions에서 **npm OIDC publish**를 선택하고 기존 `release_tag`와 `dry_run: true`로 실행하십시오. dry run에는 OIDC 권한이나 npm 게시 단계가 없으며, `private: true` 패키지도 pack할 수 있습니다.
2. 보관된 tarball·`release-manifest.json`·`SHA256SUMS`를 검토하십시오. 이 성공은 npm 측 Trusted Publisher 연결이나 실제 게시 성공을 인증하지 않습니다.
3. 실제 게시 준비가 끝나면 Actions의 **Use workflow from**에서도 해당 release tag를 선택하고, 같은 `release_tag`와 `dry_run: false`를 지정하십시오. 실제 publish 모드는 실행 ref 자체가 그 태그이고 event SHA·checkout·archive 소스가 일치해야 합니다.
4. `npm` environment의 보호 절차를 거쳐 게시합니다. 실패·시간 초과 뒤에는 해당 실행과 registry 결과를 먼저 확인하고 새 버전이나 새 실행으로 무작정 재게시하지 마십시오.

실제 GitHub 원격 실행과 npm OIDC 교환은 로컬 검증만으로 확인할 수 없습니다. 최신 원격 CI 상태는 [GitHub Actions](https://github.com/abruption/aptly/actions)에서 확인하십시오. 소스 공개, CI 성공, npm 게시 성공은 각각 별도로 확인해야 합니다.

## 버전별 GitHub Release 노트

버전별 노트 원본은 `docs/release-notes/`에 보관하고, GitHub Release 본문에도 같은 내용을 게시합니다. npm 게시와 출처 검증 기록인 `docs/releases/`와 구분하여 사용자에게 필요한 변경 내용을 먼저 보여 줍니다.

노트에는 다음 항목을 포함합니다.

- **주요 변경:** 이전 태그 대비 추가·수정된 동작을 설명합니다.
- **해결한 이슈·PR:** 실제 해당 태그에 포함된 수정만 연결합니다. 부분 구현은 상위 이슈가 완료됐다고 쓰지 않습니다.
- **업그레이드 주의사항:** 호환성, 필요한 사용자 조치와 지원하지 않는 경우를 명시합니다.
- **배포·검증:** npm 버전과 실제 Actions 실행·출처 검증 상태를 구분합니다. 과거 초기 게시의 검증 한계도 그대로 남깁니다.
- **전체 변경:** 이전 태그와의 compare 및 정확한 npm 버전·소스 태그 링크를 제공합니다.

새 버전은 실제 npm 게시와 provenance 검증 후 Release를 게시합니다. 기존 태그를 확인하는 `--verify-tag`를 사용하며 태그를 새로 만들거나 이동하지 않습니다. 예시의 버전은 실제 대상 버전으로 바꿉니다.

```sh
aptly_release_version=X.Y.Z
gh release create "v${aptly_release_version}" --repo abruption/aptly --verify-tag \
  --title "Aptly ${aptly_release_version}" \
  --notes-file "docs/release-notes/${aptly_release_version}.md" --latest
```

이미 Release가 있으면 내용을 확인한 후 `gh release edit`로 노트만 갱신합니다. 과거 버전의 사후 기록은 `--latest=false`로 등록하고, npm 최초 게시 시점과 사후 노트 작성임을 구분합니다. 현재 워크플로는 태그 push 또는 명시적 dispatch에서만 npm을 게시하므로, 기존 태그의 GitHub Release 노트 작성은 npm 재게시가 아닙니다.

## 게시 후 provenance 검증

직접 암호 검증기를 만들지 않고 [npm 서명 검증](https://docs.npmjs.com/cli/v11/commands/npm-audit/)과 [GitHub CLI attestation 검증](https://cli.github.com/manual/gh_attestation_verify)을 사용합니다. 아래 명령은 확인한 npm 11.19.1·GitHub CLI 2.103.3 기준입니다. npm의 정확한 옵션은 `--include-attestations`입니다. 도구를 바꾸면 옵션·출력 스키마도 확인하십시오.

1. 게시 실행의 source SHA, workflow run ID·attempt, 태그와 결과를 기록하고, 그 실행의 `npm-release-RUN_ID-ATTEMPT` artifact를 내려받습니다. `release-manifest.json`의 source SHA·태그·버전·archive SHA-256과 실제 파일을 대조합니다. 실행 번호는 예시 그대로 쓰지 말고 실제 게시 실행으로 바꿉니다.

   ```sh
   gh run view RUN_ID --repo abruption/aptly --json databaseId,attempt,headSha,workflowName,url
   gh run download RUN_ID --repo abruption/aptly --name npm-release-RUN_ID-ATTEMPT --dir /absolute/private/release-evidence/artifact
   npm view aptly@0.1.1 dist --json --registry=https://registry.npmjs.org/
   ```

2. registry의 tarball을 별도 파일로 받아 SHA-256이 준비 artifact와 같은지, SHA-512가 registry의 `dist.integrity`와 같은지 확인합니다. 내려받은 metadata의 URL이나 `gitHead`만으로 provenance 검증 성공을 선언하지 않습니다.

3. 별도의 비공개 검증 디렉터리에 정확한 버전을 lifecycle script 없이 설치하고 npm의 서명 검증을 실행합니다. 검증 디렉터리와 증거 디렉터리는 실제 절대 경로로 지정하고 로컬 임시 경로 규칙을 따릅니다. 이 설치는 전역 설치나 사용자 호스트 설정을 바꾸지 않습니다.

   ```sh
   APTLY_SKIP_SETUP=1 npm install --prefix /absolute/private/release-evidence/verify --save-exact --ignore-scripts --no-audit --no-fund aptly@0.1.1
   npm --prefix /absolute/private/release-evidence/verify audit signatures --json --include-attestations > /absolute/private/release-evidence/npm-signatures.json
   ```

   종료 코드와 `invalid`·`missing`을 확인하고, `verified` 배열에 **정확한 `aptly@0.1.1`의 SLSA provenance가 하나** 있는지 확인합니다. 오류 배열이 비어 있거나 종료 코드가 0인 것만으로 해당 패키지의 attestation 존재를 증명하지 않습니다. `verified`의 해당 항목에서 `attestationBundles` 중 `predicateType`이 `https://slsa.dev/provenance/v1`인 항목의 `bundle`을 별도 JSON 파일로 저장합니다. npm 검증은 서명과 registry의 패키지 subject·SHA-512 결합을 확인합니다.

4. 그 bundle과 registry에서 받은 tarball을 GitHub CLI로 검증하여 인증서에 연결된 저장소·source SHA·태그·workflow identity를 제한합니다. `SOURCE_SHA`는 artifact와 게시 실행에서 확인한 실제 immutable SHA로 바꿉니다.

   ```sh
   gh attestation verify /absolute/private/release-evidence/aptly-0.1.1.tgz \
     --bundle /absolute/private/release-evidence/provenance-bundle.json \
     --digest-alg sha512 --repo abruption/aptly \
     --source-digest SOURCE_SHA --source-ref refs/tags/v0.1.1 \
     --cert-identity https://github.com/abruption/aptly/.github/workflows/publish.yml@refs/tags/v0.1.1 \
     --deny-self-hosted-runners --format json \
     > /absolute/private/release-evidence/gh-provenance.json
   ```

   `--cert-identity`와 `--signer-workflow`는 함께 사용하지 않습니다. 검증 출력의 `verificationResult.signature.certificate`에 있는 `sourceRepositoryDigest`, `sourceRepositoryURI`, `sourceRepositoryRef`, `buildSignerURI`와 `runInvocationURI`도 기대값과 대조합니다. `issuer`는 `https://token.actions.githubusercontent.com`, `runnerEnvironment`는 `github-hosted`여야 합니다. `runInvocationURI`는 `https://github.com/abruption/aptly/actions/runs/RUN_ID/attempts/ATTEMPT`와 일치해야 합니다. 디코딩한 predicate의 실행 번호만 확인하는 것으로 대체하지 않습니다.

5. 사용한 도구 버전, source SHA, run·attempt, artifact/registry digest·integrity, npm 검증과 인증서 identity 대조 결과를 공개 가능한 요약으로 기록합니다. registry 게시 성공과 provenance 검증 성공을 별도 상태로 남기고 둘 다 확인한 뒤 Issue #18의 완료 근거로 제출합니다. 키·토큰·npm 인증 설정·신뢰 설정 ID·개인 경로는 제외합니다.

검증 실패·누락·시간 초과는 새 버전 재게시로 해결하지 않습니다. 먼저 기존 Actions 실행과 registry의 버전·integrity·attestation 상태를 확인하여 이미 게시됐는지 판단하고, 동일 버전의 검증만 다시 진행하십시오. 일반 공개 패키지로 도구 호환성을 확인한 결과는 Aptly의 실제 릴리즈 검증을 대신하지 않습니다.

## 로컬 검증과 공개 파일

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
npm test
npm run poc
npm run check:release
```

공개 파일 검사는 금지 패턴·symlink·MIT 메타데이터와 닫힌 npm `files` 허용 목록을 확인합니다. Git에 공개할 소스와 npm archive에 넣을 파일의 범위는 다릅니다. npm에는 compiled 제품·예제·README 4개·언어별 가이드 4개·선택한 사용 문서만 포함합니다. 개발 소스·시험·개인 래퍼·원본 증거·자격 파일·로컬 지침은 npm archive에 넣지 않습니다.

`.gitignore`는 로컬 파일을 제외하는 준비이며 이미 추적한 파일을 제거하거나 비밀 노출 여부를 보증하지 않습니다. 실제 commit 전에 선택한 파일 목록과 검사 결과를 검토하십시오. 회사 identity나 기존 전역 Git 설정을 임의로 변경하지 마십시오.

## 보존한 검증 이력

이 절 아래의 preview·초안·미게시 표현과 전달 후보 경로는 당시 상태를 보존한 이력이며 현재 설치 절차가 아닙니다. 현재 설치는 [사용 가이드](guide/ko.md), 최초 0.1.0 게시와 다음 OIDC 검증 범위는 이 문서 상단을 따르십시오.

아래 기록은 각 작업 당시의 checkpoint입니다. 현재 OIDC 게시 성공이나 최신 archive의 파일 범위·시험 수치로 대체하지 않습니다.

## Aptly 전환에서 확인한 결과

2026-11-05에 144개 시험·typecheck/build·fixture smoke·릴리스 검사와 별도 오프라인 archive 설치를 통과했습니다. 새 `aptly` 실행 파일·실행 권한·compiled CLI·두 호스트 config·보고서·MCP 네 도구를 확인했습니다. 이전 CLI 파일은 패키지에 포함되지 않으며 과거 보고서의 식별자는 보존합니다. 유료 호출·전역 설치·게시·원격 CI 실행은 없었습니다.

## 이전 준비에서 확인한 결과

2026-11-03 로컬 검증에서 회귀 142건이 skip 없이 통과했고 fixture MCP smoke와 공개 후보·패키지 allowlist 검사도 통과했습니다. npm archive는 35개 파일만 포함했으며, 별도 임시 디렉터리에 설치한 CLI의 버전·fixture MCP 네 도구를 확인했습니다. 이 과정에 유료 호출·전역 설치는 없었습니다. GitHub 원격 CI는 아직 실행하지 않았습니다.

진단 report 기능은 같은 ID의 Markdown·JSON 파일과 GitHub JSON 첨부 양식을 포함합니다. 실제 생성·권한·비밀 제외·덮어쓰기 방지 회귀를 실행했으며 원격 이슈 작성·업로드는 수행하지 않았습니다.

## 이름 검토와 TypeScript 전환

2026-11-03 npm registry 직접 조회에서 `subagent-router` 0.2.3이 이미 등록된 것을 확인했습니다. 당시 이름과 분야가 겹쳐 다른 이름을 검토했고, 2026-11-05에 Aptly로 전환했습니다. `subagentrouter`의 미등록 응답만으로 게시 가능성을 보장하지 않습니다. [등록된 패키지](https://www.npmjs.com/package/subagent-router) · [npm 이름 지침](https://docs.npmjs.com/package-name-guidelines/)

모든 프로젝트 소스·테스트·스크립트 파일을 .ts로 전환했고, strict NodeNext 컴파일·타입 선언·소스 실행과 설치 실행의 경로를 구분합니다. 의존성 코드와 과거 검증 기록은 변환하지 않습니다.

현재 추천 preview의 잔여 작업은 [ROADMAP](ROADMAP.md)의 AD 항목을 따릅니다. 호스트 내부 패치·전체 증거 통합·대규모 apply 평가는 추천 preview 공개의 선행 조건이 아닙니다. 보존한 host 연구 patch/docs를 공개 소스에 포함할지는 최종 source candidate에서 명시적으로 결정하고, 필수 설치 단계로 안내하지 않습니다. npm allowlist는 현재도 그 연구·private 개발 소스를 포함하지 않습니다.

## 현재 추천 preview 전달 후보 — 2026-11-05

AD-001~005의 전달물은 `.release/advisory-preview-20261105/`에 따로 생성해 과거 브랜딩 archive를 덮어쓰지 않습니다. npm에는 compiled 제품·예제·ADVISORY_USAGE만 동봉하며 그 문서 하나를 정확한 allowlist로 허용합니다. source archive에는 보류한 연구 자료도 보존하되 필수 설치 기능으로 안내하지 않습니다. [현재 결과](ADVISORY_RESULTS.md), [수동 설치](ADVISORY_USAGE.md)를 확인하십시오. 게시/전역 설치/호스트 설정 설치는 수행하지 않습니다.

## 0.1.0 초안 전달 후보

후속 사용자 요청을 반영한 후보는 `.release/0.1.0-draft/`입니다. 이전 preview와 분리해 보관하고 registry/global 배포 없이 source/npm 설치를 확인하십시오. 사용 안내와 DRAFT_0_1_0.md만 정확한 docs allowlist로 npm에 동봉합니다. manifest와 verification.json이 최종 후보 파일·검증 근거이며, 새 후보의 실제 API 품질·비용 최적성은 주장하지 않습니다.
