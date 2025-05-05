import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: ['F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj', '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb'] })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
          },
  },
  isExpensiveAdapter: true
};

export default adapter;
