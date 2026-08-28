# Validation

Use after implementing or inspecting an adapter.

## Adapter test

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

File-backed: use the folder and adapter key. Factory-backed: use the type and the protocol key registered in `factory/registry.ts`.

For labeled fee adapters:

```bash
DEBUG_BREAKDOWN_FEES=1 pnpm test fees <adapter>
```

Review the breakdown table, labels, and methodology. When a labeled `dailyFees` balance is returned, `runAdapter.ts` expects at least one of `dailyRevenue`, `dailySupplySideRevenue`, or `dailyProtocolRevenue` unless `skipBreakdownValidation` is justified.

## Type and build checks

```bash
pnpm run ts-check
pnpm run ts-check-cli
```

Run `pnpm run build` when touching factories, `users/`, normalized-volume or NFT-volume factory paths, adapter-type wiring, build logic, or registry-affecting code.

Run `git diff --check` before declaring ready.

## Interpreting test output

Do not stop at "it passed". Verify:

- metric keys are in `adapters/types.ts`
- no NaN; no negatives unless `allowNegativeValue` is justified
- values are plausible
- chain labels are lowercase repo chain ids
- `start` and historical windows behave as expected
- `pullHourly` output sums hourly slices over 24h as intended
- API-backed data is fresh; `runAtCurrTime` has a clear reason
- new adapters include `methodology` for every counted dimension
- every `.add(..., label)` value is documented in `breakdownMethodology`
- secondary metrics do not pull the adapter into a different primary category

If a check fails, fix it or stop with the exact blocker.

## What CI covers

PR CI:

- runs `pnpm test` only for changed roots accepted by `.github/workflows/getFileList.js`. The accepted roots exclude `active-users`, `new-users`, `normalized-volume`, `nft-volume`, and `aggregator-options` - test those by hand.
- runs `pnpm run ts-check` and `pnpm run ts-check-cli`.

CI does not cover source quality, economic classification, chain completeness, wash-trading filtering, double counting, or PR metadata correctness.

## Changed-file gate

Normal adapter work should not touch:

- `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `.github/*`
- `adapters/types.ts`, `cli/buildModules.ts`, `factory/registry.ts`
- broad shared helpers/factories unrelated to the task

If any of these changed, explain why and run broader validation.

## PR body

For new listings, follow `pull_request_template.md` and only fill confirmed facts. For adapter-only fixes, chain additions, source replacements, or methodology corrections, write a concise reason and details - do not invent listing fields.

## Ready-to-open summary

When the work is ready, hand the user:

- files changed
- primary category and any secondary metrics
- helper/factory or custom pattern used
- methodology summary
- validation commands and their results
- warnings, assumptions, remaining `TODO`s

Stop at ready-to-open. Push or open a PR only when the user explicitly asks.
