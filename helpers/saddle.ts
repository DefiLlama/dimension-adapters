import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { METRIC } from "./metrics";

const abi = {
  "TokenSwap": "event TokenSwap(address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId)",
  "swapStorage": "function swapStorage() view returns (uint256 initialA, uint256 futureA, uint256 initialATime, uint256 futureATime, uint256 swapFee, uint256 adminFee, address lpToken)",
}

export async function getSaddleVolume(options: FetchOptions, pools: string[]) {
  const { createBalances, api, getLogs } = options;
  const feeInfo = await api.multiCall({  abi: abi.swapStorage, calls: pools,  });
  const tokens: any = []

  for (let i=0; i<4; i++) {
    const _tokens = await api.multiCall({  abi: 'function getToken(uint8) view returns (address)', calls: pools.map((pool) => ({ target: pool, params: i })), permitFailure: true });
    tokens.push(_tokens)
  }
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const logs = await getLogs({  targets: pools, eventAbi: abi.TokenSwap, flatten: false, });
  logs.forEach((log, i) => {
    const fees = feeInfo[i].swapFee /1e10
    const protocolFee = feeInfo[i].adminFee / 1e10
    log.forEach((_log: any) => {
      dailyVolume.add(tokens[_log.boughtId][i], _log.tokensBought)
      const feeAmount = Number(_log.tokensBought) * fees
      const protocolFeeAmount = feeAmount * protocolFee
      const lpRevenue = feeAmount - protocolFeeAmount
      dailyFees.add(tokens[_log.boughtId][i], feeAmount, METRIC.SWAP_FEES)
      dailyRevenue.add(tokens[_log.boughtId][i], protocolFeeAmount, METRIC.PROTOCOL_FEES)
      dailySupplySideRevenue.add(tokens[_log.boughtId][i], lpRevenue, METRIC.LP_FEES)
    })
  })
  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }
}


type SaddleConfig = {
  pools: string[],
  start?: string,
}

const methodology = {
  Volume: 'Total token swap volume across the configured pools.',
  Fees: 'Swap fees paid by users based on each pool\'s configured swap fee.',
  Revenue: 'The admin share of swap fees retained by the protocol.',
  SupplySideRevenue: 'The remaining swap fees distributed to liquidity providers.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Swap fees paid by users.',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'The admin share of swap fees retained by the protocol.',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'The remaining swap fees distributed to liquidity providers.',
  },
}

export function getSaddleExports(config: IJSON<SaddleConfig>, { runAsV1 = false, pullHourly = true, ...otherRootOptions } = {}) {
  const exportObject: BaseAdapter = {}

  Object.entries(config).forEach(([chain, chainConfig]) => {
    const fetch: any = (options: FetchOptions) => getSaddleVolume(options, chainConfig.pools)
    exportObject[chain] = {
      fetch,
      start: chainConfig.start,
    }
  })

  if (runAsV1)
    return { adapter: exportObject, version: 1 } as SimpleAdapter

  return {
    methodology,
    breakdownMethodology,
    ...otherRootOptions,
    adapter: exportObject,
    version: 2,
    pullHourly,
  } as SimpleAdapter

}
