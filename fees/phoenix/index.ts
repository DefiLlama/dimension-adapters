import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    SELECT
      SUM(fee_usd) AS fee_usd
    FROM dex_solana.trades
    WHERE
      project = 'phoenix'
      AND TIME_RANGE
  `;

  const res = await queryDuneSql(options, query);

  if (res.length && res[0].fee_usd) {
    // Dune already returns USD-denominated fees
    dailyFees.addUSDValue(Number(res[0].fee_usd));
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
