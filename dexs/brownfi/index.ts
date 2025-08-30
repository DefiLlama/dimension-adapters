import { CHAIN } from "../../helpers/chains";
import { filterPools } from "../../helpers/uniswap";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";
import { cache } from "@defillama/sdk";

export const brownfiV2Factories: { [key: string]: any } = {
  [CHAIN.BERACHAIN]: {
    factory: "0x43AB776770cC5c739adDf318Af712DD40918C42d"
  },
  [CHAIN.BASE]: {
    factory: "0x43AB776770cC5c739adDf318Af712DD40918C42d"
  },
  [CHAIN.ARBITRUM]: {
    factory: "0xD05395a6b6542020FBD38D31fe1377130b35592E"
  },
  [CHAIN.HYPERLIQUID]: {
    factory: "0x3240853b71c89209ea8764CDDfA3b81766553E55"
  },
};

const brownfiV2SwapEvent = "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, uint price0, uint price1, address indexed to)"

const abis = {
  fees: "function fee() external view returns (uint32)",
  protocolFee: "function protocolFee() external view returns (uint64)"
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const factory = brownfiV2Factories[options.chain].factory;
  const { createBalances, getLogs, chain, api } = options
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory.toLowerCase()}-${chain}.json`

  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  const pairObject: { [key: string]: string[] } = {}
  const fees: any = {}
  const protocolFees: any = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
    fees[pair] = 0
    protocolFees[pair] = 0
  })

  let _fees = await api.multiCall({ abi: abis.fees, calls: pairs.map((pair: any) => pair), permitFailure: true })
  _fees.filter(fee => fee !== null).forEach((fee: any, i: number) => fees[pairs[i]] = fee / 1e8)
  let _protocolFees = await api.multiCall({ abi: abis.protocolFee, calls: pairs.map((pair: any) => pair), permitFailure: true })
  _protocolFees.filter(fee => fee !== null).forEach((fee: any, i: number) => protocolFees[pairs[i]] = fee / 1e8)

  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, minUSDValue: 100 })
  const pairIds = Object.keys(filteredPairs)

  if (!pairIds.length) return {
    dailyVolume,
    dailyFees,
  }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: brownfiV2SwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = pairIds[index]
    const fee = fees[pair]
    const protocolFee = protocolFees[pair]
    const [token0, token1] = pairObject[pair]
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * fee, amount1: Number(log.amount1In) * fee })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * fee, amount1: Number(log.amount1Out) * fee })
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: (Number(log.amount0In) * fee) * protocolFee, amount1: Number(log.amount1In) * fee })
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: (Number(log.amount0Out) * fee) * protocolFee, amount1: Number(log.amount1Out) * fee })
    })
  })
  return { 
    dailyVolume, 
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: "0",
  };
};

const methodology = {
  Fees: "Fees from swap transactions.",
  UserFees: "Fees from swap transactions.",
  Revenue: "Protocol share from swap fees.",
  ProtocolRevenue: "Protocol share from swap fees.",
  SupplySideRevenue: "Liquidity providers share from swap fees.",
  HoldersRevenue: "Holders does not earn any revenue.",
}

const adapters: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BERACHAIN, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.HYPERLIQUID],
  methodology,
};

export default adapters;
