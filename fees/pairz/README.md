# Pairz — draft fees submission

Website: https://pairz.fun
Twitter: https://x.com/PairzFun
Docs: https://docs.pairz.fun
Chain: Solana
Requested category: Launchpad
Protocol token: `3URpNcV9wAPjwMAyuBsPjwwkGN9wFJuwcRs3RMbdpair`

This is a **draft, not a complete or validated protocol listing**. Do not merge until the items below are resolved.

## Implemented scope

The query attributes LaunchLab pools by Pairz platform config `3om3BermKeuUVXEbtktzkiuPh4mY5fn1c8cNh1TR3DUj`, not mint suffix, transaction signer, or all deposits into an operator wallet. It reads actual platform/protocol/creator fee fields and returns raw integer strings by quote mint; USDC and stock quotes must not be priced as SOL. Successful initialization variants are deduplicated before joining trades. Daily fees equal platform revenue plus the Raydium and creator shares. Platform registration on 7 September 2026 defines the start of this product's history.

Platform registration: https://solscan.io/tx/5W1AnfdEMHBAoYPkAeMMoPcsnh8VjzRjDzFeWjgzRoLdVuDPj1JG4cgS4ri3mJuoR4kzEgMzx78FxfVN9u2VV2Yb

Example USDC launch: `bKvdbmnAtMyiXpqB1ZKW2fJJf9hzw1yRzaRqAMFpair`.
Example AAPLx launch: `74sAvxkRQH1iUKR7t321rjqfuntsDf2irqapfGMGpair`.
These are launch evidence, not evidence of fee-generating trading.

Raydium protocol fees overlap the existing LaunchLab listing, so the adapter is marked doublecounted. Maintainers should confirm whether to display gross launchpad fees or only the Pairz platform slice.

## Required before merge

- Execute the Dune query and validate its schema and successful-event coverage, including the token-2022 initialization variant; compare results with actual finalized trade receipts. Local mocked tests are not a live query run.
- Check a no-trade day and at least one nonzero-fee day; validate both buys and sells and mixed quote assets. Confirm DeFiLlama price coverage for stock quote mints.
- Add migrated CPMM fees; this draft throws when it detects a migration rather than publishing incomplete totals.
- Resolve historical Pump creator-fee accounting, including documented cost deductions and distributions. Do not extrapolate today's LaunchLab policy backward or claim this is full Pairz history.
- Add actual settled PAIRZ buyback/holder revenue with attributable funding and confirmed settlement evidence. An allocation or a wallet transfer alone is not a completed buyback. Do not assign 100% of accrual to completed holder revenue.
- Account for holder transfer taxes if enabled and actually charged; keep rewards to launched-coin holders distinct from PAIRZ governance-token holder revenue.
- Confirm treasury/holder attribution and coverage boundaries with maintainers before marking ready.

No TVL or volume is claimed by this draft. LP balances, token market capitalization, launch deposits, account rent, operational funding and reimbursements are not substituted for fee revenue.

## Validation

Run with a privately configured Dune credential:

```sh
npm test fees pairz 2026-09-08
```

`DUNE_API_KEYS` is the existing upstream helper's environment variable. Never commit credentials. Dune-backed adapters use version 1 per repository rules. Query errors propagate rather than becoming zero revenue.
