# M9 Release and Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the merged, devnet-proven Ground Relay M8 state into a reviewer-ready release candidate and complete submission package without changing the proven settlement/security model.

**Architecture:** Treat the M8 merge commit on `main` as the code freeze baseline. M9 work lives on `m9-release-submission` and focuses on reproducible release artifacts, reviewer verification, documentation polish, and submission media; runtime changes are optional and must justify themselves against submission value. The Solana program remains devnet-only and the Agent Gateway remains non-custodial.

**Tech Stack:** GitHub Actions, Expo/React Native Android, Anchor/Solana devnet, Markdown documentation, GitHub-hosted proof links, submission media.

**Spec:** `docs/roadmap.md` — M9 section, plus `docs/checkpoints/CURRENT.md` for the authoritative project state.

## Global Constraints

- No mainnet deployment is authorized.
- Do not regenerate or replace the controlled program identity or deployment Secrets.
- Do not recreate or repay historical physical proof tasks.
- Solana state remains authoritative for transaction/lifecycle decisions.
- The Gateway remains non-custodial and must not gain signing secrets.
- Release artifacts must be traceable to an exact commit and CI run.
- Optional deep-link/QR work is allowed only if it materially improves reviewer/demo UX without destabilizing the release candidate.

## Review Focus

- Release artifact provenance: reviewer can map APK -> CI run -> exact commit.
- Fresh-device behavior: install/connect/refresh fails closed if RPC/Gateway is unavailable.
- Public verification: proof links do not depend on private credentials or local files.
- Submission clarity: README, architecture, demo script, and proof guide tell one consistent story.
- Scope control: optional UX additions cannot mutate the proven payment/security path late in M9.

---

### Task 1: Freeze and verify the post-M8 release candidate

**Files:**
- Modify: `docs/checkpoints/CURRENT.md`
- Modify: `docs/roadmap.md`
- Create: `docs/release-candidate.md`

**Interfaces:**
- Consumes: merged M8 commit `ffcb9b7d69e159ec05fd11139b02bbb442099299`, Android standalone workflow, existing hosted Gateway URL.
- Produces: exact release APK provenance record with run/artifact/hash/install checklist.

- [ ] **Step 1:** Confirm all push-triggered checks on the M8 merge commit are green or record any remaining in-progress job.
- [ ] **Step 2:** Confirm `Android standalone APK` run for the merge commit succeeds and publishes `ground-relay-standalone-apk`.
- [ ] **Step 3:** Download the APK artifact, compute SHA-256, and verify the hosted Gateway `/v1` URL is embedded.
- [ ] **Step 4:** Record commit, run ID, artifact name, SHA-256, Gateway URL, Program ID, and devnet-only warning in `docs/release-candidate.md`.
- [ ] **Step 5:** Update CURRENT/roadmap to mark M8 integration complete and M9 release candidate produced.

### Task 2: Build the reviewer verification kit

**Files:**
- Create: `docs/reviewer-verification.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: M8 physical proof signatures/PDAs, release candidate record, public GitHub workflow URLs.
- Produces: one reviewer-facing path from clone/install to independent proof verification.

- [ ] **Step 1:** Collect canonical public links for repository, release-candidate CI run, final M8 sweep, physical payout transaction evidence, hardened deployment verification, and hosted Gateway health endpoint.
- [ ] **Step 2:** Write a concise independent verification sequence: inspect commit -> verify Program ID -> verify proof task/payout -> install APK -> inspect PAID history.
- [ ] **Step 3:** Add expected values for task PDA, worker, reward, evidence hash, payout signature, and exact token deltas.
- [ ] **Step 4:** Add failure-safe guidance: no wallet secrets, no mainnet, do not retry historical payouts.
- [ ] **Step 5:** Link the verification guide prominently from README.

### Task 3: Submission-facing README and architecture polish

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/product-anatomy.md` only where stale claims conflict with M9 state.

**Interfaces:**
- Consumes: verified M8/M9 evidence.
- Produces: a reviewer can understand problem, mechanism, trust boundaries, proof, and install path in under five minutes.

- [ ] **Step 1:** Audit README for stale M7/M8 wording and duplicated proof instructions.
- [ ] **Step 2:** Make the top section explain: autonomous agent blocked -> human physical task -> devnet escrow -> evidence -> acceptance -> payout -> agent resume.
- [ ] **Step 3:** Add a compact trust-boundary section: worker wallet signs worker actions; poster signs acceptance; Gateway stores no signing secrets; Solana is authoritative.
- [ ] **Step 4:** Add release candidate + reviewer verification links without exposing Secrets.
- [ ] **Step 5:** Run repository hygiene/Markdown link checks available in CI and correct stale references.

### Task 4: Demo and submission package

**Files:**
- Modify: `docs/demo-script.md`
- Create: `docs/submission-copy.md`
- Create: `docs/submission-assets.md`

**Interfaces:**
- Consumes: release candidate, reviewer kit, existing screenshots/physical proof.
- Produces: 90-second demo script, submission text, screenshot shot-list, and pitch-deck content outline.

- [ ] **Step 1:** Rewrite the demo script to a strict ~90-second arc with visible proof beats and no unverified claims.
- [ ] **Step 2:** Draft short/medium/long submission copy variants covering problem, solution, why Solana Mobile, architecture, security, and proof.
- [ ] **Step 3:** Define the minimum screenshot set: inbox, DELIVERED/receipt, PAID receipt, architecture/proof page.
- [ ] **Step 4:** Define pitch-deck slide content before creating visual slides.
- [ ] **Step 5:** Record which media steps require human capture/recording and stop only at those gates.

### Task 5: Optional reviewer handoff decision

**Files:**
- Modify only if approved by evidence of material UX benefit.

**Interfaces:**
- Consumes: reviewer verification friction observed in Tasks 1-4.
- Produces: explicit `do` or `defer` decision for deep-link/QR and Solana dApp Store readiness.

- [ ] **Step 1:** Evaluate whether deep-link/QR removes a real reviewer step without touching payment authorization.
- [ ] **Step 2:** If benefit is marginal, defer and document the decision.
- [ ] **Step 3:** If benefit is material, create a separate design/spec and test plan before implementation.

### Task 6: Final M9 integration gate

**Files:**
- Modify: `docs/checkpoints/CURRENT.md`
- Create: `docs/checkpoints/archive/2026-09-27-m9-ready.md`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: branch ready for PR/merge and external submission.

- [ ] **Step 1:** Run the full consolidated mobile/Gateway/Anchor/hygiene verification on the final M9 branch state.
- [ ] **Step 2:** Verify all reviewer links and artifact hashes against the exact branch head.
- [ ] **Step 3:** Record any human-only missing media/submission action as the only remaining blocker.
- [ ] **Step 4:** Open a PR from `m9-release-submission` to `main` after the final gate is green.
