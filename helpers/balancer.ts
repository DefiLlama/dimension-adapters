import { FetchOptions, FetchV2 } from "../adapters/types";
import { addOneToken } from "./prices";
import * as sdk from '@defillama/sdk'

const event_pools_balance_change = "event PoolBalanceChanged(bytes32 indexed poolId,address indexed liquidityProvider,address[] tokens,int256[] deltas,uint256[] protocolFeeAmounts)"
const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const abis = {
  getPool: "function getPool(bytes32 poolId) view returns (address, uint8)",
  getSwapFeePercentage: "uint256:getSwapFeePercentage"
}

export async function getFees(vault: string, { createBalances, api, getLogs, }: FetchOptions) {
  const dailyFees = createBalances()
  const dailyVolume = createBalances()

  const logs_swap = await getLogs({ target: vault, eventAbi: event_swap, })
  const logs_balance = await getLogs({ target: vault, eventAbi: event_pools_balance_change, })
  const logs_flash_bot = await getLogs({ target: vault, eventAbi: event_flash_bot, })
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
    addOneToken({ chain: api.chain, balances: dailyVolume, token0: log.tokenIn, token1: log.tokenOut, amount0: log.amountIn, amount1: log.amountOut })
  })

  return { dailyFees, dailyVolume }
}

export function getFeesExport(vault: string, { revenueRatio = 0, protocolRevenueRatio, holderRevenueRatio, }: { revenueRatio?: number, protocolRevenueRatio?: number, holderRevenueRatio?: number } = {}) {
  return (async (options) => {
    const { dailyFees, dailyVolume } = await getFees(vault, options)
    const { createBalances } = options
    const response: any = { dailyFees, dailyVolume, }

    if (revenueRatio) {
      const dailyRevenue = createBalances()
      const dailySupplySideRevenue = createBalances()
      dailyRevenue.addBalances(dailyFees)
      dailySupplySideRevenue.addBalances(dailyFees)
      dailyRevenue.resizeBy(revenueRatio)
      dailySupplySideRevenue.resizeBy(1 - revenueRatio)
      response.dailyRevenue = dailyRevenue
      response.dailySupplySideRevenue = dailySupplySideRevenue
    }
    if (protocolRevenueRatio) {
      response.dailyProtocolRevenue = response.dailyFees.clone(protocolRevenueRatio)
    }
    if (holderRevenueRatio) {
      response.dailyHoldersRevenue = response.dailyFees.clone(holderRevenueRatio)
    }
    return response
  }) as FetchV2
}


export function getGraphExport(graphEndpoint: string, { revenueRatio = 0 }: { revenueRatio?: number } = {}) {
  return (async ({ getEndBlock, getStartBlock, createBalances, }: FetchOptions) => {
    const { dailyFees, dailyVolume, } = await getDataGraph()
    const response: any = { dailyFees, dailyVolume, }

    if (revenueRatio) {
      const dailyRevenue = dailyFees.clone(revenueRatio)
      const dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio)
      response.dailyRevenue = dailyRevenue
      response.dailySupplySideRevenue = dailySupplySideRevenue
    }
    return response

    async function getDataGraph() {
      const blockNow = await getEndBlock()
      const blockYesterday = await getStartBlock()
      const graphQuery = `{
        today: balancers(block: { number: ${blockNow} }) {
          totalSwapFee   totalSwapVolume
        }
        yesterday: balancers(block: { number: ${blockYesterday} }) {
          totalSwapFee   totalSwapVolume
        }
      }`
      const graphRes = await sdk.graph.request(graphEndpoint, graphQuery)
      const dailyFees = createBalances()
      const dailyVolume = createBalances()
      graphRes.today.forEach((today: any, i: number) => {
        const yesterday = graphRes.yesterday[i]
        dailyFees.addUSDValue(+today.totalSwapFee - yesterday.totalSwapFee)
        dailyVolume.addUSDValue(today.totalSwapVolume - yesterday.totalSwapVolume)
      })
      return { dailyFees, dailyVolume, }
    }
  }) as FetchV2
}