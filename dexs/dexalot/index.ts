import { BaseAdapter, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.dexalot.com/api/stats/chaindailyvolumes"

interface IVolumeall {
  volumeusd: string;
  date: string;
}

const supportedChains = [CHAIN.DEXALOT, CHAIN.AVAX, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.BSC]

const chainToEnv = (chain: CHAIN) => {
  switch (chain) {
    case CHAIN.AVAX:
      return "production-multi-avax"
    case CHAIN.ARBITRUM:
      return "production-multi-arb"
    case CHAIN.BASE:
      return "production-multi-base"
    case CHAIN.BSC:
      return "production-multi-bsc"
    default:
      return "production-multi-subnet"
  }
}

const fetch = async (_a: any, _t: any, options: FetchOptions): Promise<FetchResult> => {
  const endpoint = `${historicalVolumeEndpoint}?env=${chainToEnv(options.chain as CHAIN)}`
  const dayTimestamp = new Date(options.startOfDay * 1000)
  const dateStr = dayTimestamp.toISOString().split('T')[0]
  const historicalVolume: IVolumeall[] = await httpGet(endpoint)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.date.split('T')[0] === dateStr)?.volumeusd

  return {
    dailyVolume: dailyVolume,
  };
}

const getStartTimestamp = (chain: CHAIN) => {
  const endpoint = `${historicalVolumeEndpoint}?env=${chainToEnv(chain)}`
  return async () => {
    const historicalVolume: IVolumeall[] = await httpGet(endpoint)
    return (new Date(historicalVolume[0].date).getTime()) / 1000
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: supportedChains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: getStartTimestamp(chain),
      }
    }
  }, {} as BaseAdapter),
};

export default adapter;
