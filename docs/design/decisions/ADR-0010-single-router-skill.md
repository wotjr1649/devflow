# ADR-0010: 책임별 단계를 라우터가 기존 단계 스킬로 보낸다

상태: 채택 (사용자 결정). 개정: 카드가 있어도 새 작업 요청은 development-start가 받고 경로를 가른다
([ADR-0018](ADR-0018-new-work-goes-to-development-start.md), #45).

## 맥락

- 처음 안은 라우터 하나가 모든 단계 내용을 references로 흡수하는 것이었다.
- 소유자의 생명주기 스킬(development-start, pr-review-workflow, workspace-cleanup)을 그대로 옮기기로 하면서
  ([ADR-0009](ADR-0009-auto-invoked-support-skills.md)), 이미 검증된 내용을 다시 쓸 이유가 없어졌다.
- 호출된 스킬은 compact 뒤에도 다시 붙지만, reference 파일은 다시 붙지 않는다.
- 단계가 start·review·ship·cleanup만 분명하고, 무엇을 만들지, 설계 정리, 구현 가능성 확인 구간은 `plan` 하나에
  뭉쳐 있었다. AI-native SDLC 플레이북은 단계마다 책임과 산출물을 하나씩 둔다.

## 결정

- 단계는 11개다: discover, start, design, plan, ready, build, verify, review, ship, cleanup, learn.
  책임, 산출물, 넘어가는 조건, 담당은 [lifecycle](../../specs/lifecycle.md)이 정한다.
- 경로(spike, bounded, architectural)에 따라 일부 단계만 돈다.
- 작업 루프(다음 작업은 build부터)와 슬라이스 루프, 새 정보가 생겼을 때 돌아갈 단계를 명시한다.
- `devflow` 라우터 스킬이 단계를 판단한다. 담당 스킬이 있는 단계(start, review, ship, cleanup)는 그 스킬을 부르고, learn은 둘 곳을 정하는
  reference를 읽은 뒤 에이전트가 읽는 파일이면 writing-for-agents를 부르며(계획 8단계에서 정함),
  나머지는 라우터의 단계 reference를 읽는다.
- 프로젝트에 devflow 표준을 적용하는 일(repository spec, doctor)은 별도 스킬 대신 라우터의 reference로 둔다.
- 스킬은 7개다: 라우터, 생명주기 3개, 보조 3개.

## 결과

- 라우터와 단계 스킬의 description이 겹치지 않게 쓰고, 트리거 eval로 확인한다.
- diff나 PR의 단독 리뷰 요청은 호스트의 리뷰 기능(Claude Code 내장 `code-review`)에 맡기고, `pr-review-workflow`는
  PR 준비, 지적 처리, CI·머지·정리 준비, Issue 완료를 맡는다. devflow의 review 단계는 라우터가 이름으로 부르므로 그대로다.
  첫 트리거 eval에서 단독 리뷰 요청이 내장 스킬로 갔고 두 description이 겹쳤기 때문이다(사용자 결정).
- 라우터 SKILL.md와 각 reference는 5,000토큰 미만이고, reference는 SKILL.md에서 한 단계 깊이로만 연결한다.
- Issue 현재 상태의 "단계" 값이 12개(+done)로 늘어난다.

## 다시 볼 조건

파일럿에서 bounded 작업이 단계 전환 때문에 눈에 띄게 느려지면 plan과 ready, build와 verify를 합친다.

## 검토한 대안

- 라우터 하나가 모두 흡수: 검증된 스킬을 다시 써야 하고 compact에 약하다.
- 라우터 없이 단계 스킬만: 단계 순서를 강제하는 장치가 없다.
- 8단계로 압축: 구현 가능성 확인과 검증이 독립 관문이 아니게 된다.
