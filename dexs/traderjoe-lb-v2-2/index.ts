import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface IVolume {
  timestamp: number;
  volumeUsd: number;
  feesUsd: number;
  protocolFeesUsd: number;
}
const chainMap: any = {
  [CHAIN.AVAX]:{ chainKey:"avalanche", start: "2024-11-01" },
  [CHAIN.ARBITRUM]:{ chainKey:"arbitrum", start: "2024-11-01" },
  // [CHAIN.BSC]: "binance",
}

const fetchV22Volume = async (_t: any, _tt: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay
  let { start, chainKey } = chainMap[options.chain];
  start = Math.floor(+new Date(start).getTime() / 1000)
  const end = dayTimestamp + 24 * 60 * 60;
  const url = `https://api.lfj.dev/v1/dex/analytics/${chainKey}?startTime=${start}&endTime=${end}&version=v2.2`
  const historicalVolumeAndFees: IVolume[] = (await httpGet(url, {
    headers: {
      'x-traderjoe-api-key': process.env.TRADERJOE_API_KEY
    }
  }));

  const totalVolume = historicalVolumeAndFees
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { volumeUsd }) => acc + Number(volumeUsd), 0)
  const totalFees = historicalVolumeAndFees
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { feesUsd }) => acc + Number(feesUsd), 0)
  const totalHoldersRevenue = historicalVolumeAndFees
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { protocolFeesUsd }) => acc + Number(protocolFeesUsd), 0)

  const { feesUsd: dailyFees, protocolFeesUsd: dailyHoldersRevenue, volumeUsd: dailyVolume, } = historicalVolumeAndFees.find(item => item.timestamp === dayTimestamp) ?? {}

  return {
    totalVolume,
    totalFees,
    totalUserFees: totalFees,
    totalRevenue: totalHoldersRevenue,
    totalHoldersRevenue,
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
