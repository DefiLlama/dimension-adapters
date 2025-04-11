import { BaseAdapter, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.dexalot.com/api/stats/chaindailyvolumes"

interface IVolumeall {
  volumeusd: string;
  date: string;
}

const supportedChains = [CHAIN.DEXALOT, CHAIN.AVAX, CHAIN.ARBITRUM, CHAIN.BASE]

const chainToEnv = (chain: CHAIN) => {
  switch (chain) {
    case CHAIN.AVAX:
      return "production-multi-avax"
    case CHAIN.ARBITRUM:
      return "production-multi-arb"
    case CHAIN.BASE:
      return "production-multi-base"
    default:
      return "production-multi-subnet"
  }
}

const fetchFromChain = (chain: CHAIN) => {
  const endpoint = `${historicalVolumeEndpoint}?env=${chainToEnv(chain)}`

  return async (_a:any, _t: any, options: FetchOptions): Promise<FetchResult> => {
    const dayTimestamp = new Date(options.startOfDay * 1000)
    const dateStr = dayTimestamp.toISOString().split('T')[0]
    const historicalVolume: IVolumeall[] = await httpGet(endpoint)

    const totalVolume = historicalVolume
      .filter(volItem => new Date(volItem.date) <= dayTimestamp)
      .reduce((acc, { volumeusd }) => acc + Number(volumeusd), 0)
    const dailyVolume = historicalVolume
      .find(dayItem => dayItem.date.split('T')[0] === dateStr)?.volumeusd

    return {
      timestamp: options.startOfDay,
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
    };
  }
};

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
        fetch: fetchFromChain(chain),
        start: getStartTimestamp(chain),
      }
    }
  }, {} as BaseAdapter),
};

export default adapter;
