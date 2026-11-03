---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should-not, write-prompts]
---

결제 모듈 리팩터링을 이어서 하자. 지금까지 한 것:
- `PaymentService`를 `PaymentGateway`(외부 PG 호출), `RefundPolicy`(환불 규칙), `LedgerWriter`(장부 기록) 세 클래스로 나눴어.
- `PaymentGateway`와 `RefundPolicy`는 단위 테스트까지 통과했어.

남은 것:
- `LedgerWriter`로 옮기는 중인데, 트랜잭션 경계를 서비스 쪽에 둘지 정하지 못했어.

트랜잭션 경계를 어디에 두는 게 좋을지 의견을 줘.
