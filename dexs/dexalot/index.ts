import { BaseAdapter, BreakdownAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.dexalot.com/api/stats/chaindailyvolumes"

interface IVolumeall {
  volumeusd: string;
  date: number;
}

const swapChains = [CHAIN.AVAX, CHAIN.ARBITRUM, CHAIN.BASE]

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

  return async (options: FetchOptions): Promise<FetchResultV2> => {
    const dayTimestamp = new Date(options.startOfDay * 1000)
    const historicalVolume: IVolumeall[] = await httpGet(endpoint)

    const totalVolume = historicalVolume
      .filter(volItem => new Date(volItem.date) <= dayTimestamp)
      .reduce((acc, { volumeusd }) => acc + Number(volumeusd), 0)
    const dailyVolume = historicalVolume
      .find(dayItem => new Date(dayItem.date) === dayTimestamp)?.volumeusd

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
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

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    swap: swapChains.reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: fetchFromChain(chain),
          start: getStartTimestamp(chain),
        }
      }
    }, {} as BaseAdapter),
    spot: {
      [CHAIN.DEXALOT]: {
        fetch: fetchFromChain(CHAIN.DEXALOT),
        start: getStartTimestamp(CHAIN.DEXALOT),
      }
    }
  }
};

export default adapter;
