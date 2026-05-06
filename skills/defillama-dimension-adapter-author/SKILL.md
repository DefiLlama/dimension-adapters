---
name: defillama-dimension-adapter-author
description: Validates whether a DefiLlama request belongs in dimension-adapters, then helps coding agents create and validate dimension adapters when it does. Use when a user wants to add or fix DefiLlama fees, revenue, volume, aggregator, bridge aggregator, derivatives, options, open-interest, incentives, active-user, new-user, normalized-volume, or NFT-volume adapters, choose repo-native helpers or factories, validate `pnpm test`, prepare PR metadata, or decide whether work belongs in DefiLlama-Adapters or defillama-server instead.
---

# DefiLlama Dimension Adapter Author

Use this skill to help a protocol developer add or inspect a DefiLlama dimension adapter with high-quality repo-native judgment. Optimize for new adapters, but support narrow fixes to existing adapters when the user asks.

## First move

Start with one broad intake question:

```text
Tell me about the protocol, what you want added or changed on DefiLlama, which dimension you think it belongs to, and any chains, contracts, events, APIs, subgraphs, dashboards, docs, fee/revenue rules, volume methodology, start dates, or validation notes you already have.
```

After that answer, work grill-style:

- Ask one unresolved question at a time.
- Provide your recommended answer when useful.
- If a question can be answered by inspecting this repo or existing adapters, inspect instead of asking.
- Lock each important answer before moving to dependent decisions.

## Required repository-fit gate

Before editing files, decide whether the request belongs in this repository.

Use `dimension-adapters` for time-windowed dashboard metrics such as fees, revenue, DEX volume, aggregator volume, bridge aggregator volume, options, open interest, incentives, active users, new users, normalized volume, and NFT volume. If the request does not fit, stop before editing and suggest the likely DefiLlama repo or path to investigate:

- TVL: use `DefiLlama/DefiLlama-Adapters` according to `pull_request_template.md`.
- listing metadata only: use `DefiLlama/defillama-server` according to `pull_request_template.md`.
- unsupported or ambiguous metrics: stop and ask for maintainer/user clarification.

## Workflow

1. Read `README.md`, `GUIDELINES.md`, `pull_request_template.md`, `package.json`, and the relevant category `GUIDELINES.md`.
2. Validate that the request belongs in this repository. If it does not, stop and suggest the likely DefiLlama repo or path.
3. If protocol facts are incomplete, read `references/repo-fit-and-intake.md` and continue the intake.
4. Classify the primary dashboard/category with `references/adapter-patterns.md`, then inspect matching examples, helpers, factories, and registry wiring before coding.
5. Reuse existing helpers or factories whenever the protocol shape matches. Helper/factory reuse is non-negotiable for standard patterns.
6. Before editing, give an understanding checkpoint:
   - target adapter type and path or factory file
   - primary dimension and any secondary metrics
   - source data and time-window behavior
   - fee/revenue/volume/OI semantics
   - methodology and breakdownMethodology plan
   - helper or factory choice
   - unknowns and stop/ask items
   - validation commands
7. Edit only the adapter-related files needed for the chosen pattern.
8. Run the maintainer-style validation from `references/validation-and-pr.md`.
9. Interpret the output: values are non-NaN, non-negative unless justified, plausible, correctly windowed, and economically classified.
10. Prepare PR notes from confirmed facts only. Leave missing facts as questions or `TODO`, not guesses.

## Existing adapter fixes

For existing adapters, preserve the current pattern unless there is a clear reason to change it. Inspect the current adapter first, make the smallest correctness fix, run the adapter test, and revisit methodology only if the requested change affects what is counted.

## Stop and ask

Stop before coding when repository fit, adapter category, primary metric, source of truth, fee/revenue attribution, taker-vs-maker volume, bridge-vs-swap volume, notional-vs-premium volume, OI timing, chain coverage, start date, helper fit, or double-counting is ambiguous.

Stop for `aggregator-options` unless current repo wiring or maintainer guidance clearly supports it. The folder exists, but it is not core-wired through `AdapterType`, CI roots, or factory registry.

Stop for "derivatives adapter" until you clarify whether it means protocol perps volume under `dexs/`, routed derivatives volume under `aggregator-derivatives/`, or open-interest-only work under `open-interest/`.

## Forbidden actions

- Do not add project-specific npm dependencies.
- Do not edit `package.json`, `package-lock.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
- Do not edit `.github/*`, `adapters/types.ts`, `cli/buildModules.ts`, `factory/registry.ts`, or large shared helpers/factories unless the request explicitly requires core wiring changes.
- Do not invent methodology, public links, category, audits, logo, token IDs, fee splits, revenue recipients, start dates, or social links.
- Do not use protocol APIs that return opaque totals when on-chain logs, calls, subgraphs, or query-engine reconstruction are practical.
- Do not hide unclear fee/revenue attribution with `skipBreakdownValidation`.
- Do not push, open, or submit a PR unless the user explicitly asks.

## Behavior examples

Good: stop a TVL request and suggest `DefiLlama-Adapters` before coding.

Good: classify a perp request as `dexs/`, `aggregator-derivatives/`, or `open-interest/` before editing.

Good: use `helpers/uniswap.ts`, `factory/uniV2.ts`, or `factory/uniV3.ts` for a standard Uniswap-style DEX.

Bad: create a normal file in a factory-backed category without checking `factory/registry.ts`.

Bad: count both maker and taker volume for perps.

Bad: add `aggregator-options/<protocol>` without resolving repo wiring first.
