# M8 callback / SSRF hardening proof

**Date:** 2026-09-26  
**Branch:** `m8-product-hardening`  
**Scope:** Agent Gateway resume-callback transport only. No mainnet action.

## Threat addressed

The previous callback policy required HTTPS but still allowed an attacker-controlled callback hostname to resolve to a private/local address, or a public endpoint to redirect into a private/local address. Because the transport delegated redirects and DNS resolution to the default fetch path, this left an SSRF and DNS-rebinding surface around agent resume delivery.

## TDD proof

RED commit:

`d65ed8d10ff4e10f0cb5a338a86d7333d138970a`

Gateway run `36271599500` failed in `npm test` because the test suite required the new `resolveCallbackTarget` behavior before it existed.

Primary GREEN implementation:

`7208242c5b6a30c9e5504eadb5d45f97618f59b4`

The first full-suite run exposed a legitimate regression in the seeded demo: its explicit development callback used `http://127.0.0.1`, but the transport wrapper did not propagate the already-enabled loopback-development flag.

Root-cause correction:

`47c4cf6220828e652761e5f3c9414f2f68f49aeb`

Final Gateway verification:

- run: `36272154186`
- `npm ci`: PASS
- `npm test`: PASS
- `npm run demo`: PASS
- conclusion: SUCCESS

## Hardened callback policy

The Gateway now:

- rejects callback URLs containing embedded credentials;
- requires HTTPS by default;
- permits HTTP only for explicit loopback development/test mode;
- rejects direct loopback, private, link-local, documentation/test, multicast, reserved, and other non-public IPv4/IPv6 destinations covered by the policy;
- resolves callback hostnames before connecting and rejects any DNS answer that is non-public;
- pins the outbound connection to the validated DNS answer while preserving the original hostname for TLS SNI/certificate verification, preventing a second DNS resolution from silently changing the target;
- does not rely on automatic redirect following;
- revalidates every redirect target before a second connection;
- bounds redirect chains;
- classifies callback-policy violations as terminal failures while preserving retryable classification for DNS/network/timeout failures;
- preserves the existing stable resume `Idempotency-Key` and event identity semantics.

## Development loopback exception

The seeded M7 demo intentionally hosts its mock agent receiver on `127.0.0.1`. The final correction passes `allowLoopbackHttp: true` only in that explicit development path. Production/default Gateway configuration remains fail-closed unless `GROUND_RELAY_ALLOW_LOOPBACK_HTTP=1` is deliberately enabled.

## Security-review status

This closes the callback/SSRF portion of the M8 security review. It does **not** close M8 security review as a whole. Remaining security work includes the Anchor account/authority review, payment-invariant review, generic payout-account derivation proof, and terminal task/vault rent-reclamation policy.

## Related build evidence

The prior evidence-privacy mobile commit also completed its Android verification after that checkpoint was written:

- Android standalone APK run `36270786479`: SUCCESS

That Android run applies to the evidence-privacy mobile commit, not to this Gateway-only SSRF change.
