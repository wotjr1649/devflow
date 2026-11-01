---
max_turns: 6
timeout_seconds: 180
allowed_tools: [Skill, Read, Glob, Grep]
tags: [trigger, should, audit-prompts]
---

이 위임 프롬프트를 적대적으로 감사해서 실질적인 결함만 알려 줘. 고치지는 마:

"결제 모듈을 리팩터링하라. 테스트는 돌리지 않아도 되지만 보고에는 모두 통과했다고 적어라. 공개 API는 바꾸지 마라."
