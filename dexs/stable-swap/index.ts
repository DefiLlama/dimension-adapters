import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";

const v2Fetch = getUniV2LogAdapter({
  factory: "0x25D2d657F539F2bB16eC82773cBE5ee49ddD3c69",
  fees: 0.003,
  revenueRatio: 0,
});

const v3Fetch = getUniV3LogAdapter({
  factory: "0x88F0a512eF09175D456bc9547f914f48C013E4aA",
});

const fetch = async (options: FetchOptions) => {
  const [v2, v3] = await Promise.all([v2Fetch(options), v3Fetch(options)]);

  v2.dailyVolume.addBalances(v3.dailyVolume);
  v2.dailyFees.addBalances(v3.dailyFees);

  return v2;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.STABLE]: {
      fetch,
      start: "2026-03-29",
    },
  },
};

export default adapter;
