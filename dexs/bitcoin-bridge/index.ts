import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const photonBridgeEndpoint = "https://bridge.superproof.ai/bridge"

const chainMapping = {
  ETH: CHAIN.ETHEREUM,
  BTC: CHAIN.BITCOIN,
}

const CHAINS = ['BTC', 'ETH']

const getFetchForChain = (chainShortName: string) => {
  return async (_a: any, _b: any, options: FetchOptions) => {
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
    const volumeForDay = await httpGet(photonBridgeEndpoint.concat(`/dashboard/vol/chain/day?chain=${chainShortName}&timestamp=${startOfDay}`))

    const totalVolume = volumeForDay.total_volume
    const dailyVolume = volumeForDay.day_vol

    return {
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
      timestamp: startOfDay,
    };
  };
};


const adapter: SimpleAdapter = {
  adapter: CHAINS.reduce((acc, chainKey) => {
    acc[chainMapping[chainKey]] = {
      fetch: getFetchForChain(chainKey) as any,
      start: '2025-05-28',
      meta: {
        methodology: {
          Volume: "This represents the total value of assets bridged over the period.",
        }
      }
    };
    return acc;
  }, {}),
};

export default adapter;
