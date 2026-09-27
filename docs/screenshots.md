# Ground Relay — Submission Screenshot Plan

Use screenshots that communicate the product loop in a few seconds. Prefer clean crops, readable state badges, and no unrelated notification content.

## Required set

### 1. Worker inbox / selected task

Show:
- Ground Relay branding;
- connected worker wallet, truncated as the app renders it;
- task title and reward;
- selected task PDA summary.

Purpose: establishes that this is a real mobile worker surface, not only a backend demo.

### 2. Evidence / delivery state

Show a task after camera evidence has been submitted and the authoritative state is `DELIVERED`.

Purpose: demonstrates the phone-to-chain handoff while raw photo bytes stay off-chain.

### 3. Terminal `PAID` receipt

Show:
- `PAID` badge;
- reward amount;
- authoritative worker line;
- `ESCROW PAID · DEVNET` receipt;
- no active historical transaction button.

Purpose: proves the physical Android flow reached terminal settlement and that a completed task is treated read-only.

### 4. Reviewer proof / architecture

Use a clean repository or diagram capture showing:

`agent blocked -> funded task -> worker -> evidence -> verifier -> escrow payout -> agent resumes`

Purpose: lets a reviewer understand the system without reading the whole repository first.

## Recommended order in a submission gallery

1. Product loop / architecture
2. Android task view
3. Evidence / delivery
4. `PAID` settlement receipt

## Privacy / presentation rules

- Do not publish raw evidence photos unless they were intentionally created for public demo use.
- Do not publish device notifications or unrelated personal UI.
- Wallet addresses should remain truncated in screenshots unless a full public address is needed for independent verification.
- Do not show recovery phrases, signing secrets, API credentials, or deployment material.
- Use the public task PDA and transaction signature in text next to screenshots rather than forcing long identifiers into the image itself.

## Device-capture policy for M9 submission

The physical release-candidate screenshot used to validate the clean install is **verification evidence only** and must not be published as submission media.

For public materials, capture a fresh, deliberate screenshot from the release candidate with:
- only the Ground Relay app visible;
- the task reconciled to `PAID`;
- the wallet shown only in the app's normal truncated form;
- no notification shade or unrelated app UI;
- no evidence photo visible;
- status bar kept only if it contains no personal information and does not distract from the product.

A fresh public-facing screenshot supersedes the private verification capture for README, deck, submission gallery, and demo-video stills.
