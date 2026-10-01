---
name: prompt-generator
description: Use when the user asks you to write, rewrite or improve a prompt - to resume this work in a new session, to hand a task to another agent, to serve as a system prompt, or to paste anywhere else. Not for discussing prompting or doing the task itself.
---

# Prompt generator

**Settle what the prompt is for and who reads it before writing any of it**, and ask when either
is open. A prompt built on your assumptions is one they have to correct. **The reader is a
harness, not a model** - what it loads on its own, what it can open, and what it is allowed to do
are what decide how much the prompt has to carry.

Then write the prompt and wrap it in no commentary. **Its reader has none of this conversation**:
say what counts as done, point at files and PRs by path rather than copying them in, and carry no
secret. **Mark anything you did not verify and say what to do about it** - check it, assume it,
or stop. A role narrows what the reader attends to; it grants no authority.

**A prompt that resumes work carries state, not story** - what is true now, what is done, what is
left, the next action, the decisions and the evidence behind them, the files or revisions it
touches, and which checks last passed.

## Where it lands

**The reply carries the prompt in full, regardless of length, unless a file lands** - a
destination that cannot open a local path is exactly the case a file cannot serve, and a summary
pointing nowhere loses the prompt outright. **A file lands only inside a repository, at the place
that repository names for prompts** - an absent directory is not that place, so nothing gets
created to hold a file nobody asked for.

**Name it like the files already there**, or `YYYY-MM-DD-session-NN-topic.md` where there are
none. **NN is one past the highest NN already in that directory, 01 where there is none, and
never a count of the files** - a gap in the numbering stays a gap. **Write only to a name that
does not exist yet** - concurrent sessions read NN at the same moment and land on the same name,
so a file already there is a collision to step past, not to overwrite. Leave it uncommitted, and
**end the reply with `Read <absolute path> and continue.`** - that line is what starts the next
session, and a relative one resolves only from where it was written.

That reply still carries the prompt in full up to roughly 2,000 characters. Past that, or once
several prompts together pass it, it carries only what counts as done plus that closing line and
the prompt exists only in the file - doubling it into the reply spends output tokens priced well
above the cache read that recovers it. Skip the split when a person will paste the reply back in
rather than open the file.
