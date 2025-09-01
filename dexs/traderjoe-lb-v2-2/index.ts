import { FetchOptions, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

interface IVolume {
  timestamp: number;
  volumeUsd: number;
  feesUsd: number;
  protocolFeesUsd: number;
}
const chainMap: any = {
  [CHAIN.AVAX]:{ chainKey:"avalanche", start: "2024-07-01" },
  [CHAIN.ARBITRUM]:{ chainKey:"arbitrum", start: "2024-07-01" },
  // [CHAIN.BSC]: "binance",
}

const fetchV22Volume = async (_t: any, _tt: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay
  let { chainKey } = chainMap[options.chain];
  const end = dayTimestamp + 24 * 60 * 60;
  const url = `https://api.lfj.dev/v1/dex/analytics/${chainKey}?startTime=${dayTimestamp - 86400}&endTime=${end}&version=v2.2`
  const historicalVolumeAndFees: IVolume[] = (await httpGet(url, {
    headers: {
      'x-traderjoe-api-key': getEnv('TRADERJOE_API_KEY')
    }
  }));

  const { feesUsd: dailyFees, protocolFeesUsd: dailyHoldersRevenue, volumeUsd: dailyVolume, } = historicalVolumeAndFees.find(item => item.timestamp === dayTimestamp) ?? {}

  return {
    dailyVolume,
    timestamp: dayTimestamp,
    dailyFees,
    dailyHoldersRevenue,
    dailyRevenue: dailyHoldersRevenue,
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchV22Volume,
      start: chainMap[CHAIN.AVAX].start,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchV22Volume,
      start: chainMap[CHAIN.ARBITRUM].start,
    },
  }
}
export default adapters
