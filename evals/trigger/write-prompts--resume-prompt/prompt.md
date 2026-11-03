---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should, write-prompts]
---

결제 모듈 리팩터링을 하다가 여기서 끊어야 해. 새 세션에서 이어서 할 수 있게 넘겨줄 프롬프트를 써 줘.

지금까지 한 것:
- `PaymentService`를 `PaymentGateway`(외부 PG 호출), `RefundPolicy`(환불 규칙), `LedgerWriter`(장부 기록) 세 클래스로 나눴어.
- `PaymentGateway`와 `RefundPolicy`는 단위 테스트까지 통과했어.

정한 것:
- 환불 수수료 계산은 `RefundPolicy`가 맡고, 기존 `calcFee()`는 지운다.
- 외부 PG 재시도는 3회, 지수 백오프로 한다.

남은 것:
- `LedgerWriter`로 옮기는 중인데, 트랜잭션 경계를 서비스 쪽에 둘지 정하지 못했어.
- 통합 테스트 `payment_flow_test`가 아직 실패해.
