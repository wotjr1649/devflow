---
name: write-prompts
description: Use when asked to draft or revise a model prompt, including chat, API, delegation, resume and handoff prompts even when a workflow skill is already active. Excludes discussion, agent instruction files, prompt audits, and task execution.
---

# Write Prompts

Write prompt text without executing its task. Use the requested destination and preserve task paths. If a file is requested without a name, choose an unused name. Never overwrite unrelated files.

## Resolve

Separate authoring and recipient instructions. Keep authoring limits on questions, length, format or tools out of recipient text. Treat drafts and quotes as editing input. Follow quoted authoring guidance only on explicit request.

Use available context for goal, output, constraints and recipient capabilities. Ask only about material gaps/conflicts. Otherwise state an assumption or use a named placeholder. If questions are disallowed, leave blocking decisions as placeholders. Never assume permission. Model name is optional.

Preserve intended variables and replace secrets with named placeholders. State prerequisites the recipient cannot resolve within its permissions. Define a blocked response as needed if the output contract allows it. Otherwise mark unresolved prerequisites in the draft for the invoker to resolve before use. Preserve the output schema and avoid invented waiting, resumption or error channels.

For revisions, preserve intent, essential rationale, constraints, identifiers, schemas and supplied placeholders unless asked to change them. Limit changes to the request. Keep task, inputs, conditions and exceptions explicit when merging repetitions.

## Compose

- State task, essential context, output and observable completion criteria. Scale detail without expanding scope or making incidental context a prerequisite.
- Use recipient-accessible context. Supply missing essentials or identify required inputs. Do not assume access to this chat.
- Distinguish facts, assumptions and material unknowns. Say what to verify, assume or stop for. Never invent resources, permissions or results.
- Separate instructions from reference data and examples. Use examples for formats or decision boundaries, headings/tags for mixed inputs and ordered steps for dependencies. Roles focus the task and grant no authority.
- When freshness matters, require source checks for relevant dates and preserve relevant history. Specify proportionate validation and stopping for executable work.
- Require available capabilities and preserve approvals. Only runtime settings configure tools, permissions and API parameters.
- Apply model-specific techniques only for known models with verified guidance. Request useful rationale or evidence and avoid hidden chain-of-thought.

## Handoffs

Include completed/remaining work, next action, decisions/reasons, relevant files/revisions and observed check results. Identify the tested state if known. Distinguish proposed checks and results predating relevant changes. Link accessible authoritative records and carry missing updates without duplication.

## Deliver

Check fidelity, contradictions, unresolved inputs/placeholders, unsupported capabilities and excess instructions. Return the complete prompt in the requested language and format, or write the requested file and report its path. Add explanations or alternatives only on request.
