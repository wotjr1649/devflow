# 로컬 개발본 실행과 시험

Codex와 Claude Code는 같은 깨끗한 worktree의 커밋을 시험한다. Codex는 그 파일을 설치 캐시로 복사하고,
Claude Code는 `--plugin-dir`로 폴더를 직접 로딩한다. 두 호스트의 시험 프로필은 한 번 준비한 뒤 재사용한다.
이 안내는 PowerShell과 저장소 주 작업 트리 루트를 기준으로 한다.

## 실행 위치와 표시

| 대상 | 역할 | 로딩 방식과 표시 |
|---|---|---|
| Issue 작업 브랜치·worktree | 코드 수정, 검사, 커밋 | 개발 작업 위치 |
| `.work/plugin-test/source` | 검증할 커밋만 담는 설치 소스 | 두 호스트가 공유하는 detached worktree |
| `.work/plugin-test/smoke` | 도구·훅 동작을 시험하는 프로젝트 | 소스와 분리된 실행 위치 |
| `.work/plugin-test/codex-home` | Codex 시험 설정·인증·캐시 | `devflow@devflow-local` 설치 |
| `.work/plugin-test/claude-home` | Claude 시험 설정·인증·기록 | 직접 로딩한 `devflow@inline` |
| 실사용 프로필 | 배포된 버전 사용 | `devflow@wotjr1649` |

코드 수정은 Issue 작업 브랜치에서 한다. `source`는 시험할 커밋의 복사본으로 유지하고, 세션 기록이나
장부를 만들 수 있는 시험은 `smoke`에서 한다. 두 호스트가 사용하는 커밋을 바꿀 때는 진행 중인 시험을 먼저 종료한다.

`inline`은 원격 배포 표시가 아니다. Claude의 직접 로딩에서는 개발용 marketplace를 등록하지 않아도
Installed에 `devflow @ inline`이 나타난다. marketplace 설치를 선택했을 때만 `devflow@devflow-local` 식별자를 쓴다.
매니페스트 버전은 개발 중 그대로일 수 있으므로 버전 번호만으로 소스 커밋을 판단하지 않는다.

## 준비된 환경 열기

로컬 실행 스크립트가 준비돼 있다면 주 작업 트리 루트에서 실행한다.

```powershell
& ./.work/plugin-test/start.ps1
& ./.work/plugin-test/start-claude.ps1
```

각 명령은 해당 호스트의 시험 세션을 열므로 한 번에 하나씩 실행한다. 이 스크립트들은 비공개 `.work`에
둔 로컬 파일이며 clone에 포함되지 않는다. 파일이 없으면 아래 최초 설정의 직접 실행 방식을 사용한다.
기존 스크립트가 있으면 이번 시험의 프로필·소스·실행 위치를 지정하는지 확인하고 사용자 변경을 보존한다.

| 해야 하는 일 | 반복 시점 |
|---|---|
| worktree와 프로필 준비 | 최초 1회 |
| 로그인 | 최초 1회, 이후 인증이 해제돼 재로그인을 요구할 때 |
| Codex 훅 검토·신뢰 | 최초 설정과 호스트가 재검토를 요구할 때 |
| `source` 커밋 갱신 | 다른 개발 커밋을 시험할 때 |
| Codex 캐시 재설치 | `source`를 갱신한 뒤 |
| 새 시험 세션 열기 | 갱신한 개발본을 실제 호스트에서 확인할 때 |

같은 프로필을 계속 사용하면 저장된 로그인과 설정을 재사용한다. 로그인이나 훅 신뢰를 매 시험마다
초기화하지 않는다. [Codex 인증 저장](https://learn.chatgpt.com/docs/auth#login-caching),
[Claude 개발용 직접 로딩](https://code.claude.com/docs/en/plugins/create#load-a-plugin-for-one-session).

## 최초 설정

이 절차는 해당 시험 환경의 생성·설치를 소유자가 지시했을 때 수행한다. 기존 환경이 있으면 재생성하지 않고
다음 절의 커밋 갱신으로 진행한다. 비공개 파일이 없는 worktree를 쓰는 이유와 배포 경로는
[배포 계약](specs/repository.md#배포)을 따른다.

PowerShell에서 다음 변수를 지정한다. `devflowRef`에는 저장소 검사에 통과한 커밋의 전체 SHA를 넣는다.

```powershell
$devflowTestRoot = Join-Path (Get-Location).Path '.work/plugin-test'
$devflowSource = Join-Path $devflowTestRoot 'source'
$devflowSmoke = Join-Path $devflowTestRoot 'smoke'
$devflowRef = '<검증할 전체 커밋 SHA>'
```

새 환경에는 `git worktree add --detach "$devflowSource" $devflowRef`로 소스를 준비하고, 소스 밖에
`codex-home`, `claude-home`, `smoke` 폴더를 만든다. `smoke`에는 별도 Git 저장소와 `.devflow.json`을 준비한다.
보호 경로 시험의 최소 프로필 예시는 `{"protected":["_ref/**"]}`다. 원격 origin이 없는 최소 시험 프로젝트는
세션 시작과 가드를 시험할 수 있지만 GitHub Issue를 사용하는 개발 사이클 전체를 검증하지는 않는다.

`source`에 `.work`, 비공개 계획, 인증 파일 같은 추가 파일을 넣지 않는다. Codex의 로컬 설치는 ignore된
파일도 복사할 수 있다. 인증 파일을 기존 실사용 프로필에서 복사하지 않고 시험용 프로필에서 로그인한다.

### Codex 설치와 실행

다음 블록은 해당 PowerShell 프로세스에서만 시험용 `CODEX_HOME`을 사용하고 종료 후 이전 값을 복원한다.
marketplace 등록은 최초 1회, `plugin add`는 설치와 이후 캐시 갱신에 사용한다.

```powershell
$devflowPreviousCodexHome = $env:CODEX_HOME
try {
    $env:CODEX_HOME = Join-Path $devflowTestRoot 'codex-home'
    codex plugin marketplace add "$devflowSource"
    if ($LASTEXITCODE -ne 0) { throw 'marketplace 등록 실패' }
    codex plugin add devflow@devflow-local
    if ($LASTEXITCODE -ne 0) { throw '개발본 설치 실패' }
    codex plugin list --marketplace devflow-local --json
    if ($LASTEXITCODE -ne 0) { throw '설치 목록 확인 실패' }
    codex --no-daemon -C "$devflowSmoke"
} finally {
    $env:CODEX_HOME = $devflowPreviousCodexHome
}
```

각 명령이 실패하면 다음 단계로 진행하지 않는다. 새 세션에서 로그인하고 `/hooks`에서 devflow의 명령을
검토·신뢰한다. 이후에는 `start.ps1` 같은 로컬 실행 스크립트로 같은 프로필을 열면 된다.
현재 CLI의 옵션 지원은 `codex --help`로 확인한다.

### Claude Code 직접 실행

```powershell
$devflowPreviousClaudeHome = $env:CLAUDE_CONFIG_DIR
Push-Location -LiteralPath $devflowSmoke
try {
    $env:CLAUDE_CONFIG_DIR = Join-Path $devflowTestRoot 'claude-home'
    claude --plugin-dir "$devflowSource"
} finally {
    $env:CLAUDE_CONFIG_DIR = $devflowPreviousClaudeHome
    Pop-Location
}
```

새 프로필의 로그인과 호스트가 요구하는 신뢰 선택을 완료한다. `/plugin`의 Installed에서
`devflow @ inline`, `Enabled`, 기대한 구성요소를 확인한다. 이 방식에서는 `devflow-local` marketplace의
별도 등록·설치가 필요하지 않다. 이후에는 `start-claude.ps1` 같은 로컬 실행 스크립트를 재사용한다.

## 다음 개발 커밋 시험하기

1. Issue 작업 브랜치에서 변경에 맞는 검사를 실행하고 시험할 변경을 커밋한다. 통합 관문은
   [통합과 CI](specs/repository.md#통합과-ci)를 따른다.
2. 위 변수를 다시 지정하고 `devflowRef`를 이번 시험 커밋으로 바꾼다. 두 호스트의 시험 세션을 종료한다.
3. `source`의 추적 변경·untracked·ignored 파일을 확인한다. 추가 작업이 있으면 보존하고 원인을 확인한 뒤 갱신한다.

   ```powershell
   git -C "$devflowSource" status --short --untracked-files=all
   git -C "$devflowSource" ls-files --others --ignored --exclude-standard
   ```

4. 두 출력이 비어 있는 깨끗한 소스만 이번 커밋으로 옮긴다. 명령이 실패하면 설치를 진행하지 않는다.

   ```powershell
   git -C "$devflowSource" switch --detach $devflowRef
   if ($LASTEXITCODE -ne 0) { throw '시험 커밋 갱신 실패' }
   git -C "$devflowSource" rev-parse HEAD
   ```

5. Codex는 시험용 `CODEX_HOME`에서 `codex plugin add devflow@devflow-local`을 다시 실행해 캐시를 갱신한다.
   위 Codex 블록의 프로필 설정·복원 범위를 사용하고 최초 marketplace 등록 명령은 생략한다.
   Claude는 다음 `--plugin-dir` 실행에서 같은 소스를 읽는다.
6. 설치 내용과 로딩 출처를 확인한 뒤 새 세션에서 변경한 기능의 정상·실패 경로를 시험한다.

`source`만 갱신해도 Codex의 이미 설치된 캐시는 바뀌지 않는다. 재설치 결과의 `installedPath`를 확인하고,
소스 SHA와 캐시 내용을 대조한다. 실사용 프로필에서 개발용 `plugin add`를 실행하지 않는다.

## 설치와 동작 검증

### 파일과 로딩 출처

주 작업 트리에서 Codex 설치 결과의 캐시 경로를 대조한다.

```powershell
node bin/devflow-install-check --ref $devflowRef '<installedPath>'
```

`different 0, missing 0`이고 `same`이 시험 커밋의 추적 파일 수와 같아야 한다. 이 검사는 추가 파일을
찾지 않으므로 캐시에 비공개 파일이나 예상 밖 파일이 없는지도 확인한다. worktree의 `.git` 연결 파일은
추적 파일이 아니지만 로컬 폴더 복사에 포함될 수 있다.

Claude의 로딩 상태는 위 Claude 실행 블록의 프로필 설정·복원 범위를 사용하고, `claude` 실행 줄을 다음으로
바꿔 확인한다. 블록 밖에서 이 명령만 실행하면 실사용 프로필의 설정도 조회할 수 있다.

```powershell
claude --plugin-dir "$devflowSource" plugin list
```

`devflow@inline`, 지정한 소스 경로, `loaded`를 확인한다. 세션에서는 `/plugin`의 Installed와 Errors도
확인한다. 원격 `devflow@wotjr1649`만 로딩됐으면 시험 세션의 프로필과 `--plugin-dir` 인자를 다시 확인한다.

### 변경에 맞는 검사

| 변경 | 필요한 확인 |
|---|---|
| 문서·설명 | doctor, 링크·명령·형식과 사실 확인 |
| 스크립트·판단 로직 | 관련 테스트, 설치 캐시의 실제 훅 명령에 합성 입력을 준 검사 |
| 스킬·훅 연결·세션 처리 | 위 검사와 새 호스트 세션에서 실제 로딩·이벤트·허용·차단 확인 |
| 설치·배포 경로 | 설치 파일 대조와 해당 경로의 설치·업데이트 시험 |

합성 입력 검사는 차단할 명령을 훅의 입력 데이터로 전달한다. 그 명령을 실제 셸에서 실행하지 않는다.
`.work/plugin-test/smoke-check.cjs` 같은 기존 로컬 검사 파일이 있으면 기대 SHA·캐시 버전·입력이 이번 시험에
맞는지 먼저 확인한다. 직접 훅 검사 통과와 호스트가 훅을 호출하는 전체 경로 통과는 별도의 증거다.

최종 저장소 검사는 개발 작업 브랜치에서 실행한다.

```powershell
node bin/devflow-doctor
node --test --test-timeout=120000 tests/*.test.js
```

검증 기록에는 시험 커밋, 호스트 버전, 프로필·로딩 출처, 실행한 검사와 결과, 실행하지 않은 경로를 남긴다.
로그인·플러그인 목록만 확인했다면 실제 모델 대화에서의 가드 동작까지 통과했다고 기록하지 않는다.
공개 기록에는 인증 정보, 로컬 절대 경로와 원시 세션 내용을 포함하지 않는다.

## 통합과 배포

개발본 시험 뒤의 `main` 통합은 [통합과 CI](specs/repository.md#통합과-ci)를 따른다. 일반 Issue 통합과
버전 변경은 [버전 정책](specs/repository.md#버전)에서 구분하며, 배포할 때는
[릴리스와 롤백](specs/repository.md#릴리스와-롤백)의 태그·Release·공통 catalog·실사용 설치 검증 순서를 따른다.
이 안내의 개발본 실행은 실사용 채널의 업데이트가 아니다.
