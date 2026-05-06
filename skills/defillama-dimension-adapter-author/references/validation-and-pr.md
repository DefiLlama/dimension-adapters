# Validation and PR Preparation

Use this reference after implementing or inspecting a dimension adapter.

## Local validation

Run the repo-native adapter test:

```bash
pnpm test <adapter-type> <adapter>
pnpm test <adapter-type> <adapter> <YYYY-MM-DD>
```

Examples:

```bash
pnpm test fees bitcoin
pnpm test fees bitcoin 2025-10-10
pnpm test dexs cubic 2026-05-04
```

For file-backed adapters, use the folder and adapter key. For factory-backed adapters, use the adapter type and protocol key that `factory/registry.ts` exposes.

For labeled fee adapters, run:

```bash
DEBUG_BREAKDOWN_FEES=1 pnpm test fees <adapter>
```

Review the fee breakdown table, labels, and methodology. If a labeled `dailyFees` balance exists, `runAdapter.ts` expects at least one of `dailyRevenue`, `dailySupplySideRevenue`, or `dailyProtocolRevenue` unless `skipBreakdownValidation` is justified.

## Maintainer-style checks

Run:

```bash
pnpm run ts-check
pnpm run ts-check-cli
```

Run:

```bash
pnpm run build
```

when touching factories, `users/`, normalized-volume or NFT-volume factory paths, adapter type wiring, build logic, or registry-affecting code.

Run `git diff --check` before PR-ready status.

## Interpret test output

Do more than report "it passed." Review:

- metric keys are supported by `adapters/types.ts`
- values are not NaN
- values are not negative unless `allowNegativeValue` is justified
- values are plausible and not unexpectedly huge
- output chain labels are lowercase repo chain IDs
- start date and historical windows behave as expected
- `pullHourly` output represents the intended 24-hour sum of hourly slices
- API-backed data is not stale and has a clear `runAtCurrTime` reason if needed
- new adapters include `methodology` explaining what each counted dimension includes
- labeled balances document every `.add(..., label)` value in `breakdownMethodology`
- secondary metrics do not move the adapter into a different primary category

If a validation command fails, fix the adapter or stop with the exact blocker.

## What CI does and does not cover

PR CI runs `pnpm test` only for changed roots accepted by `.github/workflows/getFileList.js`, then comments output. That root list excludes `active-users`, `new-users`, `normalized-volume`, `nft-volume`, and `aggregator-options`, so manual testing is required for those paths.

PR CI also runs `pnpm run ts-check` and `pnpm run ts-check-cli`.

Passing CI does not prove source quality, economic classification, chain completeness, wash-trading filtering, double-counting prevention, or PR metadata correctness.

## Changed-file check

Before PR-ready status, check that normal adapter work did not touch:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `.github/*`
- `adapters/types.ts`
- `cli/buildModules.ts`
- `factory/registry.ts`
- broad shared helpers/factories unrelated to the task

If shared files changed, explain why, describe blast radius, and run broader validation.

## PR body support

For a new protocol listing, read `pull_request_template.md` and gather confirmed facts:

- name to show on DefiLlama
- Twitter/X link
- audit links, if any
- website
- logo, if relevant
- current TVL, if relevant to listing metadata
- treasury addresses, if any
- chain or chains
- Coingecko and CoinMarketCap IDs, if listed
- short description
- token address and ticker, if any
- category
- oracle providers and proof, if relevant
- forkedFrom
- dimension methodology
- GitHub org/user, if open source
- referral program answer

For adapter-only fixes, chain additions, source replacements, or methodology corrections, write concise reason/details instead of inventing listing metadata.

## Ready-to-open summary

When code and metadata are ready, give the user:

- files changed
- primary adapter category and any secondary metrics
- helper/factory or custom pattern used
- methodology summary
- validation commands and results
- important warnings, assumptions, or remaining `TODO`s

Stop at ready-to-open by default. Only push, open, or submit a PR if the user explicitly asks.
