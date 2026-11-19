import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

// Dyson Finance: its own AMM, not a Uniswap V2 fork. Pairs emit one Swap per trade with the input side flagged by isSwap0.
// Factory and Pair source: https://sourcify.dev/server/v2/contract/59144/0xecD30C099c222AbffDaf3E2A3d2455FC8e8c739E?fields=all
// Volume only: the swap fee is a per-pair ratio that decays over time and is not in the Swap event, so fees cannot be read from logs.
const SWAP_EVENT = 'event Swap(address indexed sender, bool indexed isSwap0, uint256 amountIn, uint256 amountOut, address indexed to)'

const chainConfig: Record<string, { factory: string; start: string }> = {
  [CHAIN.LINEA]: { factory: '0xecD30C099c222AbffDaf3E2A3d2455FC8e8c739E', start: '2023-10-20' }, // factory deployed 2023-10-20
  // Polygon zkEVM and Blast (factory 0x51a0d4b81400581d8722627dafcd0c1ff9357d1d on both) are not tracked: both chains are on the sdk dead chains list, so the runner never calls them
}

const fetch = async (options: FetchOptions) => {
  const { factory } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()

  const pairs: string[] = await options.api.fetchList({ lengthAbi: 'uint256:allPairsLength', itemAbi: 'function allPairs(uint256) view returns (address)', target: factory })
  const token0s = await options.api.multiCall({ abi: 'address:token0', calls: pairs })
  const token1s = await options.api.multiCall({ abi: 'address:token1', calls: pairs })
  const pairLogs = await options.getLogs({ targets: pairs, eventAbi: SWAP_EVENT, flatten: false })

  pairLogs.forEach((logs: any[], i: number) => {
    logs.forEach((log: any) => {
      // amountIn is what the trader paid, before the fee is taken
      addOneToken({
        chain: options.chain, balances: dailyVolume, token0: token0s[i], token1: token1s[i],
        amount0: log.isSwap0 ? log.amountIn : log.amountOut,
        amount1: log.isSwap0 ? log.amountOut : log.amountIn,
      })
    })
  })

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Swap volume on Dyson Finance pairs on Linea. Excludes the Polygon zkEVM and Blast deployments.",
  },
}

export default adapter
