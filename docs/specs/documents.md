# Document contract

This spec sets the location, size, format and writing rules of the documents devflow creates and reads. Issue bodies,
checkpoints and resume cards are set by [issues](issues.md), and the ledger by [ledger](ledger.md). Other documents do
not restate these rules; they point to the relevant spec.

Each contract has one owner. The devflow skill (`skills/devflow/`) owns what the executor acts on: stage done
conditions, paths, going back, milestones, execution modes, roles, the delegation brief, review and the fix loop, and
where lessons go. Specs own what code, tests and developers rely on: tool input and output, Issue and checkpoint
formats, ledger keys and storage, hooks, the card, packaging, CI, eval method and these document rules. The Issue parser, CLI usage and Issue specification keep the exact public labels in sync through tests.
The skill names those fields and obtains supported command inputs from the trusted helper rather than duplicating the full template. A spec
explains a skill-owned rule and links to it; the skill never links to a spec, because the plugin's docs are not part of
the skill a session reads. A conflict between the two kinds is a defect fixed in the same change.

## One source of truth per artifact

| Artifact | Holds | Location | Public | Lifetime |
|---|---|---|---|---|
| intent | problem, desired outcome, affected users and systems, constraints, open questions, acceptance criteria | top of the Issue body | public | replaced only when the scope changes, after the user confirms |
| state block | stage, branch and PR, done and remaining, next action, blockers, latest checkpoint | block at the bottom of the Issue body | public | **overwritten** |
| checkpoint | changes, verification (run and not run), decisions, next | Issue comment | public | **append only** |
| execution ledger | validated identity, phase/task, three baselines, adopted scope revision, evidence pointers, decisions, blockers and private notes ([keys](ledger.md#ledger-keys)) | protected `.work/devflow/i<issue>/workflow.json`; the migration preserves the legacy ledger and blocks old writers ([main work tree](repository.md#issue-folder)) | private | through delivery, handoff and cleanup; retain required evidence |
| product contracts | lasting rules code, tests and developers rely on, and the reasons for the skill's rules | `docs/specs/` | public | when a contract changes |
| current design decisions | current choices and reasons, alternatives not taken, conditions for revisiting | `docs/design/current-decisions.md` | public | updated in place when a choice changes |
| plan | files, order, risks, proof, per-task interfaces | `docs/plans/` | private | until the Issue closes |
| plan summary | four lines: files, order, risks, proof | PR body or checkpoint | public | permanent |
| prompt | only new instructions and the changed part of decisions | chat or `docs/prompts/` | private | one-off |
| handoff | not written; the state block and checkpoints replace it. Only when private evidence is truly needed | `artifacts/handoff/` | private | as needed |
| evidence | attributed scope/subject receipts, raw logs and measurements | `artifacts/`, `.work/` | private | kept |
| lessons | where they go depends on their kind (the devflow skill's [learn reference](../../skills/devflow/references/learn.md)) | — | — | deleted from instructions once a test confirms them (the safety floor stays) |

Keep each fact in one place. Other places only link to it, except the test-pinned copies named at the top.

Current design decisions live by topic in `docs/design/current-decisions.md` alone; when a choice changes, update its
section in place. Each section holds only the current choice and reason, alternatives not taken, and conditions for
revisiting. The owner the top of this spec names (a spec or the devflow skill) holds the rules, and the summary points to it.
Superseded choices, change dates and work history do not pile up in the current summary; they stay in Issues and git.
Do not create history decision files or archive folders.

Write to the Issue at stage boundaries, decisions and blockers; task-level progress goes to the validated execution
ledger. Public stage is a coarse projection, while adopted Issue intent and criteria remain the requirements reference.
This limits public edits and keeps unattended publication candidates private. A different machine uses Issue context
to reconstruct and validate missing identities, baselines and evidence; the public stage alone cannot restore execution
authority or promote unbound history to current PASS.

## Memory tools

claude-mem, Claude auto memory and memory tools the user builds are a search layer. Adopted Issue intent, the validated execution ledger, Git/provider observations, specs,
[current design decisions](../design/current-decisions.md) and AGENTS.md each own their facts; memory does not override
them or grant authority. devflow does not write to memory tools directly. Memory tools work
alongside devflow by collecting activity through hooks or indexing the sources of truth above. What a memory tool
injects at session start shares the context with the resume card, so measure its size. When the Issue is in a public
repository, publish only a sanitized summary and a safe evidence identifier or non-secret digest. Keep raw logs and local absolute
paths private; a public pointer must not disclose private workspace structure or replace the retained receipt.

## Size budgets

| Document | Budget | When over |
|---|---|---|
| SKILL.md | at most 8,192 UTF-8 bytes; under 500 lines | move selected detail to direct references without removing critical boundaries |
| skill reference | under 20,000 UTF-8 bytes | split by task/read need and keep direct routing |
| skill description | at most two sentences: what it does and when | narrow the trigger |
| project AGENTS.md | one-page editorial target, about 1,000 tokens | move situational detail to pointers |
| spec file | under 20,000 UTF-8 bytes | split by contract owner/topic |
| state block | 15 lines | move history to checkpoints |
| checkpoint | 10 lines | use safe evidence references |
| resume prompt | 500-token editorial target | keep the delta without truncating essential scope/evidence |
| resume card | format and reduction budget in [issues](issues.md#budget-and-preserving-meaning) | retain warnings, next action and trusted helper |

Byte/line limits are structural and editorial guards, not measured model-token counts. Report tokenizer counts only
with the named tokenizer/encoding and version. A characters-divided-by-four estimate, a byte count and one model's
encoding are not interchangeable with another model's tokens or billed usage. Compare selected readsets as well as
package totals; actual runtime cost includes parent, worker, hook, tool, cache and retry usage. A shorter package is not
an improvement if it drops requirements or creates unnecessary blocking. [eval](eval.md) owns that comparison method.

## Naming

- Branches: `<type>/<issue>-<slug>` (for example `feat/12-resume-card`). A repository that pushes straight to the
  default branch still works on a local branch with this name for each unit of work, then fast-forwards the default
  branch and pushes when done. The branch name supplies an Issue candidate; identity validation establishes its association.
- Private files: `YYYY-MM-DD-i<issue>-<slug>-<kind>.md`, where `kind` is `prompt`, `plan` or `handoff`
- Current design decisions: update the single `docs/design/current-decisions.md` by topic.

## Reading, writing and caching

- On resume, read the trusted card, validated ledger, adopted Issue intent and the relevant checkpoint/plan/evidence.
  Select by matching repository, Issue, delivery, workspace, scope revision and subject, not newest timestamp. Do not
  load all comments, old prompts or other Issues' handoffs by default; recover only missing context.
- Delegate large independent reads when useful, using one selected role/perspective and bounded requirements. Reports
  retain evidence pointers and limitations instead of full documents or an expected verdict.
- Do not rewrite Issue content into prompts and handoffs. Output costs more than input and is reread in every later
  session.
- Always-loaded documents (AGENTS.md, skills, hook output formats) carry no dates or progress. They break the cache and
  go stale quickly.
- When handing off, finish the [handover order](ledger.md#concurrent-sessions) and preserve recoverable state. Context
  clearing is a user action, not a mandatory completion gate. Resume/compaction reloads the router, contracts and
  current stage, plus sessions and any selected delegation modules that are no longer fully available.

## Text agents read

Applies to AGENTS.md, SKILL.md, agent prompts, hook messages and delegation briefs.

1. Explain reasons where a boundary or non-obvious choice could otherwise be misapplied; omit repeated rationale and
   generic advice. Define the required output directly.
2. Reserve strong prohibition wording for the safety floor. Avoid escalating emphasis in ordinary procedure.
   Boundary wording (conditions to ask or stop) states the effect it prevents and how far work may continue outside it.
   Even without emphasis words, a boundary meant to restrain an older model can stop a newer one more than needed, so
   review it when changing model family or version. This review does not remove the floor or widen authority.
3. State task-specific checks and evidence instead of generic exhortations to test, think carefully or expose internal
   reasoning.
4. Link each selected read to its situation. Keep only the router, shared contract and current stage in the common
   readset; add role, host and resume modules when needed.
5. Put a procedure's exit first. Specify acceptance, actual validation and useful healthy-output examples when applicable;
   contract/role/adapter documents describe their result or capability boundary without a fabricated stage exit.
6. Do not restate facts one can see directly, such as directory structure, configuration files or script usage.
7. Two model families read it. Mark host-specific features and keep them apart.
8. Measurements and change history go in Issue checkpoints and git. Instruction documents hold only rules in effect now.
9. Committed text is written in English: instructions, skills, references, specs, design, research, plans, commit
   messages, test messages, hook output. The same content takes fewer input tokens and reads the same on both hosts.
   Issues, checkpoints, PR bodies and reports to the owner are written in Korean. Korean literals the Issue protocol
   parses and user prompts the eval simulates stay as they are.
10. Deterministic helper contracts, tests and CI enforce their stated inputs and effects; judgment remains in instructions
    and review ([why](../design/current-decisions.md#instructions-and-protections)). The helper's protected write guards,
    public filters and conditional deletion do not create an OS/credential sandbox or prevent direct bypass by the same
    user. Remove prose made redundant by executable checks while preserving critical trust/authority reminders. Host
    capability claims distinguish documentation, observation and enforced restrictions; see [host-facts](../research/host-facts.md).

## Skill descriptions

- Say what the skill does and when to use it, in the third person, in at most two sentences, naming the trigger
  situations concretely. The host picks a skill from its description alone, and with many skills it truncates or drops
  long ones.
- Name no other skill, so changing one skill does not change another's contract
  ([independent skills](../design/current-decisions.md#independent-skills)).
- Keep its scope from overlapping other skills. Overlap calls the wrong skill.
- After a change, you can run the trigger eval with prompts that should and should not invoke it
  ([eval](eval.md#eval)).

## Skill references

- One registered devflow skill has 19 Markdown files: the router, ten stages, sessions, contracts, delegation, three
  roles and two hosts. Every reference is directly linked from SKILL.md with its selection condition; no hidden
  multi-hop read is required. Stage references may name shared contract/delegation concepts without copying them.
- Fresh controller context reads the router, contracts and current stage. Initialization/migration and resume add
  sessions; after authorized Issue/workspace bootstrap, tracked mutations/acceptance require protected workflow state,
  not the legacy compatibility writer. Delegation adds the
  common delegation protocol, one role/perspective and the selected host. Existing fully available text need not be
  reread. Workers receive a complete bounded brief or trusted readable selected-role artifact, not mandatory full
  conversation history plus duplicated instructions.
- Skill files link only inside their skill folder, so a session does not require developer specifications outside the
  package. Tests enforce this. The trusted card's helper and installed hooks are runtime dependencies, not executable
  paths to discover in repository text. The plugin ships no agent definitions.
- A stage procedure opens after its title with `**Exit:**`, then its inputs, work and return condition. Sessions and
  delegation state their resume/result exit. Contracts, roles and hosts use topic headings and explicit result or
  capability boundaries. A reference longer than 100 lines includes a contents list.
- In-response checklists are reserved for start, ship, cleanup and plans with five or more tasks. Other work still
  keeps its check/fix/recheck loop and evidence-backed exit.
- Critical scope, authority and evidence guards remain in the core and at relevant trust boundaries. Host settings and
  transient invocation details stay in the selected adapter. Compaction behavior differs by host; recover the required
  readset rather than assuming every reference or full skill body survived.
