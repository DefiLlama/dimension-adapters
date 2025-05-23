import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";

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
      dailyFees.add(tokens[_log.boughtId][i], feeAmount)
      dailyRevenue.add(tokens[_log.boughtId][i], protocolFeeAmount)
      dailySupplySideRevenue.add(tokens[_log.boughtId][i], lpRevenue)
    })
  })
  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }
}


type SaddleConfig = {
  pools: string[],
  start?: string|number,
}


export function getSaddleExports(config: IJSON<SaddleConfig>, { runAsV1 = false } = {}) {
  const exportObject: BaseAdapter = {}
  const exportObjectV1: BaseAdapter = {}


  Object.entries(config).map(([chain, chainConfig]) => {
    const fetch: any = (options: FetchOptions) => getSaddleVolume(options, chainConfig.pools)
    exportObject[chain] = { fetch }
    exportObjectV1[chain] = {
      fetch: async (_: any, _1: any, options: FetchOptions) => fetch(options),
      start: chainConfig.start,
    }
  })


  if (runAsV1)
    return { adapter: exportObjectV1, version: 1 } as SimpleAdapter


  return { adapter: exportObject, version: 2 } as SimpleAdapter

}