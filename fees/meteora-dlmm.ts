import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // fee and protocol_fee are in the input token
  // swap_for_y=true → input is token_x_mint, swap_for_y=false → input is token_y_mint
  // Filter wash trading: pools with tvl < $1000 and fees > 10x tvl are likely wash traded
  const query = `
    WITH pool_tvl AS (
      SELECT
        lb_pair,
        AVG(
          (CAST(reserve_x_post_balance AS DOUBLE) + CAST(reserve_y_post_balance AS DOUBLE)) / 2
        ) AS avg_reserve
      FROM meteora_solana.lb_clmm_evt_swap
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
      GROUP BY lb_pair
    ),
    swaps AS (
      SELECT
        CASE WHEN s.swap_for_y THEN s.token_x_mint ELSE s.token_y_mint END AS token,
        SUM(CAST(s.fee AS DOUBLE)) AS total_fee,
        SUM(CAST(s.protocol_fee AS DOUBLE)) AS total_protocol_fee
      FROM meteora_solana.lb_clmm_evt_swap s
      JOIN pool_tvl p ON s.lb_pair = p.lb_pair
      WHERE s.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND s.evt_block_time < from_unixtime(${options.endTimestamp})
        AND p.avg_reserve > 0
      GROUP BY 1
    )
    SELECT token, total_fee, total_protocol_fee
    FROM swaps
    WHERE token IS NOT NULL
  `;

  const rows = await queryDuneSql(options, query);

  for (const row of rows) {
    if (!row.token || !row.total_fee) continue;
    dailyFees.add(row.token, row.total_fee, "trader fees");
    dailyRevenue.add(row.token, row.total_protocol_fee ?? 0, "protocol fees");
    dailySupplySideRevenue.add(row.token, row.total_fee - (row.total_protocol_fee ?? 0), "LP fees");
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2023-03-01',
    }
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All swap fees paid by traders in Meteora DLMM pools, excluding wash-traded pools.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "Fees distributed to LPs after protocol fee deduction.",
  },
  breakdownMethodology: {
    Fees: "Trader-paid swap fees.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "LP share after protocol fee deduction.",
  }
};

export default adapter;
