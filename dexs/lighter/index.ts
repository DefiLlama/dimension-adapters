import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

var lighterVolumeEndpoint =
  "https://api.lighter.xyz/volume?blockchain_id=42161";

interface IVolumeall {
  totalVolume: number;
  dailyVolume: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  lighterVolumeEndpoint = lighterVolumeEndpoint.concat(
    `&timestamp=${dayTimestamp}`
  );

  const result: IVolumeall = (await fetchURL(lighterVolumeEndpoint)).data;

  return {
    totalVolume: result ? `${result.totalVolume}` : undefined,
    dailyVolume: result ? `${result.dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1677934513,
    },
  },
};

export default adapter;
