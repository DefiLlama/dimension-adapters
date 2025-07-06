import axios from "axios";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

export async function fetch(options: FetchOptions) {
  const {
    data: { totalVolume },
  } = await axios.get(
    `https://beta.strikefinance.org/api/analytics/volume?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );
  const dailyVolumeUSD = options.createBalances();
  dailyVolumeUSD.addCGToken("cardano", Number(totalVolume));

  return {
    totalVolume,
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
