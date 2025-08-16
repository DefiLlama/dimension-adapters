import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoint = "https://api.thetis.market/indexer/v1/stats/";

const fetch = async (timestamp: number) => {
  const startTime = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const endTime = startTime + 86400;

  const [{ swap, total } = { swap: 0, total: 0 }] = [] = await fetchURL(`${endpoint}volume-daily?startTime=${startTime}&endTime=${endTime}`);

  return {
    dailyVolume: (total - swap) / 1e18,
    timestamp: startTime,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2024-08-09",
    },
  },
  methodology: {
    dailyVolume:
      "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
  },
};

export default adapter;
