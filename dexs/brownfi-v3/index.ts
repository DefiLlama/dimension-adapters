import { CHAIN } from "../../helpers/chains";
import { filterPools } from "../../helpers/uniswap";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";
import { cache } from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

const chainConfig: Record<string, { factory: string, pairConfig: string, start: string }> = {
  [CHAIN.BERACHAIN]: {
    factory: "0x6Ccf36d3EaE84b2eB608704070B90f4419BBcD28",
    pairConfig: "0x4955e0d8A7f25Ba83216946C17fe791D8C49c43a",
    start: '2026-06-04',
  },
  [CHAIN.HYPERLIQUID]: {
    factory: "0x6A4Bd89709b67eC846F02cF9E95A0dd2Fb515720",
    pairConfig: "0x1Fcd5D79A1AFdF2456947B3476A1f61096AD7771",
    start: '2026-06-09',
  },
  [CHAIN.ARBITRUM]: {
    factory: "0xe49805412EDFDF4C458B297e7C1534588Fa3F1F0",
    pairConfig: "0x13D71a45b5C3C240c5D7b502446baa9598b0cA09",
    start: '2026-06-22',
  },
  [CHAIN.LINEA]: {
    factory: "0xD9a702839510ee2859bCE697F51Aae49bF8949d7",
    pairConfig: "0xEf83E21b3C45e75cC29ae6aC493dB3821eD87B83",
    start: '2026-06-22',
  },
};

const brownfiV3SwapEvent = "event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,uint amount0OutRequested,uint amount1OutRequested,uint pythPrice0,uint pythPrice1,uint ammPrice,uint adjPrice,uint sPrice0,uint sPrice1,address indexed to)"

const abis = {
  getConfig: "function getConfig(address pair) external view returns (tuple(uint256 kB, uint256 kQ, uint64 lambda, uint32 fee, uint32 feeSplit, uint32 compress, uint32 sSell, uint32 sBuy, uint32 fixS, uint32 disThreshold, uint32 sBound, uint32 pythWeight, uint32 gamma))"
};

const fetch = async (options: FetchOptions) => {
  const { factory, pairConfig } = chainConfig[options.chain];
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

  const configs = await api.multiCall({ target: pairConfig, abi: abis.getConfig, calls: pairs, permitFailure: true })
  configs.forEach((config: any, i: number) => {
    if (!config) return;
    fees[pairs[i]] = Number(config.fee ?? config[3]) / 1e8
    protocolFees[pairs[i]] = Number(config.feeSplit ?? config[4]) / 1e8
  })

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

  const allLogs = await getLogs({ targets: pairIds, eventAbi: brownfiV3SwapEvent, flatten: false })
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