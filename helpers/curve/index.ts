import { CallsParams } from "@defillama/sdk/build/types";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { formatAddress } from "../../utils/utils";
import { addOneToken } from "../prices";
import { CurveContractAbis, getAllPools, ICurveDexConfig, IDexPool, ITokenExchangeEvent } from "./helpers";

// export types and helpers
export * from "./helpers";

const FEE_DENOMINATOR = 1e10

async function getPoolTokens(options: FetchOptions, poolAddresses: Array<string>): Promise<{[key: string]: IDexPool}> {
  const pools: {[key: string]: IDexPool} = {}

  const coinsCalls: Array<CallsParams> = []
  for (const poolAddress of poolAddresses) {
    for (let i = 0; i < 5; i++) {
      coinsCalls.push({
        target: poolAddress,
        params: [i],
      })
    }
  }

  const coinsResults = await options.api.multiCall({
    abi: 'function coins(uint256) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const coinsOldResults = await options.api.multiCall({
    abi: 'function coins(int128) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const feeResults = await options.api.multiCall({
    abi: 'function fee() view returns (uint256)',
    calls: poolAddresses,
    permitFailure: true,
  })
  const adminFeeResults = await options.api.multiCall({
    abi: 'function admin_fee() view returns (uint256)',
    calls: poolAddresses,
    permitFailure: true,
  })

  for (let i = 0; i < poolAddresses.length; i++) {
    let tokens = coinsResults.slice(i * 5 , i * 5 + 5).filter(item => item !== null)
    if (tokens.length === 0) {
      tokens = coinsOldResults.slice(i * 5 , i * 5 + 5).filter(item => item !== null)
    }

    pools[poolAddresses[i]] = {
      pool: poolAddresses[i],
      tokens: tokens,
      feeRate: feeResults[i] ? Number(feeResults[i]) / FEE_DENOMINATOR : 0,
      adminFeeRate: adminFeeResults[i] ? Number(adminFeeResults[i]) / FEE_DENOMINATOR : 0,
    }
  }

  return pools;
}

export async function getCurveDexData(options: FetchOptions, config: ICurveDexConfig) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const tokenExchangeEvents: Array<ITokenExchangeEvent> = []
  const uniquePoolAddresses: {[key: string]: boolean} = {}

  const allPools = await getAllPools(options, config)

  // swap logs - main
  for (const [version, pools] of Object.entries(allPools)) {
    const swapLogs = await options.getLogs({
      targets: pools,
      eventAbi: CurveContractAbis[version].TokenExchange,
      flatten: true,
      onlyArgs: false,
    });

    for (const log of swapLogs) {
      uniquePoolAddresses[formatAddress(log.address)] = true
      tokenExchangeEvents.push({
        pool: formatAddress(log.address),
        sold_id: Number(log.args.sold_id),
        tokens_sold: Number(log.args.tokens_sold),
        bought_id: Number(log.args.bought_id),
        tokens_bought: Number(log.args.tokens_bought),
      })
    }
  }

  const pools = await getPoolTokens(options, Object.keys(uniquePoolAddresses))

  for (const event of tokenExchangeEvents) {
    const token0 = pools[event.pool].tokens[event.sold_id]
    const token1 = pools[event.pool].tokens[event.bought_id]
    const feeRate = pools[event.pool].feeRate
    const adminFeeRate = pools[event.pool].adminFeeRate
    const amount0 = Number(event.tokens_sold)
    const amount1 = Number(event.tokens_bought)

    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: amount0 * feeRate, amount1: amount1 * feeRate })
    addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: amount0 * feeRate * adminFeeRate, amount1: amount1 * feeRate * adminFeeRate })
  }

  return { dailyVolume, dailyFees, dailyRevenue }
}

export function getCurveExport(configs: {[key: string]: ICurveDexConfig}) {
  const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(configs).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async function(options: FetchOptions) {
            return await getCurveDexData(options, configs[chain])
          },
          start: configs[chain].start,
        }
      }
    }, {})
  };

  return adapter;
}
