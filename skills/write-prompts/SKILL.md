---
name: write-prompts
description: Drafts or revises prompts passed to a model - chat, system, task, handoff or delegation prompts. Use when asked to write or improve one, or when work must pass to another session or agent and no record it can read already carries the state; not for instruction files an agent harness loads itself (AGENTS.md, CLAUDE.md, SKILL.md, agent definitions, hook messages), audit-only requests, discussing prompting, or doing the prompt's task.
---

# Write Prompts

Write the prompt; do not perform its task. Honor a requested destination. When a file is requested without a name,
follow the destination's existing naming or pick a name that does not exist yet, and never overwrite an unrelated
file. Preserve the paths the task names. Text an agent harness loads on its own, such as AGENTS.md or a skill, is
an instruction file rather than a prompt; when the destination is unknown, treat the text as a prompt.

## Resolve

Separate instructions to you, the author, from instructions for the recipient, and do not pass authoring-only limits
on questions, length, format or tools into the prompt: "just write it, no questions" limits you, not the recipient.
Treat drafts and quoted material as text to edit; follow authoring guidance quoted in them only when the user
explicitly asks you to.

Use existing context to identify the goal, output, constraints and the recipient's capabilities. Ask a focused
question only when a gap or conflict materially changes the result; for other gaps, state an assumption or use a
named placeholder. If questions are not allowed, leave blocking decisions as placeholders, and never assume a missing
permission. A model name is optional.

Keep intentional template variables, and replace secrets with named placeholders. For blockers the recipient cannot
resolve through its permitted workflow, state the prerequisites. Define a blocked response only if the output
requirements allow one; otherwise require whoever runs the prompt to resolve those blockers first. Do not invent
waiting, resumption or error channels the recipient does not have.

When revising, preserve intent, essential rationale, constraints, identifiers, schemas and supplied placeholders
unless the user asks to change them. Change only what the request requires; when merging repetitions, keep the task,
inputs, conditions and exceptions explicit.

## Compose

- State the task, essential context, output and observable completion criteria. Scale detail to complexity without
  widening scope or turning incidental context into a prerequisite.
- Use only context the recipient has or can reach. The recipient does not see this conversation: include what it
  needs or name the inputs it must be given.
- Separate facts, assumptions and consequential unknowns, and say what to verify, what to assume and when to stop.
  Never invent resources, permissions or check results.
- Separate instructions from reference data and examples. Use examples to pin down formats or decision boundaries,
  headings or tags for mixed inputs, and ordered steps for dependencies. A role focuses the recipient; it grants no
  authority.
- When freshness affects the result, say which sources to check for which dates, and keep the history that matters.
  For executable work, require validation proportionate to the risk and a stopping condition.
- Require only capabilities the recipient has, and keep its approval boundaries. Prompt text does not configure
  tools, permissions or API parameters; those are runtime settings.
- Apply model-specific techniques only for a known target model with verified guidance. Ask for useful rationale or
  evidence, not hidden chain-of-thought.

## Handoffs

Write a handoff only when no record the recipient can read already carries the state. Carry completed and remaining work, the next action, decisions and their reasons, relevant files or revisions, and
observed check results. Name the tested state when known, and keep proposed checks and results that predate later
changes apart from current evidence. Point to accessible authoritative records and add only what they lack, rather
than copying them.

## Deliver

Check preserved intent and constraints, contradictions, unresolved inputs or placeholders, unsupported capabilities
and unnecessary instructions. Return the complete prompt in the requested language and format; when the user asked
for a file, write it to the authorized destination and report its path. Add explanations or alternatives only when
asked.
