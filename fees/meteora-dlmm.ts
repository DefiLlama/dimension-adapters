import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    WITH swaps AS (
      SELECT
        token_x_mint AS token,
        SUM(fee_x) AS total_fee,
        SUM(protocol_fee_x) AS total_protocol_fee
      FROM meteora_solana.lb_clmm_evt_swap
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
        AND fee_x > 0
      GROUP BY token_x_mint
      UNION ALL
      SELECT
        token_y_mint AS token,
        SUM(fee_y) AS total_fee,
        SUM(protocol_fee_y) AS total_protocol_fee
      FROM meteora_solana.lb_clmm_evt_swap
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
        AND fee_y > 0
      GROUP BY token_y_mint
    )
    SELECT
      token,
      SUM(total_fee) AS total_fee,
      SUM(total_protocol_fee) AS total_protocol_fee
    FROM swaps
    GROUP BY token
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
      runAtCurrTime: true,
    }
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All swap fees paid by traders in Meteora DLMM pools.",
    Revenue: "Protocol fees (5% of total swap fee for standard pools, 20% for launch pools).",
    SupplySideRevenue: "Fees distributed to LPs after protocol fee deduction.",
  },
  breakdownMethodology: {
    Fees: "Trader-paid swap fees.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "LP share after protocol fee deduction.",
  }
};

export default adapter;
