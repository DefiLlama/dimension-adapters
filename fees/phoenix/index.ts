import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    select
      sum(fee_usd) as total_fee_usd
    from dex_solana.trades
    where
      project = 'phoenix'
      and block_time>=from_unixtime(${options.fromTimestamp}) and block_time<from_unixtime(${options.toTimestamp})
  `;

  const res = await queryDuneSql(options, query);

  if (res.length && res[0].total_fee_usd) {
    // Dune already returns USD-denominated fees
    dailyFees.addUSDValue(res[0].total_fee_usd);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2023-02-27",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading fees collected by Phoenix from user transactions on Solana.",
    Revenue: "All collected trading fees are considered protocol revenue.",
    ProtocolRevenue: "All collected trading fees are attributed to the protocol.",
  },
};

export default adapter;
