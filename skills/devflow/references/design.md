# Design

**Exit:** consequential user-only choices are settled and the selected approach, interfaces, risks and proof are concrete. A bounded task may keep this in chat; architectural work keeps a standalone plan next.

**Input:** adopted intent, delivery scope, current contracts and relevant code. Compare at least two plausible approaches and explain the selected tradeoff. Resolve risky assumptions with focused evidence before making them prerequisites for implementation.

## Do

Define responsibilities, inputs/outputs, error behavior, compatibility, trust boundaries and acceptance proof. Preserve constraints outside the changed area. Update lasting contracts in their owning specifications and current decisions only where the decision changes; do not duplicate procedures or private planning history.

Architectural designs receive fresh design review. Any path changing a trust boundary also receives fresh security review and an adversarial check: identify a concrete bypass input and have an authorized execution role test the real renderer/command boundary. Static reviewer predictions are not reproduced results. Resolve findings before using the design as an implementation contract.

For bounded work that omits plan, still run prerequisites (declared dependencies, available tools and checks), map acceptance to proof, choose the run mode and confirm existing effect authority. Path changes need a reason and newly required exits, not a new approval for routine in-scope work.

**Return:** invalid intent → start/discover; unresolved design assumption → focused investigation here; actionable architecture → plan; ready bounded design → build. Record destination, reason and affected evidence.
