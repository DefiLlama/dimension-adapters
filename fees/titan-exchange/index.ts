import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const trade_source = "T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT";

  const query = `
    SELECT
      SUM(fee_tier) AS native_fee
    FROM dex_solana.trades
    WHERE trade_source = '${trade_source}'
      AND block_date = DATE '${options.dateString}'
  `;

  const res = await queryDuneSql(options, query);
  const feeAmount = Number(res[0]?.native_fee || 0);

  if (feeAmount > 0) {
    dailyFees.add(ADDRESSES.solana.SOL, feeAmount);
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
  dependencies: [Dependencies.DUNE],
  start: "2024-11-07",
  isExpensiveAdapter: true,
  methodology: {
    Fees:
      "Trading fees collected by Titan Exchange from user transactions on Solana.",
    Revenue:
      "All collected trading fees are considered protocol revenue.",
    ProtocolRevenue:
      "All collected trading fees are attributed to the protocol.",
  },
};

export default adapter;
