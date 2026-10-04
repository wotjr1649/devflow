# ADR-0015: 문서로만 있던 기능의 존폐

상태: 채택 (사용자 결정, #21). M4 결정은 [ADR-0017](ADR-0017-drop-m4-defer-route.md)이 대체했다(superseded):
M4는 실행 모드에서 빠졌다.

## 맥락

- 2026-10-03 완성도 분석에서, 설계가 약속했지만 실제 사이클에서 한 번도 쓰이지 않은 기능 넷이 드러났다.
  - M3(worktree별 병렬 구현)
  - M4(Workflow 스크립트로 하는 대규모 변경과 감사)
  - 수정 작업 중 테스트 파일 편집 차단 훅
  - doctor의 Issue 검사
- 쓰이지 않는 경로를 위한 고위험 코드는 리뷰 부담을 키웠다. M3 귀속(#6)과 주 작업 트리 장부(#14)가 그 예이고, 그때마다
  파일 시스템 신뢰 지적이 나왔다.
- 공개 근거를 확인했다(2026-10-03).
  - Claude Code의 Workflow는 정식 기능이고, 플러그인이 `workflows/`를 함께 배포할 수 있다
    ([workflows](https://code.claude.com/docs/en/workflows.md)).
  - 두 호스트 모두 PreToolUse로 시험 파일 편집을 막을 수 있다
    ([Claude hooks](https://code.claude.com/docs/en/hooks.md), [Codex hooks](https://learn.chatgpt.com/docs/hooks)).
  - 시험을 읽기 전용으로 둔 경우가 성능과 안전의 균형이 가장 좋았다는 연구가 있다
    ([ImpossibleBench 요약](https://www.lesswrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1)).

## 결정

- **M4**: devflow는 Workflow를 배포하지 않는다. M4는 사용자가 Workflow를 직접 실행하는 모드로만 남긴다. 써 본 적 없는
  스크립트를 플러그인에 실어 두 호스트에 배포하면, 관리할 표면만 늘고 검증은 되지 않기 때문이다.
- **M3**: 유지하고, 실사용 검증 전임을 spec에 적는다. 코드는 이미 있고 #14로 장부도 주 작업 트리에 모였다. 새 작업은
  실제로 쓸 일이 생길 때 한다.
- **테스트 파일 편집 차단 훅**: 만든다. 공개 근거가 가장 강하다. 착수는 Clauduct 파일럿 뒤다(#20, 만들었다).
- **doctor의 Issue 검사**: spec에서 뺀다. 한 번도 필요해지지 않았고, Issue 형식은 `devflow-state`가 쓸 때 이미 검사한다.

## 결과

- 문서가 지금 동작을 적는다. overview의 "(계획)" 표시와 `workflows/` 약속을 지우고, orchestration의 M3에 검증 전 표시를,
  테스트 편집 차단 안내에 후속 표시를 둔다.
- 쓰이지 않는 경로를 위한 새 고위험 코드를 만들지 않는다.

## 다시 볼 조건

- 실제 사이클에서 M3나 M4가 필요해질 때: M3는 그 사이클이 검증하고, M4는 그때 배포 여부를 다시 정한다.
- `devflow-state` 밖에서 Issue 본문이 자주 깨질 때: doctor의 Issue 검사를 다시 연다.

## 검토한 대안

- **모두 유지하고 표기만 바꾸기**
  - 장점: 바꾸는 것이 가장 적다.
  - 기각 이유: 쓰이지 않는 약속이 문서에 남아 다음 설계와 리뷰가 그것을 전제로 삼는다(사용자 결정).
- **테스트 편집 차단 훅을 파일럿 전에 구현**
  - 장점: 파일럿에서 바로 써 볼 수 있다.
  - 기각 이유: 묶음이 커지고, 훅(고위험) 변경이 파일럿과 겹친다(사용자 결정).
