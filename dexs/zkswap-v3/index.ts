import { CHAIN } from "../../helpers/chains";
import { cache } from "@defillama/sdk";
import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { ethers } from "ethers";
import { filterPools } from '../../helpers/uniswap';
import { addOneToken } from "../../helpers/prices";

// const endpoints = {
//   // [CHAIN.ERA]: "https://gateway.thegraph.com/api/88ec88f205b57dce13befebc60ef5e0c/subgraphs/id/BeYacqRmNFgoNgPwqmD9CNzcH3Hqqy5WeQHhi3khQHPu"
//   [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49271/zf-exchange-v3-version-2/v0.1.8",
//   [CHAIN.SONIC]: "https://api.studio.thegraph.com/query/110179/sonic-v3/v1.2.2"
// }

// const graph = getGraphDimensions2({
//   graphUrls: endpoints,
//   totalVolume: {
//     factory: "factories",
//   },
//   totalFees: {
//     factory: "factories",
//   },
//   feesPercent: {
//     type: "fees",
//     Revenue: 33
//   }
// });

const factories: { [key: string]: string } = {
  [CHAIN.ERA]: '0x88add6a7e3c221e02f978b388a092c9fd8cd7850',
  [CHAIN.SONIC]: '0x6d977fcc945261b80d128a5a91cbf9a9148032a4',
}

function getRevenueRatio(fee: number): number {
  // Fee Structure - forked from Uniswap V3
  // Source: https://docs.zkswap.finance/highlights/fee
  if (fee === 0.0001) return 0.000033; // 33%
  if (fee === 0.0004) return 0.000136; // 34%
  if (fee === 0.002) return 0.00064; // 32%
  if (fee === 0.01) return 0.0032; // 32%
  return 0;
}

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const fetch = async (options: FetchOptions) => {
  const factory = String(factories[options.chain]).toLowerCase()
  const { createBalances, getLogs, chain, api } = options

  if (!chain) throw new Error('Wrong version?')

  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${factory}.json`
  const iface = new ethers.Interface([poolCreatedEvent])
  let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  logs = logs.map((log: any) => iface.parseLog(log)?.args)
  const pairObject: IJSON<string[]> = {}
  const fees: any = {}

  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
    fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
  })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }

  const allLogs = await getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = Object.keys(filteredPairs)[index]
    const [token0, token1] = pairObject[pair]
    const fee = fees[pair]
    logs.forEach((log: any) => {
      const revenueRatio = getRevenueRatio(fee);
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: log.amount0.toString() * revenueRatio, amount1: log.amount1.toString() * revenueRatio })
      addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: log.amount0.toString() * (fee - revenueRatio), amount1: log.amount1.toString() * (fee - revenueRatio) })
    })
  })

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapters: SimpleAdapter = {
  methodology: {
    Fees: "A trading fee, depending on the fee tier of the CL pool, is collected.",
    UserFees: "Users pay a percentage of the volume, which equal to the pool fee tier, for each swap.",
    Revenue: "Approximately 33% of the fees go to the protocol.",
    ProtocolRevenue: "Approximately 33% of the fees go to the protocol.",
    SupplySideRevenue: "Approximately 67% of the fees are distributed to liquidity providers (ZFLP token holders).",
  },
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ERA]: { start: '2024-11-18', },
    [CHAIN.SONIC]: { start: '2025-04-09', }
  }
}
export default adapters;
