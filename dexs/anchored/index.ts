import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchAnchoredDimensions, toNumber } from "../../helpers/anchored";

const fetch = async (options: FetchOptions) => {
  const data = await fetchAnchoredDimensions(options);
  const dailyVolume = options.createBalances();

  dailyVolume.addUSDValue(toNumber(data.dailyVolume));

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.ETHEREUM, CHAIN.MONAD],
  fetch,
  start: "2026-02-01",
  methodology: {
    Volume: "Trading volume in USD from settled filled tokenized stock trades on Anchored.",
  },
};

export default adapter;
