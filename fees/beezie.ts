/**
 * Beezie "The Claw" (Base) — fee adapter
 *
 * Claw pull: user pays to play the claw machine (money in → claw wallet). That is gross take from plays, not final profit.
 * Claw SWAP: after a win, the user can sell the prize back to Beezie within the offer window (money out ← claw wallet).
 * We report net economics as inflows minus SWAP payouts; see https://docs.beezie.com/our-offerings/the-claw
 *
 * Tier names match known machine wallets; any factory machine not in those lists is "Other".
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

/** Exclude Beezie internal flows so pulls/swaps reflect user↔machine only */
const INTERNAL_WALLET = "0x80d7c04b738ef379971a6b73f25b1a71ea1c820d";

/** Dune varbinary literals (lowercase hex) — must match analytics tier buckets */
const TIER_CASE = `
    CASE
      WHEN claw_wallet IN (
        0x25acd3ccb939703a742187d6f504428c684ea50c,
        0x8ed22e2569e4a5b4a872299591f0ac016ce19f4e,
        0xfdf28b9b957baed8f3d9962effa9b0fe1e189d6a,
        0x92d79b4b48230d44f915d47fea6c5f63c4565a69,
        0xa34426b958bc792bf2640befa204df579d81b3bf
      ) THEN 'Wildcard'
      WHEN claw_wallet IN (
        0x044cec512d7a5d6852a1b1f1bf5bb9f746962073,
        0x1334e20c249b2c7b45a6b4bafa2947163d74c8b6,
        0x6f4aba86b9e441f77a51fa4d9fc47001e5bf1072,
        0x08f49b9d64a807ec00b1ba986dc9392c26029fcb
      ) THEN 'Gold TCG'
      WHEN claw_wallet IN (
        0x7b8958961517daa2a0bea01249a9ac17f27725d6,
        0x7d71dfc365e6518d40cfdb3f10068be0974e9992,
        0x686328b1a104819dda8e8fa5681694a7b93e4061,
        0x310b050b945c7b9ee66704ca137ddac003371508,
        0x406762fc03d59776e2ea3c6546588aaf1813f173
      ) THEN 'Silver TCG'
      WHEN claw_wallet IN (0x5dfb0592e11d63fdaa880020e69f81cc122d2c97) THEN 'Platinum TCG'
      ELSE 'Other'
    END`;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH claw_wallets AS (
      SELECT DISTINCT clawMachine AS claw_wallet
      FROM beezie_base.beezieclawmachinefactoryv2_evt_clawmachinecreated
    ),
    machine_tier AS (
      SELECT
        claw_wallet,
        ${TIER_CASE} AS claw_name
      FROM claw_wallets
    ),
    inflows AS (
      SELECT
        mt.claw_name,
        COALESCE(SUM(t.amount_usd), 0) AS total
      FROM tokens_base.transfers t
      INNER JOIN machine_tier mt ON t."to" = mt.claw_wallet
      WHERE t."from" != ${INTERNAL_WALLET}
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
      GROUP BY 1
    ),
    outflows AS (
      SELECT
        mt.claw_name,
        COALESCE(SUM(t.amount_usd), 0) AS total
      FROM tokens_base.transfers t
      INNER JOIN machine_tier mt ON t."from" = mt.claw_wallet
      WHERE t."to" != ${INTERNAL_WALLET}
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
      GROUP BY 1
    ),
    names AS (
      SELECT DISTINCT claw_name FROM machine_tier
    )
    SELECT
      n.claw_name,
      COALESCE(i.total, 0) - COALESCE(o.total, 0) AS net_revenue
    FROM names n
    LEFT JOIN inflows i ON n.claw_name = i.claw_name
    LEFT JOIN outflows o ON n.claw_name = o.claw_name
  `;

  const rows: { claw_name: string; net_revenue: number }[] = await queryDuneSql(options, query);
  for (const row of rows) {
    dailyFees.addUSDValue(row.net_revenue ?? 0, row.claw_name);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const tierNetDesc = "Net for this claw tier: token inflows to those machine wallets (plays) minus outflows (SWAP / buyback payouts).";

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2026-01-15" },
  },
  dependencies: [Dependencies.DUNE],
  allowNegativeValue: true,
  methodology: {
    Fees: "Net claw economics after SWAP payouts, split by tier.",
    Revenue: "Net claw economics after SWAP payouts, split by tier.",
  },
  breakdownMethodology: {
    Fees: {
      ['Wildcard']: tierNetDesc,
      ['Gold TCG']: tierNetDesc,
      ['Silver TCG']: tierNetDesc,
      ['Platinum TCG']: tierNetDesc,
    },
  },
};

export default adapter;
