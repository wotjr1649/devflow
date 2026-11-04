# Document contract

This spec sets the location, size, format and writing rules of the documents devflow creates and reads. Issue bodies,
checkpoints and resume cards are set by [issues](issues.md), and the ledger by [ledger](ledger.md). Other documents do
not restate these rules; they point to the relevant spec.

Each contract has one owner. The devflow skill (`skills/devflow/`) owns what the executor acts on: stage done
conditions, paths, going back, milestones, execution modes, roles, the delegation brief, review and the fix loop, and
where lessons go. Specs own what code, tests and developers rely on: tool input and output, Issue and checkpoint
formats, ledger keys and storage, hooks, the card, packaging, CI, eval method and these document rules. Where the skill
carries a copy of a spec-owned format (the state block and checkpoint labels), a test pins the copy to the spec. A spec
explains a skill-owned rule and links to it; the skill never links to a spec, because the plugin's docs are not part of
the skill a session reads. A conflict between the two kinds is a defect fixed in the same change.

## One source of truth per artifact

| Artifact | Holds | Location | Public | Lifetime |
|---|---|---|---|---|
| intent | problem, desired outcome, affected users and systems, constraints, open questions, acceptance criteria | top of the Issue body | public | replaced only when the scope changes, after the user confirms |
| state block | stage, branch and PR, done and remaining, next action, blockers, latest checkpoint | block at the bottom of the Issue body | public | **overwritten** |
| checkpoint | changes, verification (run and not run), decisions, next | Issue comment | public | **append only** |
| ledger | stage, task progress, decisions and blockers, content an unattended run could not post ([keys](ledger.md#ledger-keys)) | `.work/devflow/i<issue>/ledger.json` ([main work tree](repository.md#issue-folder)) | private | until the Issue closes |
| product contracts | lasting rules code, tests and developers rely on, and the reasons for the skill's rules | `docs/specs/` | public | when a contract changes |
| current design decisions | current choices and reasons, alternatives not taken, conditions for revisiting | `docs/design/current-decisions.md` | public | updated in place when a choice changes |
| plan | files, order, risks, proof, per-task interfaces | `docs/plans/` | private | until the Issue closes |
| plan summary | four lines: files, order, risks, proof | PR body or checkpoint | public | permanent |
| prompt | only new instructions and the changed part of decisions | chat or `docs/prompts/` | private | one-off |
| handoff | not written; the state block and checkpoints replace it. Only when private evidence is truly needed | `artifacts/handoff/` | private | as needed |
| evidence | raw logs, measurements | `artifacts/`, `.work/` | private | kept |
| lessons | where they go depends on their kind (the devflow skill's [learn reference](../../skills/devflow/references/learn.md)) | — | — | deleted from instructions once a test confirms them (the safety floor stays) |

Keep each fact in one place. Other places only link to it, except the test-pinned copies named at the top.

Current design decisions live by topic in `docs/design/current-decisions.md` alone; when a choice changes, update its
section in place. Each section holds only the current choice and reason, alternatives not taken, and conditions for
revisiting. The owner the top of this spec names (a spec or the devflow skill) holds the rules, and the summary points to it.
Superseded choices, change dates and work history do not pile up in the current summary; they stay in Issues and git.
Do not create history decision files or archive folders.

Write to the Issue only at stage boundaries, decisions and blockers; task-level progress goes to the ledger. This cuts
public edits and gives content a place to stay when it cannot be posted, as in an unattended run. The ledger exists only
on its machine, so another machine continues only from the Issue's state block.

## Memory tools

claude-mem, Claude auto memory and memory tools the user builds are a search layer. The sources of truth are Issues,
git, specs, [current design decisions](../design/current-decisions.md) and AGENTS.md; when a memory tool's content
conflicts with them, the source of truth wins. devflow does not write to memory tools directly. Memory tools work
alongside devflow by collecting activity through hooks or indexing the sources of truth above. What a memory tool
injects at session start shares the context with the resume card, so measure its size. When the Issue is in a public
repository, write only a publishable summary in the Issue and point to private evidence by local file path or hash.

## Size budgets

| Document | Limit | When over |
|---|---|---|
| SKILL.md | under 5,000 tokens, rules to keep at the top | move branch-specific content to `references/` |
| skill reference | under 5,000 tokens | split further |
| skill description | at most two sentences: what it does, then when | narrow the scope |
| project AGENTS.md | one page (about 1,000 tokens) | move to situational pointers |
| spec file | under 5,000 tokens | split by topic |
| state block | 15 lines | move old content to checkpoints |
| checkpoint | 10 lines | point to evidence by path |
| prompt | 500 tokens | keep only the changed part |
| resume card | under 1,000 tokens | [reduction order in issues](issues.md#budget-and-preserving-meaning) |

Why: the amount reattached after compaction is limited ([host-facts](../research/host-facts.md)), and text that is
always loaded costs every turn.

## Naming

- Branches: `<type>/<issue>-<slug>` (for example `feat/12-resume-card`). A repository that pushes straight to the
  default branch still works on a local branch with this name for each unit of work, then fast-forwards the default
  branch and pushes when done. The resume card finds the Issue by branch name.
- Private files: `YYYY-MM-DD-i<issue>-<slug>-<kind>.md`, where `kind` is `prompt`, `plan` or `handoff`
- Current design decisions: update the single `docs/design/current-decisions.md` by topic.

## Reading, writing and caching

- When continuing work, read only the Issue body, the one latest checkpoint written by someone with write access, and
  that Issue's ledger and private plan and handoff (if any). Do not read all comments, old prompts or other Issues'
  handoffs.
- Subagents read large documents or many files and return only a summary.
- Do not rewrite Issue content into prompts and handoffs. Output costs more than input and is reread in every later
  session.
- Always-loaded documents (AGENTS.md, skills, hook output formats) carry no dates or progress. They break the cache and
  go stale quickly.
- In interactive work, when a unit of work ends, finish the [handover order](ledger.md#concurrent-sessions), `/clear` and restart
  from the resume card. Compaction costs a summary and loses detail. Only the user can run `/clear`, so unattended runs
  follow [unattended run](ledger.md#unattended-runs).

## Text agents read

Applies to AGENTS.md, SKILL.md, agent prompts, hook messages and delegation briefs.

1. Give a reason with each instruction. Models generalize from reasons. Write output formats as "do this".
2. Do not use emphasis such as MUST, CRITICAL or EXTREMELY. In recent models it causes overtriggering and early
   stopping. The exception is the safety floor. The floor keeps its prohibition wording as is.
   Boundary wording (conditions to ask or stop) states the effect it prevents and how far work may continue outside it.
   Even without emphasis words, a boundary meant to restrain an older model can stop a newer one more than needed, so
   review it when changing model family or version. This review does not remove the floor or widen authority.
3. Do not instruct what models do by default: urging tests, "think carefully", "write your reasoning in the response"
   (this causes refusals).
4. When pointing to a document, attach the situation: "When changing X, read Y." Do not make always-read-first lists.
5. Write the completion conditions first: acceptance criteria, verification command, an example of healthy output.
6. Do not restate facts one can see directly, such as directory structure, configuration files or script usage.
7. Two model families read it. Mark host-specific features and keep them apart.
8. Measurements and change history go in Issue checkpoints and git. Instruction documents hold only rules in effect now.
9. Committed text is written in English: instructions, skills, references, specs, design, research, plans, commit
   messages, test messages, hook output. The same content takes fewer input tokens and reads the same on both hosts.
   Issues, checkpoints, PR bodies and reports to the owner are written in Korean. Korean literals the Issue protocol
   parses and user prompts the eval simulates stay as they are.
10. devflow has no blocking mechanisms. Effects a test can decide go in tests and CI; the rest is left to instructions
    and review ([why the current choice](../design/current-decisions.md#instructions-and-protections)). Sentences moved into tests are
    deleted (the devflow skill's [learn reference](../../skills/devflow/references/learn.md)), but the safety floor stays. Rules that need judgment stay in
    documents and review. Host-specific means are marked as in rule 7, and their support follows
    [host-facts](../research/host-facts.md).

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

- Each reference sits one level below its skill and is linked from SKILL.md with the situation that calls for it. A
  file linked from SKILL.md is read whole; a file reached through another file is often read only in part, and its
  rules are lost.
- A reference links no other reference, and a procedure never needs a second reference. When a request spans two
  procedures, SKILL.md names both, so every read stays one level deep. A stage that delegates also uses the roles
  reference for the brief's role text; SKILL.md names it in its Delegation section and reading table, and the stage
  reference points there rather than linking it.
- Skill files link only inside the skill folder and cite no plugin spec, so a session needs no plugin document outside
  the skill to finish a step; specs may link to the skill. A test enforces this. The plugin's runtime parts are the
  exceptions the skill relies on: the card's `Tool:` (`bin/devflow-state`) and the hooks. The plugin ships no agent
  definitions; every role runs on a host's built-in agent with the role text in the brief (#157, #159).
- It starts with its done condition, so a partial read still knows when to stop. One over 100 lines starts with a
  contents list, so a partial read still sees every section.
- In-response checklists appear only in start, ship, cleanup, and plan when it has five or more tasks; these long
  stages lose steps without one. Quality-critical steps keep their check -> fix -> recheck loop either way.
- Rules that must survive compaction go at the start of SKILL.md, because compaction reattaches only the start of an
  invoked skill body and no reference.
