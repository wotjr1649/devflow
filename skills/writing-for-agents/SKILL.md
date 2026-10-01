---
name: writing-for-agents
description: Decide what a document whose reader is a model should contain, and what to cut from it. Use when writing or revising an AGENTS.md or CLAUDE.md, a hook or script preamble, a skill's prose, or any instruction file an agent loads rather than a person reads.
---

# Writing for agents

The packaging differs - a contract, a preamble, a skill - and the writing does not. The levers
here pull on two things: what the document costs every turn, and whether the agent takes the same
process on every run.

**This is about the sentences.** A skill's machinery - directory layout, frontmatter fields, skill
types, `description:` wording, prohibition under pressure, and the pressure tests that prove a
skill works - is not here. Where `superpowers:writing-skills` is installed it carries that half
and the measurements behind it; where it is not, that half is simply out of scope.

## Two loads

**Context load** is what sits in context every turn: an always-loaded instruction file, a preamble
the reader cannot skip, a listed skill's description.

**Cognitive load** is what a person carries instead - which documents exist, and when to reach for
each. It is not a cost to minimise. It is the price of human agency: spend it where human
judgement decides, remove it where it does not.

Hand-invoking a skill moves the cost onto the person, and what it saves depends on the host: one
may keep the description out of context entirely, another may only stop the automatic call.
**Claim the saving where a host documents it.**

## Where a rule lives

**Branching decides whether a rule sits in the file or behind a pointer to another one.** Inline
what every branch needs; disclose what only some branches reach. A line count flags a document
to check; branching says what to move.

**Co-location is the within-file half.** A concept's definition, its rules and its caveats belong
under one heading. Scattering is the failure, not the repetition of a word.

**Sharpen a loose completion criterion before splitting the sequence.** Hiding the later steps
that tempt a rush helps only at a real context boundary; an inline call clears nothing.

## Pointers

**A pointer's wording, not its target, decides when the agent reaches the material.** One trigger
per branch, in the body; a `description:` is matched and grepped through another channel, where
synonyms widen recall instead of writing one branch twice.

**A pointer to something already in context is not a pointer.** Sending the agent to re-read a
loaded file costs a turn and returns what it had.

## Leading words

A **leading word** is a compact concept already in the model's pretraining that the agent thinks
with while running the document - *load*, *cache* and *floor* are this document's own. Repeated
as a token rather than restated as a sentence, it accumulates a distributed definition and anchors
a region of behaviour in very few tokens.

An invented word recruits no priors: you pay in definition tokens what a pretrained word gives
free. **Assume the document carries restatements a leading word retires, and go find them.**

## Prohibition

For shaping what the output looks like, a positive recipe beats a prohibition, which drags the
forbidden thing into context.

**A safety floor is the exception, and it stays as it is.** A non-waivable invariant cannot be
phrased positively without losing its edge: a rule that says what to do instead is a default, and
a default is not a floor.

## Pruning

**The environment is a source of truth** - a script's usage output, a config file, the directory
layout, a table another document owns. A document restating one of those is a cache. Cache what
the agent cannot find by looking: the unwritten convention, the reason behind a choice, the
failure no config confesses.

**Sediment** is the default fate without pruning: stale layers settling because adding feels safe
and removing feels risky, until the live rules must be dug out from under them.

**Hunt no-ops sentence by sentence.** An instruction the model already follows by default pays
load to say nothing, and the test - does this change behaviour against the default? - is
model-relative, not reader-relative. Settle it by running the document rather than by arguing.
When a sentence fails, delete the sentence rather than trim words from it.

## What a note carries

The rule, and the reason the rule exists. The measurement behind it, the count, the session that
found it: those belong in the commit message, where history is read as history. A note states what
holds, so it carries no date.
