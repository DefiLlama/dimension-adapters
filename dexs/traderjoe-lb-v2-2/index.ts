import { FetchOptions, IJSON, SimpleAdapter, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";


interface IVolume {
  timestamp: number;
  volumeUsd: number;
}

const mapChain = (chain: Chain): string => {
  if (chain === CHAIN.BSC) return "binance"
  if (chain === CHAIN.ARBITRUM) return "arbitrum"
  if (chain === CHAIN.AVAX) return "avalanche"
  return chain
}

const fetchV22Volume = async (_t: any, _tt: any, options: FetchOptions): Promise<FetchResult> => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay);
  const start = dayTimestamp;
  const end = start + 24 * 60 * 60;
  const url = `https://api.lfj.dev/v1/dex/analytics/${mapChain(options.chain)}?startTime=${start}&endTime=${end}&version=v2.2`
  const historicalVolume: IVolume[] = (await httpGet(url, {
    headers: {
      'x-traderjoe-api-key': process.env.TRADERJOE_API_KEY
    }
  }));

  const totalVolume = historicalVolume
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { volumeUsd }) => acc + Number(volumeUsd), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.timestamp === dayTimestamp)?.volumeUsd
  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume !== undefined ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  }
}


const factory = {
  [CHAIN.AVAX]: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
  [CHAIN.ARBITRUM]: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
}
const swap_event = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)'

// unused code, as it underestimates volume in production
const fetchVolume = async (_t: any, _ts: any, options: FetchOptions) => {
  const { api } = options;
  const pools = await api.fetchList({ target: factory[options.chain], itemAbi: 'getLBPairAtIndex', lengthAbi: 'getNumberOfLBPairs', })
  const tokenA = await api.multiCall({ abi: 'address:getTokenX', calls: pools, })
  const tokenB = await api.multiCall({ abi: 'address:getTokenY', calls: pools, })

  const decimalsXs = await api.multiCall({ abi: 'erc20:decimals', calls: tokenA })
  const decimalsYs = await api.multiCall({ abi: 'erc20:decimals', calls: tokenB })

  const pairObject: IJSON<string[]> = {}
  pools.forEach((pair: string, i: number) => {
    pairObject[pair] = [tokenA[i], tokenB[i]]
  })
  const logs = await options.getLogs({
    targets: pools,
    eventAbi: swap_event,
    flatten: false,
  })
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  logs.forEach((_logs, i) => {
    _logs.forEach(log => {
      const amountInX = Number('0x' + '0'.repeat(32) + log.amountsIn.replace('0x', '').slice(0, 32))
      const amountInY = Number('0x' + '0'.repeat(32) + log.amountsIn.replace('0x', '').slice(32, 64))
      const token0 = tokenA[i]
      const token1 = tokenB[i]
      dailyVolume.add(token0, amountInY);
      dailyVolume.add(token1, amountInX);
      const decimalsX = decimalsXs[i];
      const decimalsY = decimalsYs[i];
      const protocolFeesY = Number('0x' + log.protocolFees.replace('0x', '').slice(0, 32))
      const protocolFeesX = Number('0x' + log.protocolFees.replace('0x', '').slice(32, 64))
      const totalFeesY = Number('0x' + log.totalFees.replace('0x', '').slice(0, 32));
      const totalFeesX = Number('0x' + log.totalFees.replace('0x', '').slice(32, 64));
      dailyFees.add(token0, totalFeesX / 10 ** (18 - decimalsX))
      dailyFees.add(token1, totalFeesY / 10 ** (18 - decimalsY))
      dailyRevenue.add(token0, protocolFeesX / 10 ** (18 - decimalsX))
      dailyRevenue.add(token1, protocolFeesY / 10 ** (18 - decimalsY))
    })
  })
  return { dailyVolume, dailyFees, dailyRevenue }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchV22Volume,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchV22Volume,
    },
  }
}
export default adapters
