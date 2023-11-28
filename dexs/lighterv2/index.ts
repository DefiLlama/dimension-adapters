import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

var lighterV2VolumeEndpoint =
  "https://api.lighter.xyz/v2/volume?blockchain_id=42161";

interface IVolumeall {
  totalVolume: number;
  dailyVolume: number;
}

const fetchV2 = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  lighterV2VolumeEndpoint = lighterV2VolumeEndpoint.concat(
    `&timestamp=${dayTimestamp}`
  );

  const result: IVolumeall = (await fetchURL(lighterV2VolumeEndpoint)).data;

  return {
    totalVolume: result ? `${result.totalVolume}` : undefined,
    dailyVolume: result ? `${result.dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchV2,
      start: async () => 1697144400,
    },
  },
};

export default adapter;
