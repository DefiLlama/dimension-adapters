import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const value = (await queryDune("3986808", {
      start: options.startTimestamp,
      end: options.endTimestamp,
      receiver: '5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk',
      token_mint_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  }));
  dailyFees.add('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', value[0].received*1e6);
  return {
      dailyFees,
      dailyRevenue: dailyFees,
  }

}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: 0,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
