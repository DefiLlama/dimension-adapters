import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

export async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const { totalVolume } = await fetchURL(
    `https://beta.strikefinance.org/api/analytics/volume?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );
  dailyVolume.addCGToken("cardano", Number(totalVolume));

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2025-05-16",
    },
  },
};

export default adapter;
