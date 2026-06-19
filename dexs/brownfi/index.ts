import { CHAIN } from "../../helpers/chains";
import { filterPools } from "../../helpers/uniswap";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";
import { cache } from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

const chainConfig: Record<string, { factory: string, start: string }> = {
  [CHAIN.BERACHAIN]: {
    factory: "0x43AB776770cC5c739adDf318Af712DD40918C42d",
    start: '2025-07-04',
  },
  [CHAIN.BASE]: {
    factory: "0x43AB776770cC5c739adDf318Af712DD40918C42d",
    start: '2025-07-01',
  },
  [CHAIN.ARBITRUM]: {
    factory: "0xD05395a6b6542020FBD38D31fe1377130b35592E",
    start: '2025-07-01',
  },
  [CHAIN.HYPERLIQUID]: {
    factory: "0x3240853b71c89209ea8764CDDfA3b81766553E55",
    start: '2025-07-19',
  },
  [CHAIN.LINEA]: {
    factory: "0x43AB776770cC5c739adDf318Af712DD40918C42d",
    start: '2025-09-05',
  },
  [CHAIN.BSC]: {
    factory: "0x43AB776770cC5c739adDf318Af712DD40918C42d",
    start: '2025-07-01',
  },
  [CHAIN.MONAD]: {
    factory: "0x68bc42F886ddf6a4b0B90a9496493dA1f8304536",
    start: '2025-12-02',
  },
};

const brownfiV2SwapEvent = "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, uint price0, uint price1, address indexed to)"

const abis = {
  fees: "function fee() external view returns (uint32)",
  protocolFee: "function protocolFee() external view returns (uint64)"
};

const fetch = async (options: FetchOptions) => {
  const factory = chainConfig[options.chain].factory;
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
  _fees.forEach((fee: any, i: number) => { if (fee !== null) fees[pairs[i]] = fee / 1e8 })
  let _protocolFees = await api.multiCall({ abi: abis.protocolFee, calls: pairs.map((pair: any) => pair), permitFailure: true })
  _protocolFees.forEach((fee: any, i: number) => { if (fee !== null) protocolFees[pairs[i]] = fee / 1e8 })

  const dailyVolume = createBalances()
  const feesRaw = createBalances()
  const revenue = createBalances()
  const supplySideRevenue = createBalances()
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, minUSDValue: 100 })
  const pairIds = Object.keys(filteredPairs)

  if (!pairIds.length) return {
    dailyVolume,
    dailyFees: 0,
    dailyUserFees: 0,
    dailyRevenue: 0,
    dailySupplySideRevenue: 0,
    dailyProtocolRevenue: 0,
  }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: brownfiV2SwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = pairIds[index]
    const fee = fees[pair]
    const protocolFee = protocolFees[pair]
    const [token0, token1] = pairObject[pair]
    const feeRate = fee / (1 + fee)
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: feesRaw, token0, token1, amount0: Number(log.amount0In) * feeRate, amount1: Number(log.amount1In) * feeRate })
      addOneToken({ chain, balances: revenue, token0, token1, amount0: Number(log.amount0In) * feeRate * protocolFee, amount1: Number(log.amount1In) * feeRate * protocolFee })
      addOneToken({ chain, balances: supplySideRevenue, token0, token1, amount0: Number(log.amount0In) * feeRate * (1 - protocolFee), amount1: Number(log.amount1In) * feeRate * (1 - protocolFee) })
    })
  })

  const dailyFees = feesRaw.clone(1, METRIC.SWAP_FEES)
  const dailyRevenue = revenue.clone(1, "Swap Fees to Protocol")
  const dailySupplySideRevenue = supplySideRevenue.clone(1, "Swap Fees to Liquidity Providers")

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Fees from swap transactions.",
  UserFees: "Fees from swap transactions.",
  Revenue: "Protocol share from swap fees.",
  ProtocolRevenue: "Protocol share from swap fees.",
  SupplySideRevenue: "Liquidity providers share from swap fees.",
  HoldersRevenue: "Holders do not earn any revenue.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees from swap transactions.",
  },
  Revenue: {
    "Swap Fees to Protocol": "Protocol share from swap fees.",
  },
  ProtocolRevenue: {
    "Swap Fees to Protocol": "Protocol share from swap fees.",
  },
  SupplySideRevenue: {
    "Swap Fees to Liquidity Providers": "Liquidity providers share from swap fees.",
  },
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapters;
