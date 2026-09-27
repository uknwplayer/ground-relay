# M8 Physical Proof — Verified Android Handoff

**UTC date:** 2026-09-27  
**Branch:** `m8-product-hardening`  
**Status:** ready for physical Android execution

This addendum supersedes the APK-pending note in `2026-09-27-m8-physical-ready.md`.

## Android build proof

- workflow: `Android standalone APK`
- run: `36303092998` — PASS
- branch commit built: `621e3819eb69a1641ab77ed735150823c6d6c95d`
- Gradle release build: PASS
- artifact upload: PASS
- GitHub artifact ID: `10926696152`
- GitHub artifact ZIP SHA-256: `b923561c185a17c8035fa16590525fe2bf03127f42b389354e1832b3776aaa92`
- extracted APK SHA-256: `b99d60a1d581f006d2744ffa6de55189ee24c86ec1563f666ee9a48e7745dae9`
- extracted APK size: `114,099,847` bytes

The APK payload was independently inspected after download. Its bundled Android JavaScript contains exactly one occurrence of:

`https://ground-relay-agent-gateway-m8.onrender.com/v1`

Therefore this is the hosted-Gateway build required for the fresh physical M8 proof, not the earlier offline/local-Gateway artifact.

## Hosted Gateway proof

- Render service: `ground-relay-agent-gateway-m8`
- public URL: `https://ground-relay-agent-gateway-m8.onrender.com`
- durable seed commit deployed: `a78c6e9e44b75a000b86d03935af941b63204d52`
- Render deploy: `dep-dascf6o473hc73fmp0b0` — live
- listener: `0.0.0.0:10000`
- external smoke run: `36303711875` — PASS

External smoke confirmed:

- `/health` returns the expected Ground Relay service identity;
- `/v1/tasks` contains `m8-physical-2026-09-27-v1`;
- status is `open`;
- task PDA is `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`;
- worker projection does not expose `callbackUrl`.

## Fresh task proof

- task: `m8-physical-2026-09-27-v1`
- task PDA: `BT5sKaBENnaJx1FPmYTtLC7XEojDnVvXpR455cu1Np5y`
- vault PDA: `F8vdvACWiaFCmh95HLEJGKVbZsXZ9Wvs5cd33qzbZysV`
- reward: `1,000,000` atomic devnet WSOL (`0.001 WSOL`)
- initial status: `OPEN`
- initial vault amount: `1,000,000`
- creation/binding run: `36303227689` — PASS
- `post_task` signature: `5aVsJ4LZ8aLAHq8z7aFPhGFPuHyji5XHXSPUwTyWcDHRAAej9R81JGzw3hsidwHenesaTC5GypKP1hoB5DJfCSX2`

## Human handoff

The next unavoidable action is physical device operation:

1. install the verified APK;
2. use the same Solflare worker wallet used in the prior physical proof where possible;
3. open/refresh the inbox and select `M8 physical proof — capture a current scene`;
4. claim and confirm `CLAIMED`;
5. force-close and reopen the app, verifying restored `CLAIMED` state without transaction replay;
6. capture a current photo and submit it;
7. stop once authoritative status is `DELIVERED` and return control to the agent.

Do not release payment before the prepared poster-acceptance step is run after `DELIVERED`.
