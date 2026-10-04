# ADR-0018: 카드가 있어도 새 작업 요청은 development-start가 받는다

상태: 채택 (사용자 결정, #45). [ADR-0010](ADR-0010-single-router-skill.md)에서 라우터가 맡던 새 작업의 경로 분류를 옮긴다.

## 맥락

- #44에서 사용자는 "재개 카드가 있는 새 작업 요청에는 devflow 라우터가 먼저 불린다"를 정답으로 정하고 트리거 eval 사례
  2개(Issue 없는 브랜치의 카드, 진행 중인 Issue의 카드)를 더했다.
- 측정(2026-10-04):
  - Claude Code 2.1.289에서 두 사례는 6회 모두 실패했다. 트레이스를 남긴 진단 실행에서는 6회 모두 첫 동작으로
    `development-start`를 불렀고, 라우터는 한 번도 부르지 않았다. 같은 날 대화형 세션의 Claude도 카드가 있는 새 작업
    요청에 `development-start`를 바로 불렀다.
  - Codex 0.160.0은 devflow를 6회 중 5회 읽었지만 혼자 읽지 않았다. Issue 없는 카드에서는 3회 모두 grilling을 함께
    읽거나 대신 읽었고, 진행 중 Issue 카드에서는 3회 모두 development-start를 함께 읽었다.
- 라우터가 새 작업에 더하던 일은 경로 분류 하나였다. spike이거나 문제와 수용 기준이 확인되지 않은 일은 discover로
  보내고, 나머지는 start로 보낸다. development-start는 이미 요청을 Issue와 맞추는 일을 맡고 있다.
- Codex 실행기는 사례 하나에 기대 스킬 하나만 채점한다. 그래서 "둘 중 하나면 정답"은 실행기를 바꾸지 않고는 잴 수 없다.

## 결정

- 카드가 있어도 새 작업 요청은 `development-start`가 받는다. 그 스킬이 devflow 저장소에서 경로를 가른다. spike나 요구가
  확인되지 않은 일은 라우터의 discover reference로 보내고, 나머지는 그 자리에서 시작한다.
- 라우터(`devflow`)는 Issue가 있는 작업을 이어갈 때, 단계가 끝났을 때, compact 뒤, 새 정보로 단계를 되돌릴 때 쓴다.
  description을 이에 맞게 좁힌다.
- 트리거 eval의 카드 사례는 `development-start`를 정답으로 채점한다.

## 다시 볼 조건

- 카드 사례에서 두 호스트 중 하나라도 `development-start`를 사례별 2/3 미만으로 부를 때.
- 새 작업이 spike나 discover로 가야 했는데 Issue와 브랜치부터 만들어진 일이 사이클 기록(개입)에 나올 때.

## 검토한 대안

- **라우터를 먼저 부르게 description으로 강제한다(#44의 결정)**
  - 장점: 단계 판단을 한 곳에 모은다.
  - 기각 이유: Claude가 일관되게 고른 동작과 반대 방향이라 고쳐질지 불확실하다. Codex에서 grilling이 끼어드는 문제는
    그대로 남는다(사용자 결정).
- **두 스킬 중 어느 쪽이든 정답으로 둔다**
  - 장점: description을 바꾸지 않는다.
  - 기각 이유: Codex 실행기를 바꿔야 잴 수 있고, 겹침을 측정만 할 뿐 줄이지 않는다.
