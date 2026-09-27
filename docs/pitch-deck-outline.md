# Ground Relay — Pitch Deck Outline

Target: 6–8 slides, judge-friendly, minimal text, proof-first.

## Slide 1 — Ground Relay

**Headline:** Human execution for the one step an autonomous agent cannot do.

**Subhead:** Solana Mobile + non-custodial escrow + mobile evidence + agent resume.

Visual: Android app alongside the loop:

`agent blocked -> human task -> proof -> payment -> agent resumes`

## Slide 2 — The problem

Autonomous agents are strong at digital work but still stop at human-only boundaries:

- physical-world inspection;
- mobile-only flows;
- fresh camera evidence;
- in-person confirmation;
- actions that should require a human wallet authorization.

**Point:** one human-only step can halt an otherwise autonomous workflow.

## Slide 3 — The Ground Relay loop

1. Agent publishes a funded task.
2. Android worker discovers and claims it.
3. Worker captures evidence on-device.
4. Verifier accepts the result.
5. Solana escrow pays the worker.
6. Gateway resumes the agent after `PAID`.

Visual: six-node horizontal flow.

## Slide 4 — Why Solana Mobile

- Mobile Wallet Adapter for worker authorization.
- Android camera is part of the real-world execution boundary.
- Evidence bytes stay local; the protocol receives a SHA-256 digest.
- Solana is authoritative for task state and settlement.
- App fails closed if the exact selected PDA cannot be reconciled.

Visual: phone -> task PDA -> vault -> worker wallet.

## Slide 5 — Architecture

Three components:

**Android worker app**
- inbox, wallet, evidence, receipts, recovery

**Agent Gateway**
- task discovery, PDA binding, Solana sync, resume events

**Anchor escrow**
- funded task state machine, payout, recovery, terminal receipts

Trust boundary note: the Gateway does not sign worker settlement transactions.

## Slide 6 — Physical proof

**Devnet lifecycle completed on Android:**

`OPEN -> CLAIMED -> DELIVERED -> ACCEPTED -> PAID`

Program ID:
`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

Fresh task PDA:
`BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`

Reward:
`0.001 WSOL`

Verified movement:
- worker `+1,000,000` atomic;
- vault `1,000,000 -> 0`;
- final authoritative state `PAID`.

Visual: terminal `PAID` Android screenshot + compact transaction proof.

## Slide 7 — Reliability under ambiguity

A real mobile DNS/RPC failure occurred immediately after wallet submission.

What happened:
- payout had already reached Solana;
- app could not complete its post-wallet read;
- no payment was replayed;
- independent verification found `PAID`;
- UI later reconciled safely after network recovery.

**Point:** Ground Relay treats chain state as truth instead of guessing after ambiguous mobile returns.

## Slide 8 — What this enables

Examples:
- agent requests a fresh photo of a physical location;
- field verification before an automated workflow continues;
- mobile-only or device-local confirmation;
- human completion of a last-mile step in an otherwise automated process.

**Closing line:**

Ground Relay gives autonomous agents a clean, auditable way to hire a human for the one step they cannot do themselves.

## Speaker guidance

- spend the most time on Slides 3, 6, and 7;
- show proof before implementation detail;
- avoid claiming mainnet readiness;
- call the current program and payout evidence devnet proof;
- describe callback delivery as retryable/at-least-once until acknowledgement, not exactly-once.
