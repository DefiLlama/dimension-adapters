import { FetchOptions, FetchV2 } from "../adapters/types";

const event_pools_balance_change = "event PoolBalanceChanged(bytes32 indexed poolId,address indexed liquidityProvider,address[] tokens,int256[] deltas,uint256[] protocolFeeAmounts)"
const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const abis = {
  getPool: "function getPool(bytes32 poolId) view returns (address, uint8)",
  getSwapFeePercentage: "uint256:getSwapFeePercentage"
}

export async function getFees(vault: string, { createBalances, api, getLogs, }: FetchOptions) {
  const dailyFees = createBalances()

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

  return dailyFees
}

export function getFeesExport(vault: string, { revenueRatio = 0.25 }: { revenueRatio?: number } = {}) {
  return (async (options) => {
    const dailyFees = await getFees(vault, options)
    const { createBalances } = options
    const dailyRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()
    dailyRevenue.addBalances(dailyFees)
    dailySupplySideRevenue.addBalances(dailyFees)
    dailyRevenue.resizeBy(revenueRatio)
    dailySupplySideRevenue.resizeBy(1 - revenueRatio)
    return { dailyFees, dailyRevenue, dailySupplySideRevenue, }
  }) as FetchV2
}