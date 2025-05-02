import { FetchOptions } from "../adapters/types"

WIP
const defaultSwapEvent = 'event Swap (address indexed sender, address indexed recipient, uint256 indexed id, bool swapForY, uint256 amountIn, uint256 amountOut, uint256 volatilityAccumulated, uint256 fees)'
async function getJoeFetch({ factory, swapEvent = defaultSwapEvent }: { factory: string, swapEvent?: string }) {
  async function fetch(options: FetchOptions) {
    const { createBalances, api, } = options
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailyVolume = createBalances()
    const pools = await api.fetchList({ target: factory, itemAbi: 'getLBPairAtIndex', lengthAbi: 'getNumberOfLBPairs', })
    const tokenA = await api.multiCall({ abi: 'address:getTokenX', calls: pools, })
    const tokenB = await api.multiCall({ abi: 'address:getTokenY', calls: pools, })
    const logs = await getLogs({ targets: pools, eventAbi: swapEvent, })

  }
}