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
//   [56:64] old_assets (u64)
//   [64:72] new_assets (u64)
// Dune varbinary_substring is 1-indexed → old_assets @ 57, new_assets @ 65
//
// Yield-only (validated): 2026-07-07 TVL +$5.9M, this metric ~$45k (not deposit-contaminated).

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
    SELECT
      COALESCE(SUM(
        CAST(varbinary_to_bigint(varbinary_reverse(varbinary_substring(event_data, 65, 8))) AS DOUBLE)
        - CAST(varbinary_to_bigint(varbinary_reverse(varbinary_substring(event_data, 57, 8))) AS DOUBLE)
      ), 0) / 1e6 AS lp_yield_usd
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
    "Yield credited on-chain to Huma 2.0 LP token balances (PST/mPST), measured from ModeAssetsRefreshedEvent asset deltas. Net of credit losses; excludes deposit and withdrawal principal.",
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
  version: 1, // Dune adapters must be v1 (GUIDELINES.md)
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
