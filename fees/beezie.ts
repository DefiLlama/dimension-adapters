/**
 * Beezie "The Claw" (Base) — fee adapter
 *
 * Claw pull: user pays to play the claw machine (money in → claw wallet). That is gross take from plays, not final profit.
 * Claw SWAP: after a win, the user can sell the prize back to Beezie within the offer window (money out ← claw wallet).
 * We report net economics as inflows minus SWAP payouts; see https://docs.beezie.com/our-offerings/the-claw
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

/** Single breakdown line: net of plays vs. SWAP buybacks */
const CLAW_NET_REVENUE = "Claw net revenue (plays minus SWAP buybacks)";

const INTERNAL_WALLET = "0x80d7C04B738eF379971a6b73f25B1A71ea1c820D";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH claw_wallets AS (
      SELECT clawMachine AS claw_wallet
      FROM beezie_base.beezieclawmachinefactoryv2_evt_clawmachinecreated
    ),
    inflows AS (
      SELECT SUM(amount_usd) AS total
      FROM tokens_base.transfers t
      INNER JOIN claw_wallets cw ON t."to" = cw.claw_wallet
      WHERE t."from" != ${INTERNAL_WALLET}
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
    ),
    outflows AS (
      SELECT SUM(amount_usd) AS total
      FROM tokens_base.transfers t
      INNER JOIN claw_wallets cw ON t."from" = cw.claw_wallet
      WHERE t."to" != ${INTERNAL_WALLET}
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      COALESCE(inflows.total, 0) - COALESCE(outflows.total, 0) AS net_revenue
    FROM inflows, outflows
  `;

  const result = await queryDuneSql(options, query);
  dailyFees.addUSDValue(result[0]?.net_revenue ?? 0, CLAW_NET_REVENUE);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2026-01-15" },
  },
  dependencies: [Dependencies.DUNE],
  allowNegativeValue: true,
  methodology: {
    Fees: "Claw play payments to machine wallets minus SWAP buybacks paid to users who sell prizes back.",
    Revenue: "Same as fees: net claw economics after SWAP payouts.",
  },
  breakdownMethodology: {
    Fees: {
      [CLAW_NET_REVENUE]:
        "Sum of token inflows to claw machines (plays) minus outflows from those wallets (SWAP / buyback payouts), excluding the internal Beezie wallet.",
    },
    Revenue: {
      [CLAW_NET_REVENUE]:
        "Sum of token inflows to claw machines (plays) minus outflows from those wallets (SWAP / buyback payouts), excluding the internal Beezie wallet.",
    },
  },
};

export default adapter;
