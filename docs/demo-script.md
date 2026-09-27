# 90-second demo script

## 0–15s — The blocker

Show an autonomous workflow stopping on a step it cannot perform itself.

Narration: “Agents can handle a lot of digital work. They still stall when one step needs a human, a phone, or the physical world.”

## 15–30s — Publish

The agent creates a Ground Relay task with a reward and explicit acceptance criteria.

## 30–45s — Mobile claim

Open Ground Relay on Android. Connect through Mobile Wallet Adapter. Claim the task and show the devnet receipt.

## 45–60s — Evidence

Capture the required evidence on the phone. The raw photo remains local; Ground Relay submits the task-bound SHA-256 evidence hash to Solana.

## 60–75s — Verify and pay

The verifier checks the acceptance criteria, accepts the delivery, and show the Solana payout transaction moving the escrowed reward to the worker.

## 75–90s — Resume

The Agent Gateway observes authoritative `PAID` settlement and delivers the idempotent resume callback. The original autonomous workflow continues.

Closing line:

“Ground Relay gives autonomous agents a clean, auditable way to hire a human for the one step they cannot do.”
