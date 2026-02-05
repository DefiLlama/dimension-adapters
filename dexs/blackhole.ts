import { CHAIN } from "../helpers/chains"
import { FetchV2, IJSON, SimpleAdapter } from "../adapters/types"
import { cache } from "@defillama/sdk"
import { filterPools } from "../helpers/uniswap"
import { addOneToken } from "../helpers/prices"

const GaugeManager = '0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6'
const Factory = '0xfe926062fb99ca5653080d6c14fe945ad68c265c'
const SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

// FeesEvent emits the real fee amounts deducted during each swap.
// Since fees for Blackhole pairs can change over time, these events are the most accurate method to track fees/revenue.
const FeesEvent = `event Fees(address indexed sender, uint amount0, uint amount1)`

const fetch: FetchV2 = async (fetchOptions) => {
  const { createBalances, getLogs, chain, api } = fetchOptions

  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${Factory}-${chain}.json`

  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const pairIds = Object.keys(filteredPairs)
  api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${Factory} Chain: ${chain}`)

  if (!pairIds.length) return {
    dailyVolume: 0,
    dailyFees: 0,
    dailyUserFees: 0,
    dailyRevenue: 0,
    dailySupplySideRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  }

  const lpSupplies = await api.multiCall({
    abi: 'uint256:totalSupply',
    calls: pairIds,
    permitFailure: false,
  })
  const gauges = await api.multiCall({
    abi: 'function gauges(address) view returns (address)',
    target: GaugeManager,
    calls: pairIds.map(pairid => ({ params: [pairid] })),
    permitFailure: true,
  })
  const gaugeSupplies = await api.multiCall({
    abi: 'uint256:totalSupply',
    calls: gauges,
    permitFailure: true,
  })

  const allSwapLogs = await getLogs({ targets: pairIds, eventAbi: SwapEvent, flatten: false })
  const allFeesLogs = await getLogs({ targets: pairIds, eventAbi: FeesEvent, flatten: false })

  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  // Get daily volume from Swap events.
  allSwapLogs.forEach((logs, index) => {
    if (!logs.length) return

    const pair = pairIds[index]
    const [token0, token1] = pairObject[pair]

    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
    })
  })

  // Fee / revenue metrics from Fees events.
  //
  // Blackhole basic pools distribute swap fees as follows:
  // - Unstaked LPs receive all fees proportional to their LP token balance.
  // - Staked LPs deposit LP tokens into a Gauge, and their fee share is routed to veBLACK voters as bribes.
  //
  // Each Fees event already includes the exact fee collected for that swap (including any referral/staking-NFT cuts).
  // To split these fees between supply-side LPs and veBLACK holders, we estimate the share of LP tokens
  // held by the gauge at the time of execution using the current ratio:
  //
  // revenueShare = gaugeSupply / totalLpSupply
  //
  // This ratio is an approximation because LP balances can change throughout the day.
  // Computing precise ratios per swap is far too expensive.
  allFeesLogs.forEach((logs: any, index) => {
    if (!logs.length) return

    const pair = pairIds[index]
    const [token0, token1] = pairObject[pair]
    const gaugeSupply = Number(gaugeSupplies[index] ?? 0)
    const lpSupply = Number(lpSupplies[index] ?? 0)

    // revenueShare determines the portion of fees attributed to staked LPs (=> veBLACK holders).
    // supplySideRevenueShare determines the portion attributed to unstaked LPs.
    const revenueShare = lpSupply > 0 ? gaugeSupply / lpSupply : 0
    const supplySideRevenueShare = 1 - revenueShare

    logs.forEach((log: any) => {
      const amount0 = Number(log.amount0)
      const amount1 = Number(log.amount1)

      // Exactly one of amount0 / amount1 is non-zero for a FeesEvent.
      if (amount0 > 0) {
        dailyFees.add(token0, amount0)
        dailyRevenue.add(token0, amount0 * revenueShare)
        dailySupplySideRevenue.add(token0, amount0 * supplySideRevenueShare)
      } else {
        dailyFees.add(token1, amount1)
        dailyRevenue.add(token1, amount1 * revenueShare)
        dailySupplySideRevenue.add(token1, amount1 * supplySideRevenueShare)
      }
    })
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "All swap fees paid by traders.",
    UserFees: "All swap fees paid by traders.",
    SupplySideRevenue: "Portion of swap fees paid out to unstaked LPs.",
    Revenue: "Portion of swap fees attributed to staked LPs, which are routed through the Gauge and distributed to veBLACK voters as bribes.",
    ProtocolRevenue: "No protocol revenue.",
    HoldersRevenue: "Portion of swap fees attributed to staked LPs, which are routed through the Gauge and distributed to veBLACK voters as bribes.",
  },
  chains: [CHAIN.AVAX],
  fetch,
}

export default adapter
