---
name: adapter-author
description: Helps coding agents author and fix DefiLlama dimension adapters in this repo. Use for fees, revenue, volume, aggregator volume, bridge-aggregator volume, derivatives, options, open interest, incentives, active/new users, normalized volume, and NFT volume. Also gates out requests that belong in `DefiLlama-Adapters` (TVL) or `defillama-server` (listing metadata).
---

# Adapter Author

A repo-native authoring guide for `dimension-adapters`. Use it for new adapters, narrow fixes to existing ones, and intake gating.

## Repo-fit gate (do this first)

Before editing any file, decide whether the request belongs here. `dimension-adapters` covers time-windowed dashboard metrics in `whitelistedDimensionKeys` (see `adapters/types.ts`).

Stop and route elsewhere when:

- TVL of any kind -> `DefiLlama/DefiLlama-Adapters`.
- Listing metadata only (logo, category, description, socials, treasury, audits) -> `DefiLlama/defillama-server`.
- Metric not in `whitelistedDimensionKeys`, or category folder is not core-wired (e.g. `aggregator-options`) -> ask maintainers.

## Intake

Open with one broad question:

> Tell me about the protocol, what you want changed on DefiLlama, which dimension you think it belongs to, and any chains, contracts, events, APIs, subgraphs, dashboards, docs, fee/revenue rules, methodology notes, start dates, or validation expectations you already have.

Then grill-style: one unresolved question at a time, recommend an answer when useful, prefer reading the repo over asking. Lock each answer before dependent decisions. See `references/intake.md` for what to confirm.

## Workflow

1. Read `GUIDELINES.md`, `pull_request_template.md`, the relevant category `GUIDELINES.md`, and `adapters/types.ts`.
2. Apply the repo-fit gate. If it fails, stop and route.
3. Classify the category and helper/factory choice from `references/patterns.md`.
4. Inspect representative adapters and the matching helper or factory before writing code. Reuse helpers and factories when the protocol shape matches - that is the default, not an option.
5. Give a short understanding checkpoint: target path, primary metric and any secondary metrics, source data and time-window behavior, methodology, helper/factory choice, unknowns, validation commands.
6. Edit only the adapter files needed for the chosen pattern.
7. Validate per `references/validation.md` and interpret the output.
8. Draft PR notes from confirmed facts only. Leave unknowns as `TODO` or open questions.

## Existing-adapter fixes

Preserve the current pattern unless there is a clear reason to change it. Make the smallest correctness fix, run that adapter's test, and revisit methodology only if the change affects what is counted.

## Stop and ask

Before coding, when ambiguous: repo fit, category, primary metric, source of truth, fee/revenue attribution, taker-vs-maker volume, bridge-vs-swap volume, notional-vs-premium, OI timing, chain coverage, start date, helper fit, double counting.

Always stop for `aggregator-options` (folder exists but is not in `AdapterType`, CI roots, or `factory/registry.ts`) and for vague "derivatives adapter" requests until you know whether they mean `dexs/`, `aggregator-derivatives/`, or `open-interest/`.

## Forbidden

- No new project-specific npm dependencies.
- No edits to `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.github/*`, `adapters/types.ts`, `cli/buildModules.ts`, `factory/registry.ts`, or broad shared helpers/factories unless the request explicitly requires core wiring.
- No invented methodology, links, splits, recipients, start dates, audits, logos, or token IDs.
- No protocol API totals when on-chain logs, contract calls, subgraphs, or query engines are practical.
- No hiding unclear fee/revenue attribution behind `skipBreakdownValidation`.
- No pushing or opening a PR unless the user explicitly asks.

## Behavior examples

- Good: stop a TVL request before coding and point to `DefiLlama-Adapters`.
- Good: for a perp request, decide between `dexs/`, `aggregator-derivatives/`, and `open-interest/` before editing.
- Good: use `factory/uniV2.ts` or `factory/uniV3.ts` for a standard Uniswap-style DEX.
- Bad: add a file under a factory-backed category without checking `factory/registry.ts`.
- Bad: count both maker and taker volume for perps.
- Bad: add `aggregator-options/<protocol>` without resolving wiring.
