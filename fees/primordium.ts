import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      meta: {
        methodology: {
          Fees: 'All trading fees paid by users while using Trojan bot.',
          Revenue: 'Fees collected by Trojan protocol.',
        }
      }
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
