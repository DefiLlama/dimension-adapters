import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Jupiter Gacha settles through Collector Crypt's shared wallet; jupiter-* memos
// isolate Jupiter activity. https://solscan.io/account/GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3
const GACHA_ADDRESS = "GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3";
// Canonical USDC mint on Solana.
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// Listed Jupiter Gacha pack prices; future/non-standard prices remain visible
// under Other Gacha Pack Sales. https://jup.ag/gacha
const GACHA_TIERS = new Set([25, 50, 100, 250, 1000, 2500]);

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
  `;

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
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyUserFees: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: "0",
  };
};

const methodology = {
  Volume: "Gross USDC spent on Jupiter Gacha packs.",
  Fees: "Jupiter Gacha pack sales minus card buyback payouts.",
  Revenue: "Net pack revenue after card buyback payouts.",
  UserFees: "Net amount paid by users after card buybacks.",
  ProtocolRevenue: "Net pack revenue after card buybacks.",
  HoldersRevenue: "No holders revenue.",
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
  version: 2,
  fetch,
  pullHourly: true,
  start: "2026-07-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology: {
    Fees: financialBreakdown,
    Revenue: financialBreakdown,
    ProtocolRevenue: financialBreakdown,
  },
  allowNegativeValue: true, // hourly buyback payouts can exceed pack sales in the same interval
  doublecounted: true, // Jupiter Gacha activity overlaps with Collector Crypt
};

export default adapter;
