import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '8G9PfS5HcTqQZ7uzehBwXr3Ab8M6nWW4REP5nDtJkqdd' })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      meta: {
        methodology: {
          Fees: "Buy/sell fees paid by users.",
          Revenue: "All fees are revenue..",
          ProtocolRevenue: "All revenue collected by protocol.",
        }
      }
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
