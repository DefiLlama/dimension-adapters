import { FetchOptions, SimpleAdapter } from "../adapters/types";
// import { queryAllium } from "../helpers/allium";
import { queryDuneSql } from "../helpers/dune";
import { CHAIN } from "../helpers/chains";
// import { getSolanaReceived } from "../helpers/token";

const JUP_FEE_RECEIVER = '5YET3YapxD6to6rqPqTWB3R9pSbURy6yduuUtoZkzoPX';

const fetchFeesSolana = async (_as:any, _b:any, options: FetchOptions) => {
  const query = `
    SELECT
      SUM(balance_change/1e9) AS total_fees
    FROM solana.account_activity
    WHERE address = '${JUP_FEE_RECEIVER}'
      AND balance_change > 0
      AND tx_success = true
      AND TIME_RANGE
  `;
  const res = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken("solana", res[0].total_fees);

  // const dailyFees = await getSolanaReceived({ options, target: '5YET3YapxD6to6rqPqTWB3R9pSbURy6yduuUtoZkzoPX' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFeesSolana,
      start: '2024-09-13',
    }
  },
  isExpensiveAdapter: true
};

export default adapter;
