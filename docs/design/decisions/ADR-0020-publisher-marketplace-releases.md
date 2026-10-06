# ADR-0020: 제작자 공통 marketplace와 태그 기반 릴리스

상태: 채택 (사용자 결정, #56)

## 맥락

[ADR-0002](ADR-0002-repository-root-is-plugin-root.md)의 로컬 배포는 작업 파일을 분리했지만 main의 특정 커밋을
설치하는 방식이었다. 사용자는 제작자 `wotjr1649`가 여러 플러그인을 함께 관리하는 별도 공개 marketplace와
태그·GitHub Release로 버전을 배포하는 방식을 선택했다.

## 결정

공통 catalog는 `wotjr1649/marketplace`, 이름은 `wotjr1649`로 둔다. devflow의 이름과 저장소 루트 구조는 유지한다.
설치 식별자는 `devflow@wotjr1649`다. 두 호스트 catalog가 같은 devflow 릴리스 태그를 가리킨다.
배포·버전·롤백 규칙은 [repository](../../specs/repository.md#배포)가 소유한다.

## 결과

- 다른 플러그인을 독립 저장소와 독립 버전으로 추가할 수 있다. devflow 변경 없이 catalog 항목만 추가한다.
- 태그와 릴리스 게시 후 catalog를 갱신해야 사용자에게 새 버전이 전달된다. 매니페스트 버전도 갱신한다.
- 저장소의 로컬 catalog는 `devflow-local`이라는 개발용 이름으로 남는다. 기존 호스트 설치는 확인 후 전환한다.
- 이번 릴리스는 기존 0.1.0 이후 기능·동작 변경이 누적되어 minor 0.2.0으로 올린다. 런타임 변경은 없다.
- 원격 설치에서 Claude의 `github` 소스가 SSH 호스트 키 설정을 요구했다. 공통 catalog는 두 호스트 모두 HTTPS `url` 소스를
  사용해 설치하며 SSH 보안 설정은 바꾸지 않는다. catalog의 전송 소스 변경은 플러그인 태그를 재작성하지 않는다.

## 검토한 대안

devflow 저장소의 catalog만 공통 이름으로 바꾸는 방법은 저장소를 추가하지 않아도 되지만, 다른 플러그인의 배포가
devflow 저장소 관리와 묶인다. 별도 catalog 저장소가 제작자 단위 관리에 맞는다. 자동 cross-repository 게시 파이프라인은
공유 쓰기 자격증명과 추가 실패 경로가 필요하므로 도입하지 않는다.

## 근거

[Claude marketplace source reference](https://code.claude.com/docs/en/plugins/marketplace-reference),
[Claude version updates](https://code.claude.com/docs/en/plugins/host-marketplace),
[Codex Git marketplace sources](https://developers.openai.com/plugins/build/plugins).
