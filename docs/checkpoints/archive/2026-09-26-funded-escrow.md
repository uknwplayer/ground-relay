# Checkpoint — M4 funded escrow fixture verified

**Date:** 2026-09-26  
**Milestone:** M4 — real funded escrow fixture  
**Repository:** `uknwplayer/ground-relay`

## Deployed program

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Program account is independently verified present and executable on Solana devnet.

Upgrade authority / dedicated devnet poster:

`6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`

## Funded task proof

Workflow:

`Create devnet escrow fixture`

Run ID:

`36203365279`

Conclusion: **success**

Fixture:

- name: `ground-relay-devnet-escrow-v1`
- task ID: `e335a4ea1f23a002db02f94c371d311b5b46fa908a7f2f6c9f72e60ea122f662`
- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- poster: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- intended worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- mint: devnet WSOL `So11111111111111111111111111111111111111112`
- reward: `1,000,000` atomic units = `0.001 WSOL`
- poster WSOL account: `FBeCmjTbAYKP9ZmEr35Fum7sVrsm8EgipVQup2KFgnec`
- worker WSOL account: `2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6`

Transactions:

- WSOL funding: `5BgqhbRbquE6yWcvjzcBEHJsMaC9b3MAGjyx2qRWots8ARqE6JnqapDhXfjEmEmsSooPSHkv3Pmpp5eM2AQadm5c`
- `post_task`: `4tBjUWu9cnSZQSHqGkwNZHyJN92uRy1eDAhjQhoUhzZDGuCaKWKPpmhgmA8YHcPBQtYRU5JEseEDywJZ6ZF6pCRi`

## Independent signer-free baseline

Inspection run:

`36204752261`

Verified immediately before physical mobile Anchor validation:

- task owner is the Ground Relay program
- status: `open`
- worker: none
- evidence hash: none
- vault amount: `1,000,000`
- vault authority: task PDA
- worker WSOL token amount: `0`
- mint/vault/token invariants: pass

This baseline makes the later payout proof measurable: after successful settlement the vault should decrease and the worker WSOL token account should increase by the reward amount.

## Security / continuity constraints

- Do not recreate this fixture.
- Do not regenerate the program identity.
- Do not expose deployment Secrets.
- Do not interpret devnet WSOL as real-world monetary value.
- The next milestone must use the worker wallet to sign the actual Anchor instructions.

## Handoff

M4 is complete.

Next milestone: **M5 — physical validation of direct Android -> Anchor claim and evidence delivery.**
