import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { assertJupiterStatsPublished, getJupiterStatsRevenue } from "../../helpers/jupiter-stats";

// Jupiter Gacha settles through Collector Crypt's shared wallet; jupiter-* memos
// isolate Jupiter activity. https://solscan.io/account/GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3
const GACHA_ADDRESS = "GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3";
// Phygitals settles Jupiter pack purchases through its own wallet, using the same jupiter- memo
// convention without the :action suffix.
// https://solscan.io/account/62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS
const PHYGITALS_ADDRESS = "62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS";
// Canonical USDC mint on Solana.
const USDC_MINT = ADDRESSES.solana.USDC;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const timeRange = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const query = `
    WITH flows AS (
      SELECT
        txn_id,
        from_address,
        to_address,
        amount
      FROM solana.assets.transfers
      WHERE mint = '${USDC_MINT}'
        AND (
          to_address = '${GACHA_ADDRESS}'
          OR from_address = '${GACHA_ADDRESS}'
          OR to_address = '${PHYGITALS_ADDRESS}'
        )
        AND ${timeRange}
    ),
    memos AS (
      SELECT
        txn_id,
        REGEXP_SUBSTR(
          array_join(log_messages, '||'),
          'Memo \\\\(len [0-9]+\\\\): "([^"]+)"',
          1, 1, 'e', 1
        ) AS memo
      FROM solana.raw.transactions
      WHERE ${timeRange}
        AND txn_id IN (SELECT txn_id FROM flows)
    ),
    events AS (
      SELECT
        f.from_address,
        f.to_address,
        f.amount,
        REGEXP_SUBSTR(m.memo, ':([a-z]+)', 1, 1, 'e', 1) AS action
      FROM flows f
      JOIN memos m ON f.txn_id = m.txn_id
      WHERE m.memo LIKE 'jupiter-%'
    ),
    pack_sales AS (
      SELECT
        amount,
        SUM(amount) AS total
      FROM events
      WHERE action = 'open'
        AND to_address = '${GACHA_ADDRESS}'
      GROUP BY amount
    ),
    phygitals_sales AS (
      SELECT
        COALESCE(SUM(amount), 0) AS total
      FROM events
      WHERE to_address = '${PHYGITALS_ADDRESS}'
    )
    SELECT
      'open' AS action,
      amount,
      total
    FROM pack_sales
    UNION ALL
    SELECT
      'phygitals' AS action,
      NULL AS amount,
      total
    FROM phygitals_sales
  `;

  await assertJupiterStatsPublished(options);
  const rows = await queryAllium(query);

  for (const row of rows) {
    const total = Number(row.total ?? 0);
    if (total) dailyVolume.addUSDValue(total);
  }

  // Pack sales and revenue from Jupiter's stats API. Jupiter's share of pack sales is set by confidential revenue-sharing
  // terms with partners, so it is not derived from onchain flows.
  const api = await getJupiterStatsRevenue(options, {
    gacha: {
      fees: "Gacha Pack Sales",
      revenue: "Gacha Pack Sales To Jupiter",
      supplySide: "Gacha Pack Sales Not Kept By Jupiter",
    },
  });

  return {
    dailyVolume,
    dailyFees: api.dailyFees,
    dailyRevenue: api.dailyRevenue,
    dailyUserFees: api.dailyFees.clone(1),
    dailyProtocolRevenue: api.dailyRevenue.clone(1),
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: api.dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross USDC spent on Jupiter Gacha packs, across Collector Crypt and Phygitals.",
  Fees: "Jupiter Gacha pack sales, from Jupiter's stats API.",
  Revenue: "Jupiter's part of pack sales, from Jupiter's stats API.",
  UserFees: "Jupiter Gacha pack sales, from Jupiter's stats API.",
  ProtocolRevenue: "Jupiter's part of pack sales, all kept by Jupiter.",
  HoldersRevenue: "No holders revenue.",
  SupplySideRevenue: "Pack sales not kept by Jupiter: card buybacks and card value paid to users, and the platforms' part."
};


const apiBreakdown = {
  "Gacha Pack Sales": "Jupiter Gacha pack sales.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2026-06-26",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: apiBreakdown,
    UserFees: apiBreakdown,
    Revenue: { "Gacha Pack Sales To Jupiter": "Jupiter's part of pack sales." },
    ProtocolRevenue: { "Gacha Pack Sales To Jupiter": "Jupiter's part of pack sales." },
    SupplySideRevenue: { "Gacha Pack Sales Not Kept By Jupiter": "Pack sales not kept by Jupiter: card buybacks and card value paid to users, and the platforms' part." },
  },
  allowNegativeValue: true, // revenue is negative on a day when card buybacks paid to users exceed pack sales
  doublecounted: true, // Jupiter Gacha activity overlaps with Collector Crypt
};

export default adapter;
