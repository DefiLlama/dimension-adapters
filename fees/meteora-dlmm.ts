import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // meteora_solana.lb_clmm_evt_swap fields:
  // token_x_mint, token_y_mint: token addresses
  // fee_x, fee_y: LP fees collected in each token (raw amounts)
  // protocol_fee_x, protocol_fee_y: protocol portion of fees (raw amounts)
  const query = `
    WITH swaps AS (
      SELECT
        token_x_mint AS token,
        SUM(CAST(fee_x AS DOUBLE)) AS total_fee,
        SUM(CAST(protocol_fee_x AS DOUBLE)) AS total_protocol_fee
      FROM meteora_solana.lb_clmm_evt_swap
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time < from_unixtime(${options.endTimestamp})
        AND fee_x > 0
      GROUP BY token_x_mint
      UNION ALL
      SELECT
        token_y_mint AS token,
        SUM(CAST(fee_y AS DOUBLE)) AS total_fee,
        SUM(CAST(protocol_fee_y AS DOUBLE)) AS total_protocol_fee
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
    dailyFees.add(row.token, row.total_fee);
    dailyRevenue.add(row.token, row.total_protocol_fee ?? 0);
    dailySupplySideRevenue.add(row.token, row.total_fee - (row.total_protocol_fee ?? 0));
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
    Revenue: "Protocol fees (5% of LP fees for standard pools, 20% for launch pools).",
    SupplySideRevenue: "Fees distributed to LPs after protocol fee deduction.",
  }
};

export default adapter;
