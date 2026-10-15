---
name: writing-for-agents
description: Decide what a document whose reader is a model should contain, and what to cut from it. Use when writing or revising an AGENTS.md or CLAUDE.md, a hook or script preamble, a skill's prose, or any instruction file an agent loads rather than a person reads.
---

# Writing for agents

Contracts, preambles and skills share one method. It pulls on what the document costs every turn
and whether the agent runs the same process every time.

**This is about the sentences.** The rules live in devflow's documents spec:
[text an agent reads](../../docs/specs/documents.md#에이전트가-읽는-글) and
[skill descriptions](../../docs/specs/documents.md#스킬-description); where this skill differs, the
spec wins. This is the method behind those rules; a skill's machinery (layout, frontmatter) is the
host's documentation.

## Two loads

**Context load** sits in context every turn: an always-loaded instruction file, an unskippable
preamble, a listed skill's description.

**Cognitive load** is what a person carries instead: which documents exist and when to reach for
each. It is the price of human agency, not a cost to minimise: spend it where human judgement
decides, remove it where it does not.

Hand-invoking a skill moves that cost onto the person; its context saving depends on the host.
**Claim the saving where a host documents it.**

## Where a rule lives

**Branching decides whether a rule sits in the file or behind a pointer.** Inline what every
branch needs; disclose what only some branches reach. A line count flags a document to check;
branching says what to move.

**Co-location is the within-file half.** A concept's definition, rules and caveats share one
heading. Scattering is the failure, not a repeated word.

**Sharpen a loose completion criterion before splitting the sequence.** Hiding later steps that
tempt a rush helps only at a real context boundary; an inline call clears nothing.

## Pointers

**A pointer's wording, not its target, decides when the agent reaches the material.** One trigger
per branch, in the body; a `description:` is matched and grepped through another channel, where
synonyms widen recall instead of writing one branch twice.

**A pointer to something already in context is not a pointer.** Re-reading a loaded file costs a
turn for nothing.

## Leading words

A **leading word** is a compact pretrained concept the agent thinks with while running the
document (*load*, *cache* and *floor* here). Repeated as a token rather than restated, it gathers a
distributed definition and anchors behaviour in few tokens. An invented word recruits no priors:
its definition costs what a pretrained word gives free. **Assume the document carries
restatements a leading word retires, and go find them.**

## Prohibition

A prohibition drags the forbidden thing into context, so a positive recipe shapes output better.
**A safety floor stays a prohibition**: a rule that says what to do instead is a default, and a
default is not a floor.

## Pruning

**A document restating the environment is a cache** of a script's usage, a config file, the
layout or a table another document owns. Cache only what looking cannot find: the unwritten
convention, the reason behind a choice, the failure no config confesses.

**Sediment** is the default without pruning: stale layers settle because adding feels safe and
removing feels risky.

**Hunt no-ops sentence by sentence.** Whether a sentence changes behaviour against the default is
model-relative: settle it by running the document. When a sentence fails, delete it
rather than trim words.
