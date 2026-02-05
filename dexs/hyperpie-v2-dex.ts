import { cache } from "@defillama/sdk";
import { FetchOptions, IJSON } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";
import { filterPools, } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";

export default {
  chains: [CHAIN.HYPERLIQUID],
  fetch,
  version: 2,
  start: '2025-08-17',
  methodology: {
    Fees: "0.3% trading fees on all trades.",
    SupplySideRevenue: "LPs receive 60% of trading fees, creators receive 20% of trading fees.",
    Revenue: "20% of trading fees goes to the protocol.",
  }
}

async function fetch(fetchOptions: FetchOptions) {
  let factory = '0xeAF40318453a81993569B14b898AAC31Df6133fA'
  const swapEvent = 'event Swap (address indexed swappedFor, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'

  const { createBalances, getLogs, chain, api } = fetchOptions

  if (!chain) throw new Error('Wrong version?')


  factory = factory.toLowerCase()
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`

  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, })
  const pairIds = Object.keys(filteredPairs)
  api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${factory} Chain: ${chain}`)

  if (!pairIds.length) return {
    dailyVolume,
    dailyFees,
  }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: swapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = pairIds[index]
    let _fees = 0.003
    const [token0, token1] = pairObject[pair]
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * _fees, amount1: Number(log.amount1In) * _fees })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * _fees, amount1: Number(log.amount1Out) * _fees })
    })
  })

  const dailySupplySideRevenue = createBalances()
  const dailyRevenue = dailyFees.clone(0.2)
  dailySupplySideRevenue.add(dailyFees.clone(0.2), METRIC.CREATOR_FEES)
  dailySupplySideRevenue.add(dailyFees.clone(0.6), METRIC.LP_FEES)

  return { dailyVolume, dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue,dailyHoldersRevenue: 0,  }
}