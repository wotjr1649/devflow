# Protected workflow and selective loading evaluation

Evaluation date: 2026-11-06. Baseline commit: `b2feffee464ce9c7b26a7f6142db8695f1ec39c0`.
The candidate is the content snapshot in this change; its per-file hashes are in
[static measurements](../../evals/redesign-static-counts.json). No release or installed-host validation is implied.

## Design basis and integration order

The [Anthropic Skill authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
informed the concise router, directly reachable references, selective role/host loading, deterministic utility scripts,
and baseline evaluation. These are design principles, not an Anthropic certification or a universal size threshold.

Integration followed runtime guards, state migration, aligned selective instructions, then matched evaluation.
The 19 Markdown files comprise one router and 18 directly linked references. Shared contracts, current stage, the
selected role and one host adapter replace repeated manuals and transient model/version tables. Instructions retain
spike, bounded and architectural paths; M0 through M3; task, delivery, Issue and cleanup completion; and explicit returns.

The helper is part of the change. Replacing the skill text alone with an obsolete helper does not activate the new
contracts: tracked implementation/acceptance requires initialized protected state after authorized bootstrap.

## Deterministic validation

The same full test command was used on the immutable baseline and integrated candidate on Linux, Node v24.22.1,
Git 2.52.0:

```text
node --test --test-timeout=120000 tests/*.test.js
```

| Revision | Tests | Passed | Failed | Platform skips |
|---|---:|---:|---:|---:|
| Baseline | 382 | 354 | 0 | 28 |
| Candidate | 477 | 449 | 0 | 28 |

The candidate adds 95 test cases. This is preservation of existing coverage plus new regression coverage, not a claim
that the two revisions ran an identical set of test bodies. Existing wording expectations were changed only where
templates moved to targeted help or the protected interface intentionally changed. Structure/link checks include
newly tracked files; the skill validator also passes.

Focused final suites include 32 evidence/IO cases, 38 actual CLI/migration/hook cases, and 24 pure acceptance cases.
They use isolated temporary repositories, controlled provider adapters and local bare remotes. No live Issue, PR,
user transport, host installation, tag or release is exercised. Exact compressed baseline CLI/hook fixtures with
source commit and SHA-256 provenance keep obsolete-writer regressions runnable in a shallow CI checkout.

The existing CI workflow runs Node 22/24 on Ubuntu, macOS and Windows on branch pushes. Its observed run is reported
separately after publication; a Linux result does not stand in for those jobs or for native Claude Code/Codex integration.

## Independent review and repairs

Authors, static reviewers, decision workers and graders were separated. Reviewers inspected source and proposed
bounded reproductions; authorized implementation roles ran the reproductions. A static review verdict is not an
independent claim that tests executed. Resolved findings include defects in the original approach and regressions
introduced in intermediate candidates; the list does not imply every defect existed in the baseline.

| Area | Repaired failure or omission |
|---|---|
| State and old writers | Protected identity/revision/ownership; nonexpiring exclusion; explicit dead-lock recovery; journaled migration, preserved v1 bytes and a non-JSON tombstone that actual old writers refuse. |
| Migration limits | Preflight both canonical and journal UTF-8 sizes before cutover; exact bounded readback before journal removal; interrupted recovery preserves readable evidence. |
| Ownership | Explicit release/claim; vanished-owner recovery preserves pending effects and worker uncertainty under a hold until reconciliation; Stop applies the same full identity check. |
| Task versus delivery | Separate task checks/review policies and mandatory project task gates; later integration/E2E checks do not deadlock an earlier M2 task; final delivery gates remain complete. |
| Evidence | Task attempts, input/criterion revisions and full delivery bases remain bound; completed report updates follow completion order; later applicable failure supersedes prior success; integration reserves its result ID and collection capacity. |
| Returns and integration | Backward transitions invalidate acceptance with a reason; retry/continuation budgets survive resumes; an integrated delivery cannot be reopened by target reconciliation; prior delivery provenance is retained. |
| Original-object review | Verify commit/tree/blob hashes, disable replacement and commit-graph interpretation, avoid executable Git helpers, bound output artifacts, retain valid Unicode names and reject lossy index decoding. |
| Deletion | Bind exact destination/ref/OID through preparation and execution; reject URL/remote aliases and drift; use exact expected-value deletion while retaining native hooks/authentication. |
| Workflow preservation | Restore private advisory routing; retain partial-delivery scope, full-Issue closure conditions, independent-review overrides and unaffected-work continuation. |

The first alleged POSIX absolute-path remote-alias trigger was not reproduced on Git 2.52.0 and is not counted as a
confirmed reproduction. SSH/scp alias variants, including multiple unintended destinations, were reproduced with a
local transport stub and repaired. The last runtime audit proposed five additional P2 cases after the broad suite
already passed. New reproductions exposed completion-order, migration-limit, post-integration, Stop-identity and
integration-result reservation failures; their repaired branches received a focused independent rereview.

## Static instruction measurements

Tokenizer: `tiktoken==0.14.0`, `o200k_base`. Count each complete UTF-8 file once per declared controller read set.
This is neither an exact Claude token count nor billed usage. Prompts, tool output, responses, child briefs, caching,
reasoning, host framing and repeated reads are excluded. The full skill decreases from 84,969 to 71,194 bytes
(16.2%); router bytes decrease from 18,879 to 8,189, and router lines from 229 to 80. Runtime/test code grew to provide
the guards: no claim is made that the entire repository or distribution archive became smaller.

| Read set | Baseline tokens | Candidate tokens | Reduction |
|---|---:|---:|---:|
| Router | 4,424 | 1,607 | 63.7% |
| All skill Markdown | 18,972 | 13,272 | 30.0% |
| m0-build | 5,997 | 3,932 | 34.4% |
| m1-verify-codex | 7,287 | 5,209 | 28.5% |
| m1-verify-claude | 7,287 | 5,204 | 28.6% |
| m2-build-codex | 8,363 | 5,485 | 34.4% |
| m2-build-claude | 8,363 | 5,480 | 34.5% |
| build-resume | 7,687 | 5,475 | 28.8% |
| delivery-review-codex | 8,099 | 5,579 | 31.1% |
| delivery-review-claude | 8,099 | 5,574 | 31.2% |
| bounded-m0 | 13,505 | 9,561 | 29.2% |
| bounded-m1-codex | 15,871 | 11,558 | 27.2% |
| bounded-m1-claude | 15,871 | 11,553 | 27.2% |
| new-tracked-task | 6,059 | 5,580 | 7.9% |

Stage-only sets assume a validated protected record. New-task and complete fresh bounded-path sets include the
candidate's mandatory initialization/session reference. New-task bytes increase from 26,447 to 28,665 even though
this tokenizer counts fewer tokens; initialization is a real added contract cost. The router's reduction must not be
advertised as the reduction for an entire development session.

Reproduce the counts using [the script](../../evals/measure-skill.py) and [declared read sets](../../evals/read-sets.json):

```text
python evals/measure-skill.py --base b2feffee464ce9c7b26a7f6142db8695f1ec39c0 --candidate HEAD --encoding o200k_base
```

## Matched written-decision probes

[The cases](../../evals/decision-cases.json) cover resume authority/full range, partial delivery, changed inputs,
late reports, M2/M3 ordering, cleanup races, injected Issue content, a healthy small task and uncertain provider effects.
Each of no-skill, baseline and candidate received the same nine situations and common entry facts in three fresh
agent contexts. Case order remained fixed per packet, and arm order varied between repetitions. The inherited model
and tool setup were held constant without overrides; the full deployment ID, random seed and billed usage were not
exposed. This is a limited matched decision probe, not a pinned native-host benchmark.

The resulting 81 decisions form nine correlated packets, not 81 independent end-to-end workflow executions.
Workers saw no rubric or author diagnosis. The first grader received anonymized packets and observable-behavior
oracles. A separate blind adjudicator checked disputed interpretations without arm identities. Original responses
and both grading stages are retained separately; the public summary records both initial and adjudicated results.

| Arm | Initial assertions | Adjudicated assertions | Fully passing cases |
|---|---:|---:|---:|
| none | 101/105 | 101/105 | 23/27 |
| baseline | 104/105 | 104/105 | 26/27 |
| candidate | 102/105 | 105/105 | 27/27 |

[The structured summary](../../evals/redesign-decision-summary.json) preserves case-level results and response hashes.
The initial grader marked 307/315 assertions and 73/81 cases passing. Independent blind adjudication reversed three
M3 wording/order judgments: verified and reviewed candidate selection before serial integration was present, with
final task acceptance additionally conditioned on the integrated subject. The unchanged answers therefore satisfy
the behavioral gate. The other five failures remained: four omitted whole-delivery review, and one omitted M2
current-attempt review. No explicit unsupported execution or unauthorized destructive action was reported.

Adjudicated totals are 310/315 assertions and 76/81 cases. The candidate met all 105 named assertions in these three
packets. This limited observation is not a production success-rate estimate, formal statistical superiority, proof
of complete workflow execution, or proof that every untested situation will be handled correctly.


## Remaining operating boundaries

- Session hashes, revisions, markers and role prompts serialize cooperating clients; they do not authenticate a human,
  attest that a test actually ran, or block arbitrary same-user shell/API/filesystem access. Native session inheritance
  remains a host-attribution limitation.
- Migration and coordinator recovery require observed quiescence. A flag, elapsed time or short-lived CLI PID proves
  none of it. Unknown effects and worker exits remain held until readback/inspection resolves them.
- Review packages require an exclusively owned raw-byte-clean snapshot. Dirty or required ignored inputs need separate
  stable coverage; a Git-clean CRLF-converting checkout may be refused. Missing coverage is not a passing review.
- Conditional deletion's server-side expected-ref comparison follows the
  [explicit expected-value lease](https://git-scm.com/docs/git-push). Its caller must exclude changes to the remote and
  all effective Git configuration during resolution and push; the helper does not enforce that configuration exclusion.
- Fresh Issue reads and local pending-effect records do not create provider-side compare-and-swap or idempotency where
  the provider supplies none. Uncertain writes require reconciliation rather than blind repetition.
- Native PowerShell/Claude Code/Codex lifecycle behavior and full coordinator-plus-children billed token use are unrun.
  Platform CI and written decisions cannot establish these properties. Exact runtime usage is required before making
  an end-to-end cost-reduction claim.
