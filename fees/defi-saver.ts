import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FeeWallet = '0x6467e807db1e71b9ef04e0e3afb962e4b0900b2b';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FeeWallet,
  })
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2022-01-01',
    }
  },
  methodology: {
    Fees: 'Total fees paid by users for using DefiSaver services.',
    Revenue: 'Total fees paid are distributed to DefiSaver.',
    ProtocolRevenue: 'Total fees paid are distributed to DefiSaver.',
  }
}
export default adapter;
