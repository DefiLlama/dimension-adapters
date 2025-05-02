import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({ options, tokens: ["0x4200000000000000000000000000000000000006"], targets: ["0xbcb4a982d3c2786e69a0fdc0f0c4f2db1a04e875"] })

  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch,
          },
  },
};

export default adapter;
