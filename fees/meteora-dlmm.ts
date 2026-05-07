import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const query = `
    SELECT
      CASE WHEN swap_for_y THEN token_x_mint ELSE token_y_mint END AS token,
      SUM(fee) AS total_fee,
      COALESCE(SUM(protocol_fee), 0) AS total_protocol_fee,
      SUM(fee) - COALESCE(SUM(protocol_fee), 0) AS total_lp_fee
    FROM meteora_solana.lb_clmm_evt_swap
    WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})
    GROUP BY 1
    HAVING SUM(fee) > 0
  `;

  const rows = await queryDuneSql(options, query);

  for (const row of rows) {
    if (!row.token || !row.total_fee) continue;
    dailyFees.add(row.token, row.total_fee, "trader fees");
    dailyRevenue.add(row.token, row.total_protocol_fee, "protocol fees");
    dailySupplySideRevenue.add(row.token, row.total_lp_fee, "LP fees");
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
    Fees: "Swap fees from Meteora DLMM pools. Memecoin fees excluded automatically via DefiLlama in-house token pricing.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "Fees distributed to LPs after protocol fee deduction.",
  },
  breakdownMethodology: {
    Fees: "Trader-paid swap fees in tokens with DefiLlama price data.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "LP share computed in SQL to avoid JS precision loss.",
  }
};

export default adapter;
