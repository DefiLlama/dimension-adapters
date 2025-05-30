import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const photonBridgeEndpoint = "https://bridge.superproof.ai/bridge"

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const volumeForDay = (await httpGet(photonBridgeEndpoint.concat(`/dashboard/vol/day?timestamp=${dayTimestamp}`),
    { headers: { "x-client-id": "defillama" } }));

  const totalVolume = volumeForDay.total_volume
  const dailyVolume = volumeForDay.day_vol

  return {
    totalVolume: totalVolume,
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-05-28',
      meta: {
        methodology: {
          Volume: "This represents the total value of assets bridged over the period.",
        }
      }
    },
  },
};

export default adapter;
