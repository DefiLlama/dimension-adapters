# o1 Launchpad fees

Version 2, hourly, covering all six Base suites and five Robinhood suites from the original July 2026 start. The adapter has no Dune runtime dependency.

The deployment registry and accounting were checked against the protocol's [launch SQL](https://github.com/o1exchange/o1-launch/blob/756a75cef544369ac57f0092898a64300b168ab9/analytics/dune/sql/01_launches.sql), [trade SQL](https://github.com/o1exchange/o1-launch/blob/756a75cef544369ac57f0092898a64300b168ab9/analytics/dune/sql/02_trade_facts.sql), [fee SQL](https://github.com/o1exchange/o1-launch/blob/756a75cef544369ac57f0092898a64300b168ab9/analytics/dune/sql/14_daily_fees_and_revenue.sql), and [minimal V4 integration documentation](https://github.com/o1exchange/o1-launch/blob/756a75cef544369ac57f0092898a64300b168ab9/docs/LAUNCHPAD_V4_MINIMAL_PLATFORM_INTEGRATION.md).

- `Trade`, escrow credits and component credits describe the same swap fee. Their raw amounts must reconcile; they are counted once. Withdrawals of already credited fees are excluded.
- Historical credits follow creator, optional referrer, then platform order, with zero credits omitted. Minimal V4 uses component IDs, including creator rights transfers and protocol-owned fixed components with distinct recipient wallets.
- Ordinary launch payments precede `Launched`. Atomic launch payments follow it and are bounded by the pool's `LaunchBuyExecuted` event. Fee configuration history verifies the expected payment.
- Crypto returns token balances for SDK pricing. Stocks use historical quote-registration/tick events and the supply at each price-bearing event under the documented $4,000 opening-cap convention. This is an operator reference price. Missing references require an available historical DefiLlama price; missing data is an error.
- Legacy launch-token-denominated swap fees retain the original quote-only exclusion. Their raw units are never treated as quote units. The configured Crypto quote list includes the eight Base crypto wrappers added in September 2026; future quote additions require classification updates.
- The SDK start block is excluded and the end block included, so adjacent hours are disjoint. Identical repeated logs are deduplicated; conflicting copies or inconsistent fee attribution fail the run.

The first RPC run needs historical factory metadata. SDK RPC caching amortizes subsequent runs; a configured DefiLlama indexer can serve these requests directly. Historical `PoolRegistered` queries are bounded to the creation interval of pools trading in the requested window. Public RPC range limits and throttling can make a cold backfill slow.

Validation commands from the repository root:

```sh
node --require ts-node/register/transpile-only --test fees/o1-launchpad/accounting.test.ts
npm run ts-check
npm run ts-check-cli
```

On 2026-09-05, public-RPC validation covered the following immutable block windows. A test-only provider supplied throttling, smaller RPC subranges and retries after unthrottled public endpoints returned errors; the adapter itself uses standard `options.getLogs`. Production indexer performance was not measured. Trade counts include excluded legacy non-quote fees; included swaps are the quote-denominated subset. Launch counts are nonzero paid launches.

| Chain / suite | Blocks (inclusive) | Trades | Included swaps | Paid launches |
| --- | --- | ---: | ---: | ---: |
| Base block-v1 | 50866927–50910126 | 99 | 42 | 0 |
| Base timestamp-v2 | 50866927–50910126 | 19842 | 19842 | 0 |
| Base RWA timestamp-v3 | 50866927–50910126 | 17 | 17 | 0 |
| Base RWA timestamp-v4 | 50866927–50910126 | 5084 | 5084 | 0 |
| Base minimal V4 | 50866927–50910126 | 28284 | 28284 | 287 |
| Base minimal V4 pre-atomic | 50505676–50579675 | 50 | 50 | 19 |
| Robinhood block-v1 | 2131131–2231130 | 2 | 1 | 0 |
| Robinhood block-v2 | 4415287–4515286 | 123 | 58 | 0 |
| Robinhood timestamp-v3 | 54248392–55104082 | 40 | 40 | 0 |
| Robinhood RWA timestamp-v4 | 54248392–55104082 | 30256 | 30256 | 0 |
| Robinhood minimal V4 | 54248392–55104082 | 57426 | 57426 | 544 |

For 2026-09-04 12:00 through 2026-09-05 12:00 UTC, the direct 24-hour run and 24 independent hourly runs reconcile exactly for raw fees, protocol revenue, creator shares and referrer shares, grouped by chain, suite, market, currency and fee source. Stock USD balances also reconcile within floating-point tolerance. Each included trade satisfies `fees = protocol + creator + referrer` in integer units. This is sampled historical validation, not an exhaustive replay of every day or a Dune USD comparison.

For an explicit one-hour run, call `runAdapter` with `runWindowInSeconds: 3600`. The current CLI's single-timestamp path displays one hour but omits that argument and executes the default 24-hour window; its plain-date hourly path does pass the explicit window size.
