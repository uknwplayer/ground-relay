# Ground Relay M9 release candidate

**Date:** 2026-09-27  
**Source:** post-M8 integrated `main`  
**Status:** CI-built and artifact-inspected; fresh-device install verification pending

## Source provenance

M8 integration PR:

`https://github.com/uknwplayer/ground-relay/pull/3`

Exact source commit:

`ffcb9b7d69e159ec05fd11139b02bbb442099299`

Commit URL:

`https://github.com/uknwplayer/ground-relay/commit/ffcb9b7d69e159ec05fd11139b02bbb442099299`

The Android release candidate was built directly from this `main` commit. M9 documentation work occurs separately on `m9-release-submission`; the APK runtime is therefore traceable to the exact integrated M8 code state rather than to later submission-only documentation commits.

## CI build

Workflow:

`Android standalone APK`

Run:

`36329825769`

Run URL:

`https://github.com/uknwplayer/ground-relay/actions/runs/36329825769`

Result:

**PASS**

Artifact:

`ground-relay-standalone-apk`

Artifact ID:

`10935757058`

Artifact created:

`2026-09-27T15:49:26Z`

Artifact expiry reported by GitHub:

`2026-12-26T15:30:48Z`

## Integrity

GitHub artifact ZIP digest:

`sha256:5d273aa2b8c56f4775c797f3a16b257cc4dc3c468d43c3303382e43426b565b2`

Downloaded ZIP SHA-256:

`5d273aa2b8c56f4775c797f3a16b257cc4dc3c468d43c3303382e43426b565b2`

The downloaded ZIP digest exactly matches the digest published by GitHub Actions.

ZIP integrity test:

**PASS — no errors detected**

Contained APK:

`app-release.apk`

APK size:

`114,098,915` bytes

APK SHA-256:

`cc4074f1dde807f9396e3aaf1a8bdb17d45cbc3bb568fd2ebad2bdfc58e09de4`

## Runtime configuration inspection

Expected worker Gateway base URL:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

Raw APK inspection found the exact expected URL **once** in the packaged APK.

This proves the release artifact contains the intended hosted Gateway configuration used by the M8 physical proof.

## Controlled devnet identity

Program ID:

`6v2peeoZVj2AXfczVLqyMUTHYt3XQPqAxCktpTwjUZap`

ProgramData:

`GKggYJQfNJsZn2EqtuasShdKVPKxWUNbv3zg61UPjJgR`

Current release/proof scope is **Solana devnet only**. This record does not authorize mainnet deployment.

## Fresh-device acceptance gate

Before this APK is called the final submission candidate, perform one clean physical-device verification:

1. remove/clear the prior Ground Relay installation so persisted mobile state cannot satisfy the test;
2. install this exact APK;
3. open the app successfully;
4. connect an MWA-compatible wallet;
5. refresh the Gateway inbox;
6. open the completed M8 proof task and verify the app can reconcile its authoritative `PAID` state;
7. close and reopen the app and verify safe context restoration;
8. do **not** claim, submit, accept, or pay the historical task again.

The fresh-device step is intentionally human-controlled because Android installation, wallet authorization, and physical app launch cannot be established by CI alone.

## Reviewer verification

See:

`docs/reviewer-verification.md`
