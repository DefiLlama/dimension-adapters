import { abi } from "@defillama/sdk/build/api";
import { Fetch, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const factory = {
  [CHAIN.AVAX]: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
  [CHAIN.ARBITRUM]: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
}
const swap_event = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)'
const fetchVolume = async (options: FetchOptions) => {
  const {api } = options;
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
  return {dailyVolume, dailyFees, dailyRevenue}
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetchVolume,
      start: 0,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: 0,
    },
  }
}
export default adapters
