# Physical Android -> Anchor -> escrow payout proof

**Local date:** 2026-09-25  
**UTC date:** 2026-09-26  
**Milestone:** M5 complete / M6 settlement proof established

## What was proven

A physical Android device running Ground Relay connected to the worker's Solflare wallet and completed the real deployed Anchor path on Solana devnet:

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

This is not the earlier memo bootstrap. The mobile app invoked the deployed Ground Relay program and the funded escrow reward was transferred to the worker token account.

## Canonical addresses

- program: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- poster: `6WG3UpKV9vBRh4XR961eZGpPZcHVGdxqpM3Eten5quuZ`
- worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- task PDA: `7knPNeaZHDn7qVzdGy6Qbq3tWnHMnP2TpHULwLKzVtpT`
- vault PDA: `FGaGmGu8cbYRbdsUubmLDDRNnjic5NutnCM4kFL77bZm`
- worker WSOL token account: `2fm8p8DpCeJvcpvNbCpzURRezQthF2z2yQARLgPgZfu6`
- WSOL mint: `So11111111111111111111111111111111111111112`
- reward: `1,000,000` atomic units = `0.001 WSOL`

## Evidence delivery

The physical app captured an image and computed this SHA-256 hash locally:

`7d29069a59aec691ef133d7b7813cdd6e0d4a2ffc807e0887f9a5ad5a59ba802`

Independent signer-free RPC inspection after the mobile submission observed:

- status: `delivered`
- worker: `7XY6t1adc9vmuefiEP25TsoEjxRkFhVxT4yQrtN5zr2C`
- evidence hash: exact match with the device hash above
- vault amount: `1,000,000`
- invariant checks: PASS

Inspection workflow run: `36207009665`.

## Poster acceptance

The guarded poster workflow executed `accept_task` after delivery.

- workflow run: `36207042540`
- status before: `delivered`
- status after: `accepted`
- acceptance signature: `4QVs7r2xBgSNzZHm8z3N5jbJZKVNCAT4cXEw9pTCqVRv79DchyYDfjnUXUsDJCVWuWFZCZ6WJYE1zTBrDoHSF8Hd`
- verification: PASS

## Worker payout

The physical Android app then asked the connected worker wallet to execute `release_payment`.

Payout signature:

`4miSuLtKtHANH7Auv52FbQECCyiPc9gQioo5qENWS8izvyeQtHwPgMZad7W9GyGKJ9MzyYyUD8P6pW9qvM92kpEk`

The wallet preview showed a `+0.001 SOL` Wrapped SOL transfer and reported transaction success. The app hydrated to `PAID`.

Independent signer-free RPC inspection after payout:

- workflow run: `36207197941`
- task status: `paid`
- evidence hash: unchanged and correct
- vault amount: `0`
- worker token amount: `1,000,000`
- worker token owner: expected worker
- mint/vault/token invariants: PASS

This independently proves that the escrowed `0.001 WSOL` left the task vault and arrived in the worker's token account.

## Mobile Wallet Adapter return behavior discovered during validation

Solflare can successfully submit a transaction and then the Android Mobile Wallet Adapter session can return `java.util.concurrent.CancellationException` while control is returning to the app. The first physical `claim_task` exhibited this behavior: on-chain inspection showed `CLAIMED` even though the app initially displayed `Claim failed`.

The same class of ambiguity can affect evidence submission or payout, so the client was hardened to reconcile an ambiguous wallet return against authoritative on-chain state before displaying a failure.

Regression coverage was added for:

- claim landed despite wallet-return cancellation
- evidence delivery landed only when the on-chain hash matches
- payout landed only when status is `PAID` for the assigned worker
- wrong-worker state never reconciles as success

CI run `36207598375` passed all six Node tests and TypeScript typechecking after the fix.

## Milestone conclusion

**M5 is complete.**

The physical Android app has proven direct interaction with the deployed Ground Relay Anchor program for claim, evidence delivery, state hydration, acceptance handoff, and worker-signed escrow payout.

M6 should now focus on adversarial/failure paths and escrow lifecycle cleanup rather than repeating this successful fixture.
