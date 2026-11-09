import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";
import { filterPools, getUniV3LogAdapter } from "../helpers/uniswap";

const V2_FACTORY = '0x701F02d3133E14a9dfd94C399586aC22A05bCa25'
const V3_FACTORY = '0xC837ab0f8919Fb47f17b7cD302d88895032e5908'
const V2_SWAP_EVENT = 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
const V2_FEE = 0.003

const fetchV2 = async (fetchOptions: FetchOptions) => {
  const { createBalances, getLogs, api } = fetchOptions

  const pools: string[] = await api.call({
    abi: 'function getAllPools() view returns (address[])',
    target: V2_FACTORY,
  })

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  if (!pools.length) return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees }

  const token0s = await api.multiCall({ abi: 'address:token0', calls: pools })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools })
  const pairObject: Record<string, string[]> = {}
  pools.forEach((pool, i) => { pairObject[pool] = [token0s[i], token1s[i]] })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const pairIds = Object.keys(filteredPairs)
  if (!pairIds.length) return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: V2_SWAP_EVENT, flatten: false })
  allLogs.forEach((logs: any[], index: number) => {
    const pool = pairIds[index]
    const [token0, token1] = pairObject[pool]
    logs.forEach((log: any) => {
      addOneToken({ chain: CHAIN.STABLE, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain: CHAIN.STABLE, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain: CHAIN.STABLE, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * V2_FEE, amount1: Number(log.amount1In) * V2_FEE, label: METRIC.SWAP_FEES })
      addOneToken({ chain: CHAIN.STABLE, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * V2_FEE, amount1: Number(log.amount1Out) * V2_FEE, label: METRIC.SWAP_FEES })
    })
  })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees.clone(1, 'LP fees'),
  }
}

const fetchV3 = getUniV3LogAdapter({ factory: V3_FACTORY, revenueRatio: 0 })

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const v2 = await fetchV2(options)
  const v3 = await fetchV3(options)

  dailyVolume.addBalances(v2.dailyVolume)
  dailyFees.addBalances(v2.dailyFees)
  dailySupplySideRevenue.addBalances(v2.dailySupplySideRevenue)

  dailyVolume.addBalances(v3.dailyVolume)
  dailyFees.addBalances(v3.dailyFees)
  dailySupplySideRevenue.addBalances(v3.dailySupplySideRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.STABLE],
  fetch,
  start: '2026-08-03',
  methodology: {
    Volume: 'Swap volume across Openlaunch V2 (PoolFactoryV2) and V3 (UniswapV3Factory) pools.',
    Fees: 'Swap fees paid by users. V2 pools charge a fixed 0.3%; V3 pools use their configured fee tier.',
    UserFees: 'Swap fees paid by users. V2 pools charge a fixed 0.3%; V3 pools use their configured fee tier.',
    Revenue: 'Protocol makes no revenue — the protocol-fee switch is currently off.',
    ProtocolRevenue: 'Protocol makes no revenue — the protocol-fee switch is currently off.',
    SupplySideRevenue: '100% of swap fees are distributed to LPs.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Swap fees paid by users on Openlaunch V2 and V3 pools.',
    },
    UserFees: {
      [METRIC.SWAP_FEES]: 'Swap fees paid by users on Openlaunch V2 and V3 pools.',
    },
    SupplySideRevenue: {
      'LP fees': '100% of swap fees distributed to LPs.',
    },
  },
};

export default adapter;
