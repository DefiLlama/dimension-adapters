import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // meteora_solana.lb_clmm_evt_swap correct columns (verified from Meteora DLMM IDL):
  // fee: total LP fee in input token (raw bigint)
  // protocol_fee: protocol portion (raw bigint)  
  // swap_for_y: true = token_x_mint was input, false = token_y_mint was input
  // Memecoin filter: createBalances().add() uses DefiLlama's in-house pricing DB
  // tokens without prices automatically contribute $0 to total
  const query = `
    SELECT
      CASE WHEN swap_for_y THEN token_x_mint ELSE token_y_mint END AS token,
      SUM(fee) AS total_fee,
      SUM(protocol_fee) AS total_protocol_fee
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
    Fees: "Swap fees from Meteora DLMM pools. Memecoin fees are excluded automatically via DefiLlama's in-house token pricing — tokens without prices contribute $0.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "Fees distributed to LPs after protocol fee deduction.",
  },
  breakdownMethodology: {
    Fees: "Trader-paid swap fees in tokens with DefiLlama price data.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "LP share after protocol fee deduction.",
  }
};

export default adapter;
