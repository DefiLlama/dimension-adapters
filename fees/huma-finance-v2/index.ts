import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// Huma 2.0 permissionless pool: https://docs.huma.finance/ecosystem-resources/smart-contracts
const HUMA_PERMISSIONLESS = "HumaXepHnjaRCpjYTokxY4UtaJcmx41prQ8cxGmFC5fn";

// sha256("event:ModeAssetsRefreshedEvent")[:8]
const MODE_ASSETS_REFRESHED_HEX = "d20b16142313504a";

// ModeAssetsRefreshedEvent after 8-byte discriminator (Borsh LE):
//   [8:40]  mode_config (pubkey)
//   [40:48] yield_bps (f64)
//   [48:56] old_assets_refreshed_at (u64)
//   [56:72] old_assets (u128) — or u64 in legacy 72-byte events
//   [72:88] new_assets (u128) — or u64 at [64:72] in legacy events
// Dune varbinary_substring is 1-indexed.
//
// Program upgrade changed asset fields from u64 (72-byte events) to u128 (88-byte).
// Only `refresh_pool_assets` emits this event; deposit/withdraw txs do not.

const assetDeltaUsd = `
  CASE
    WHEN varbinary_length(event_data) >= 88 THEN (
      CAST(varbinary_to_uint256(varbinary_reverse(varbinary_substring(event_data, 73, 16))) AS DOUBLE)
      - CAST(varbinary_to_uint256(varbinary_reverse(varbinary_substring(event_data, 57, 16))) AS DOUBLE)
    ) / 1e6
    WHEN varbinary_length(event_data) >= 72 THEN (
      CAST(varbinary_to_bigint(varbinary_reverse(varbinary_substring(event_data, 65, 8))) AS DOUBLE)
      - CAST(varbinary_to_bigint(varbinary_reverse(varbinary_substring(event_data, 57, 8))) AS DOUBLE)
    ) / 1e6
    ELSE 0
  END
`;

const fetch = async (options: FetchOptions) => {
  const data: any[] = await queryDuneSql(options, `
    WITH raw AS (
      SELECT
        -- Trino arrays are 1-indexed; [3] = base64 payload of 'Program data: <b64>'
        try(from_base64(split(log_msg.logs, ' ')[3])) AS event_data
      FROM solana.instruction_calls ic
      CROSS JOIN UNNEST(ic.log_messages) WITH ORDINALITY AS log_msg(logs, idx)
      WHERE ic.executing_account = '${HUMA_PERMISSIONLESS}'
        AND TIME_RANGE
        AND ic.tx_success = true
        AND log_msg.logs LIKE 'Program data:%'
    ),
    decoded AS (
      SELECT event_data
      FROM raw
      WHERE event_data IS NOT NULL
        AND varbinary_substring(event_data, 1, 8) = from_hex('${MODE_ASSETS_REFRESHED_HEX}')
        AND varbinary_length(event_data) >= 72
    )
    SELECT COALESCE(SUM(${assetDeltaUsd}), 0) AS lp_yield_usd
    FROM decoded
  `);

  const lpYield = Number(data[0]?.lp_yield_usd || 0);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Same dollar flow on both sides: PayFi yield distributed into LP mode balances
  dailyFees.addUSDValue(lpYield, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(lpYield, METRIC.ASSETS_YIELDS);

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Yield credited on-chain to Huma 2.0 LP token balances (PST/mPST), measured from ModeAssetsRefreshedEvent deltas emitted by the refresh_pool_assets instruction. Each delta is new_assets minus old_assets after scheduled yield accrual (net of credit losses). Deposits and withdrawals do not emit this event.",
  Revenue:
    "Zero — the permissionless pool has no protocol fee configured; all PayFi yield flows to LPs.",
  ProtocolRevenue:
    "Zero, same as Revenue.",
  SupplySideRevenue:
    "Same as Fees; all yield accrues to PST/mPST holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]:
      "Yield credited to PST/mPST LP balances.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]:
      "Same yield, accruing to PST/mPST holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 1, // Dune adapters must be v1 (AGENTS.md)
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-04-09",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  // Credit losses can make daily net ModeAssetsRefreshed deltas negative
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
