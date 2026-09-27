# Ground Relay — 90-second demo script

Goal: explain the problem, prove the mobile loop, and end on verified settlement. Keep every shot readable and avoid long console sequences.

## 0–12s — The blocker

**Shot:** an autonomous workflow stops on a step that needs a person, phone, or physical-world evidence.

**Narration:**

“Autonomous agents can handle a lot of digital work. They still stall when one step needs a human, a phone, or the physical world.”

**On-screen line:**

`agent blocked`

## 12–25s — Turn the blocker into a funded task

**Shot:** show the Ground Relay task definition, reward, and explicit acceptance criteria. Briefly show the Agent Gateway / architecture flow rather than a long terminal sequence.

**Narration:**

“Ground Relay turns that blocker into a funded task with clear acceptance criteria.”

**On-screen line:**

`blocked workflow -> funded human task`

## 25–42s — Mobile worker claims

**Shot:** Android Ground Relay app. Show the worker inbox, truncated wallet, task title, reward, and claim flow through Mobile Wallet Adapter.

**Narration:**

“A worker discovers the task on Android, connects through Solana Mobile Wallet Adapter, and claims the exact on-chain task.”

**On-screen line:**

`OPEN -> CLAIMED`

## 42–57s — Fresh evidence on the phone

**Shot:** in-app camera flow followed by the delivered task state. Do not expose a personal photo in the final video; use intentionally public demo evidence.

**Narration:**

“The worker captures fresh evidence on the phone. The raw photo stays local; Ground Relay submits a task-bound SHA-256 hash to Solana.”

**On-screen line:**

`CLAIMED -> DELIVERED`

## 57–73s — Verify and pay

**Shot:** verifier acceptance followed by the Android `PAID` receipt. Overlay the compact proof: reward `0.001 WSOL`, worker `+1,000,000` atomic, vault `1,000,000 -> 0`.

**Narration:**

“After verification, the Anchor escrow pays the worker. Solana records the terminal state as paid.”

**On-screen line:**

`DELIVERED -> ACCEPTED -> PAID`

## 73–84s — Resume the agent

**Shot:** the Agent Gateway sees authoritative `PAID` settlement and the previously blocked workflow continues.

**Narration:**

“Only after authoritative settlement does the Gateway resume the originating agent workflow.”

**On-screen line:**

`PAID -> agent resumes`

## 84–90s — Close on proof

**Shot:** Ground Relay logo plus the six-stage loop and a small devnet label.

**Narration:**

“Ground Relay gives autonomous agents a clean, auditable way to hire a human for the one step they cannot do themselves.”

## Proof card for the final frame or description

- network: Solana devnet
- program: `6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`
- task PDA: `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`
- payout signature: `UbpwAKQMUHmFyBGBF9Z7tq76LmS5oHtT8cyA27SG2ZRoWn7Hn4y57HDR9vPhGWNfw3o5deNEHwCeDYVxQYr2Qge`

## Recording rules

- Call all current chain evidence **devnet** proof.
- Do not show seed phrases, credentials, private evidence, or unrelated notifications.
- Prefer the clean `PAID` release-candidate screen over a historical error screen.
- Keep transaction identifiers in a final proof card or description instead of trying to read them aloud.
- Describe Gateway resume delivery as retryable/at-least-once until acknowledgement; do not call the HTTP transport exactly-once.
