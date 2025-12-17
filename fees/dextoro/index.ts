import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '8G9PfS5HcTqQZ7uzehBwXr3Ab8M6nWW4REP5nDtJkqdd' })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Buy/sell fees paid by users.",
    Revenue: "All fees are revenue..",
    ProtocolRevenue: "All revenue collected by protocol.",
  }
};

export default adapter;
