import fetchURL from "../../utils/fetchURL";
import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

var lighterVolumeEndpoint =
  "https://api.lighter.xyz/volume?blockchain_id=42161";

var lighterV2VolumeEndpoint =
  "https://api.lighter.xyz/v2/volume?blockchain_id=42161";

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

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [CHAIN.ARBITRUM]: {
        fetch: fetch,
        start: async () => 1677934513,
      },
    },
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: fetchV2,
        start: async () => 1697144400,
      },
    },
  },
};

export default adapter;
