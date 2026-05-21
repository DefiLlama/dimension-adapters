import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";

// https://pred-1.gitbook.io/pred-docs
// https://github.com/orgs/pred-org/repositories
const EXCHANGE = "0x1938Af63B717B80ea62ccB4CCBf799F8a28dEFB0";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({ options, exchanges: [EXCHANGE], currency: USDC });

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-05-11",
    },
  },
};

export default adapter;
