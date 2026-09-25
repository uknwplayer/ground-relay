# Checkpoints

This directory is the durable project handoff layer.

## Canonical checkpoint

`docs/checkpoints/CURRENT.md` is the single source of truth for where work stopped and what should happen next.

Update it whenever a meaningful milestone is reached, a blocking failure changes the next action, or before ending a work session that would otherwise require reconstructing context.

## Archive

Before replacing a major checkpoint, copy the old state into:

`docs/checkpoints/archive/YYYY-MM-DD-<milestone>.md`

Archive milestone checkpoints, not every small commit.

## What a checkpoint must contain

Each checkpoint should record:

- verified working state
- exact public program IDs, transaction signatures, workflow run IDs, and commit SHAs that matter
- known limitations
- security constraints that must not be violated
- current blocker or active operation
- the single next recommended action
- any action that must explicitly **not** be repeated

Never put private keys, seed phrases, raw GitHub Secrets, auth tokens, or other credentials in a checkpoint.
