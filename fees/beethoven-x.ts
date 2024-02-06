import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

type TAddress = {
  [s: string | Chain]: string;
}
const vaultAddresses: TAddress = {
  [CHAIN.OPTIMISM]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  [CHAIN.FANTOM]: "0x20dd72ed959b6147912c2e529f0a0c651c33c9ce",
}

const event_pools_balance_change = "event PoolBalanceChanged(bytes32 indexed poolId,address indexed liquidityProvider,address[] tokens,int256[] deltas,uint256[] protocolFeeAmounts)"
const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const abis = {
  getPool: "function getPool(bytes32 poolId) view returns (address, uint8)",
  getSwapFeePercentage: "uint256:getSwapFeePercentage"
}

const fetch: any = async (timestamp: number, _: any, { getLogs, createBalances, chain, api, }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const vault = vaultAddresses[chain]
  const logs_balance = await getLogs({ target: vault, eventAbi: event_pools_balance_change, })
  const logs_flash_bot = await getLogs({ target: vault, eventAbi: event_flash_bot, })
  const logs_swap = await getLogs({ target: vault, eventAbi: event_swap, })
  logs_balance.forEach((log: any) => dailyFees.add(log.tokens, log.protocolFeeAmounts))
  logs_flash_bot.forEach((log: any) => dailyFees.add(log.token, log.feeAmount))
  const poolIds = [...new Set(logs_swap.map((a: any) => a.poolId))]
  const pools = (await api.multiCall({ abi: abis.getPool, calls: poolIds, target: vault })).map(i => i[0])
  const swapFees = await api.multiCall({ abi: abis.getSwapFeePercentage, calls: pools })
  logs_swap.forEach((log: any) => {
    const index = poolIds.indexOf(log.poolId)
    if (index === -1) return;
    const fee = swapFees[index] / 1e18
    dailyFees.add(log.tokenOut, Number(log.amountOut) * fee)
  })

  dailyRevenue.addBalances(dailyFees)
  dailySupplySideRevenue.addBalances(dailyFees)
  dailyRevenue.resizeBy(0.25)
  dailySupplySideRevenue.resizeBy(0.75)
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, timestamp, }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: { fetch, start: 1672531200 },
    [CHAIN.FANTOM]: { fetch, start: 1672531200 }
  }
}
export default adapters
