import { CHAIN } from '../helpers/chains'
import { getGraphDimensions2 } from '../helpers/getUniSubgraph'
import BigNumber from 'bignumber.js'
import type { FetchOptions } from '../adapters/types'

import potatoswapV3 from './potatoswap-v3'

const methodology = {
  Fees: "Sum of swap fees on PotatoSwap. Uses v3 API adapter when v2 subgraph is unavailable.",
  UserFees: "Same as Fees.",
  Revenue: "Portion of fees directed to the protocol when enabled on pools.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "Fees paid to LPs, computed as Fees minus ProtocolRevenue.",
}

const v2Graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.XLAYER]: "https://indexer.potatoswap.finance/subgraphs/id/Qmaeqine8JeSiKV3QCi6JJqzDGryF7D8HCJdqcYxW7nekw",
  },
  totalVolume: {
    factory: 'pancakeFactories',
  },
  feesPercent: {
    type: "volume" as const,
    Fees: 0.25,
    UserFees: 0.25,
    ProtocolRevenue: 0,
    HoldersRevenue: 0.08,
    SupplySideRevenue: 0.17,
    Revenue: 0.08,
  },
})

function bn(v: any) {
  if (v === undefined || v === null) return new BigNumber(0)
  return new BigNumber(v.toString())
}

async function fetch(timestamp: number, chainBlocks: any, options: FetchOptions) {
  let v2Res: any = null

  const v3Adapter = (potatoswapV3 as any).adapter?.[CHAIN.XLAYER]
  if (!v3Adapter?.fetch) throw new Error("potatoswap v3 fetch not found")

  try {
    v2Res = await (v2Graphs as any)(timestamp, chainBlocks, options)
  } catch (e) {
    v2Res = null
  }

  const v3Res = await v3Adapter.fetch(timestamp, chainBlocks, options)

  if (!v2Res) return v3Res

  return {
    dailyVolume: bn(v2Res.dailyVolume).plus(bn(v3Res.dailyVolume)).toString(),
    dailyFees: bn(v2Res.dailyFees).plus(bn(v3Res.dailyFees)).toString(),
    dailyUserFees: bn(v2Res.dailyUserFees).plus(bn(v3Res.dailyUserFees)).toString(),
    dailyRevenue: bn(v2Res.dailyRevenue).plus(bn(v3Res.dailyRevenue)).toString(),
    dailyProtocolRevenue: bn(v2Res.dailyProtocolRevenue).plus(bn(v3Res.dailyProtocolRevenue)).toString(),
    dailySupplySideRevenue: bn(v2Res.dailySupplySideRevenue).plus(bn(v3Res.dailySupplySideRevenue)).toString(),
  }
}

export default {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      start: '2024-04-23',
      runAtCurrTime: true,
    },
  },
}
