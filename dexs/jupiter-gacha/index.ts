import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { assertJupiterStatsPublished, getJupiterStatsRevenue } from "../../helpers/jupiter-stats";

// Jupiter Gacha settles through Collector Crypt's shared wallet; jupiter-* memos
// isolate Jupiter activity. https://solscan.io/account/GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3
const GACHA_ADDRESS = "GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3";
// Phygitals settles Jupiter pack purchases through its own wallet, using the same jupiter-
// memo convention. Two differences from Collector Crypt: the memo carries no :action suffix,
// and the buyback leg is not memo-tagged, so only the purchase side is attributable to
// Jupiter. It therefore contributes volume and nothing else.
// https://solscan.io/account/62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS
const PHYGITALS_ADDRESS = "62Q9eeDY3eM8A5CnprBGYMPShdBjAzdpBdr71QHsS8dS";
// Canonical USDC mint on Solana.
const USDC_MINT = ADDRESSES.solana.USDC;
// Listed Jupiter Gacha pack prices; future/non-standard prices remain visible
// under Other Gacha Pack Sales. https://jup.ag/gacha
const GACHA_TIERS = new Set([25, 50, 100, 250, 1000, 2500]);
const REVENUE_LABEL = "Gacha Fees To Jupiter";
const SUPPLY_SIDE_LABEL = "Gacha Fees To Partners";
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
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
          -- the guard stops "Left argument of string is not an array" on non-array log_messages rows
          ARRAY_TO_STRING(IFF(IS_ARRAY(log_messages::variant), log_messages, NULL), '||'),
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
    ),
    buybacks AS (
      SELECT
        COALESCE(SUM(amount), 0) AS total
      FROM events
      WHERE action = 'buyback'
        AND from_address = '${GACHA_ADDRESS}'
    )
    SELECT
      'open' AS action,
      amount,
      total
    FROM pack_sales
    UNION ALL
    SELECT
      'buyback' AS action,
      NULL AS amount,
      total
    FROM buybacks
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
    if (!total) continue;

    if (row.action === "open") {
      const amount = Number(row.amount);
      const label = GACHA_TIERS.has(amount)
        ? `Gacha $${amount} Pack Sales`
        : "Other Gacha Pack Sales";
      dailyVolume.addUSDValue(total);
      dailyFees.addUSDValue(total, label);
    } else if (row.action === "buyback") {
      dailyFees.addUSDValue(-total, "Pack Buyback Spends");
    } else if (row.action === "phygitals") {
      // Volume only: the Phygitals buyback leg carries no jupiter- memo, so there is
      // nothing to net these sales against.
      dailyVolume.addUSDValue(total);
    }
  }

  // Jupiter's share is set by confidential terms with Collector Crypt and Phygitals, so it comes from Jupiter's stats API.
  // The partners keep the rest and pay the card buybacks.
  const { dailyRevenue } = await getJupiterStatsRevenue(options, { gacha: REVENUE_LABEL });
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(await dailyFees.getUSDValue() - await dailyRevenue.getUSDValue(), SUPPLY_SIDE_LABEL);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "USDC spent on Jupiter Gacha packs, on Collector Crypt and Phygitals.",
  Fees: "Pack sales minus the USDC paid to users who sell their cards back.",
  UserFees: "Pack sales minus the USDC paid to users who sell their cards back.",
  Revenue: "Jupiter's share of gacha fees, negative on days when buybacks exceed sales.",
  ProtocolRevenue: "All of Jupiter's share, kept by Jupiter. Not used for JUP buybacks.",
  SupplySideRevenue: "Gacha fees not kept by Jupiter, kept by Collector Crypt and Phygitals.",
};

const financialBreakdown = {
  "Gacha $25 Pack Sales": "Gross sales of Jupiter Gacha packs purchased for $25.",
  "Gacha $50 Pack Sales": "Gross sales of Jupiter Gacha packs purchased for $50.",
  "Gacha $100 Pack Sales": "Gross sales of Jupiter Gacha packs purchased for $100.",
  "Gacha $250 Pack Sales": "Gross sales of Jupiter Gacha packs purchased for $250.",
  "Gacha $1000 Pack Sales": "Gross sales of Jupiter Gacha packs purchased for $1000.",
  "Gacha $2500 Pack Sales": "Gross sales of Jupiter Gacha packs purchased for $2500.",
  "Other Gacha Pack Sales": "Gross sales of Jupiter Gacha packs purchased at other prices.",
  "Pack Buyback Spends": "USDC paid to users who sell pulled cards back within the buyback window.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  start: "2026-07-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: financialBreakdown,
    UserFees: financialBreakdown,
    Revenue: { [REVENUE_LABEL]: "Jupiter's share of gacha fees (pack sales minus buybacks)." },
    ProtocolRevenue: { [REVENUE_LABEL]: "All of Jupiter's share of gacha fees, kept by Jupiter." },
    SupplySideRevenue: { [SUPPLY_SIDE_LABEL]: "Gacha fees not kept by Jupiter, kept by Collector Crypt and Phygitals." },
  },
  allowNegativeValue: true, // buyback payouts can exceed pack sales on a day
  doublecounted: true, // Jupiter Gacha activity overlaps with Collector Crypt
};

export default adapter;
