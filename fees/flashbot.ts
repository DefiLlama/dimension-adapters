import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";

const fetchFees = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()

  // https://dune.com/queries/4742045
  const sql = getSqlFromFile('helpers/queries/flashbots.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp
  });

  const res = await queryDuneSql(options, sql);

  const dayItem = res[0]
  dailyFees.addGasToken((dayItem?.cum_proposer_revenue) * 1e18 || 0)

  return {
    dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'Total ETH fees paid to block proposers by users.',
  },
}

export default adapter;
