# Evidence Privacy and Local Retention

Ground Relay's current mobile evidence path is intentionally hash-first and local-first.

## What leaves the device

The worker captures a photo with the mobile camera. Ground Relay reads the captured bytes locally and computes a SHA-256 commitment bound to the task ID:

`SHA-256("ground-relay:v1:" + taskId + ":" + base64(photoBytes))`

The current protocol submits only that task-bound hash to the selected Solana task account. The mobile app does not upload the raw photo to the Gateway or store the raw photo bytes, file URI, or base64 payload in restart state.

The versioned AsyncStorage state contains task discovery/session context such as task IDs, PDA bindings, signatures, and the expected evidence hash. Serialization sanitizes the state through the supported schema, so extra photo URI/byte fields are not retained.

## Local retention policy

A captured photo is retained locally only while it may still be needed to complete or recover the evidence submission. The app attempts an idempotent local-file deletion when:

- a delivery is confirmed or reconciled on Solana with the expected evidence hash;
- a successful retake replaces the previous capture; or
- the worker leaves/switches away from the selected task.

A wallet error or confirmation timeout does **not** cause early deletion. The app first reconciles the selected task against Solana; if the expected delivery cannot be proven, the local capture is retained.

If local deletion fails, Ground Relay surfaces a warning instead of claiming that the photo was removed. The file may then remain on the device or in operating-system-managed storage/cache.

## Metadata / EXIF limitation

The camera picker is currently called with `exif: false`. This prevents Ground Relay from requesting EXIF data as part of the picker result, but it is **not treated as proof that metadata has been cryptographically removed from the underlying image bytes**.

Ground Relay therefore does not claim guaranteed EXIF/GPS sanitization of the local image file. If a future product requirement needs that guarantee, the evidence pipeline should explicitly decode and re-encode the image without metadata, verify the sanitized output, and compute the submitted hash from those sanitized bytes.

## What the hash proves

The submitted hash commits to the captured bytes and the specific Ground Relay task ID. It helps prevent the same receipt from being silently reused as evidence for another task.

It does not, by itself, prove that the photo semantically satisfies the task's acceptance criteria. Semantic verification remains a verifier/application responsibility. The historical physical M5 photo is therefore evidence of the protocol and evidence-pipeline flow, not proof that every requested storefront/business-sign semantic was independently verified.

## Scope

This policy describes the current devnet mobile implementation. It does not authorize mainnet deployment and does not change the Anchor escrow protocol or payout rules.
