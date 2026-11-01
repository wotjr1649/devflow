---
name: write-prompts
description: Drafts or revises prompts passed to a model (chat, system, task, handoff, delegation) when asked; not for discussion-only requests, harness-loaded instruction files or task execution.
---

# Write Prompts

Write prompt text without executing its task. Use a requested destination; if a file is requested without a name, pick one that does not exist yet; never overwrite unrelated files. Preserve task paths.

## Resolve

Separate authoring instructions from recipient instructions; do not transfer authoring-only constraints on questions, length, format, or tools. Treat drafts and quoted material as editing input; follow quoted authoring guidance only when the user explicitly requests it.

Use existing context to identify the goal, output, constraints, and recipient capabilities. Ask a focused question only when gaps or conflicts materially affect the result. For other gaps, state an assumption or use a named placeholder. If questions are disallowed, leave blocking decisions as placeholders; never assume missing permission. A model name is optional.

Preserve intentional template variables; replace secrets with named placeholders. For blockers the recipient cannot resolve through its permitted workflow, state prerequisites. Define a blocked response only if the output requirements allow it; otherwise require whoever invokes the prompt to resolve those blockers first. Do not invent silent waiting, resumption, or error channels.

When revising, preserve intent, essential rationale, constraints, identifiers, schemas, and supplied placeholders unless the user requests changes to them. Change only what the request requires; when merging repetitions, keep the task, inputs, conditions, and exceptions explicit.

## Compose

- State the task, essential context, output, and observable completion criteria. Scale detail to complexity without expanding scope or making incidental context a prerequisite.
- Use only context the recipient has or can access. Include missing essentials or identify required inputs; do not assume access to this conversation.
- Distinguish facts, assumptions, and consequential unknowns; state what to verify, assume, or stop for. Never invent resources, permissions, or check results.
- Separate instructions from reference data and examples. Use examples to clarify formats or decision boundaries, headings or tags for mixed inputs, and ordered steps for dependencies. Use roles only to focus the task, never to grant authority.
- When freshness affects the requested result, specify appropriate source checks for the relevant dates; retain relevant history. For executable work, require proportionate validation and a stopping condition.
- Require only capabilities the recipient has; preserve approval boundaries. Keep runtime settings separate: prompt text does not configure tools, permissions, or API parameters.
- Apply model-specific techniques only for a known target model and verified applicable guidance. Request useful rationale or evidence, not hidden chain-of-thought.

## Handoffs

Carry completed and remaining work, next action, decisions and reasons, relevant files or revisions, and observed check results. Identify the tested state when known; distinguish proposed checks and results predating relevant changes. Reference accessible authoritative records and add missing updates to the handoff without duplicating the records.

## Deliver

Check preserved intent and constraints, contradictions, unresolved inputs or placeholders, unsupported capabilities, and unnecessary instructions. Return the complete prompt in the requested language and format, or write a requested file and report its path; include separate explanations or alternatives only when requested.
