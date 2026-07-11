import { Dependencies, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { filterPools } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";

const chainConfig: Record<string, { factory: string, start: string, fromBlock: number }> = {
  [CHAIN.MEGAETH]: {
    factory: '0xAc303930F2f7A78BBB037f3f4622Bd02f5545B9a',
    start: '2025-11-13',
    fromBlock: 252184,
  },
  [CHAIN.MONAD]: {
    factory: '0x7F03effbd7ceB22A3f80Dd468f67eF27826acD85',
    start: '2025-11-20',
    fromBlock: 36750940,
  },
  [CHAIN.INTUITION]: {
    factory: '0xE0847747A8570ae9916Ab00b7991518Bf958897B',
    start: '2025-11-05',
    fromBlock: 43984,
  },
  [CHAIN.STABLE]: {
    factory: '0xB1809ED8C93A05C78570B3dc7fb538c0c3102214',
    start: '2025-12-03',
    fromBlock: 4255895,
  },
  [CHAIN.MERLIN]: {
    factory: '0x075BDEefe25Dc0AC3bcA303f317638F801a6c2aE',
    start: '2025-12-14',
    fromBlock: 26156323
  },
  // [CHAIN.ARC]: {
  //   factory: '0xE7d4E64079FE467A21801B36Ccc6D9B3F66BD372',

  // },
  [CHAIN.ROBINHOOD]: {
    factory: '0xD9eC2db5f3D1b236843925949fe5bd8a3836FCcB',
    start: '2026-06-16',
    fromBlock: 61688,
  }
}

const TOKEN_LAUNCHED_EVENT = 'event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)'
const POOL_FEE_FUNCTION = 'function poolFee() external view returns (uint24)'
const UNI_V3_SWAP_EVENT = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const BPS = 10000;
const MIN_TVL = 1000;

function buildDuneQuery(blockchain: string, options: FetchOptions): string {
  return `
    SELECT project_contract_address AS pool, t.token, CAST(SUM(t.amount) AS VARCHAR) AS amount
    FROM dex.trades
    CROSS JOIN UNNEST(
      ARRAY[token_bought_address, token_sold_address],
      ARRAY[token_bought_amount_raw, token_sold_amount_raw]
    ) AS t (token, amount)
    WHERE blockchain = '${blockchain}'
      AND project = 'uniswap'
      AND version = '3'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY project_contract_address, t.token`;
}

async function loadFilteredLaunches(options: FetchOptions) {
  const { factory, fromBlock } = chainConfig[options.chain]
  const tokenLaunchedLogs = await options.getLogs({
    target: factory,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock,
    cacheInCloud: true,
  })

  const pairObject: IJSON<string[]> = {}
  const poolToLaunch = new Map<string, typeof tokenLaunchedLogs[number]>()
  for (const log of tokenLaunchedLogs) {
    const token = log.token.toLowerCase()
    const pairToken = log.pairToken.toLowerCase()
    const [token0, token1] = token < pairToken ? [token, pairToken] : [pairToken, token]
    const pool = log.pool.toLowerCase()
    pairObject[pool] = [token0, token1]
    poolToLaunch.set(pool, log)
  }
  const filteredPairs = await filterPools({
    api: options.api,
    pairs: pairObject,
    createBalances: options.createBalances,
    minUSDValue: MIN_TVL,
    maxPairSize: 1_000_000,
  })

  const filteredPoolToLaunch = new Map<string, typeof tokenLaunchedLogs[number]>()
  for (const pool of Object.keys(filteredPairs)) {
    filteredPoolToLaunch.set(pool, poolToLaunch.get(pool)!)
  }

  return filteredPoolToLaunch
}

function addCreatorFeesFromAmounts(
  options: FetchOptions,
  creatorFees: ReturnType<FetchOptions['createBalances']>,
  feeBps: number,
  tradeTokens: string[],
  amounts: string[],
) {
  const token0 = tradeTokens[0]
  const token1 = tradeTokens[1] ?? tradeTokens[0]
  const amount0 = amounts[0]
  const amount1 = amounts[1] ?? '0'
  const feesInPercentage = feeBps / BPS
  addOneToken({
    balances: creatorFees,
    chain: options.chain,
    token0,
    token1,
    amount0: Number(amount0) * feesInPercentage / 100,
    amount1: Number(amount1) * feesInPercentage / 100,
  })
}

async function fetchFromDune(options: FetchOptions) {
  const creatorFees = options.createBalances()
  const poolToLaunch = await loadFilteredLaunches(options)

  const rows: any[] = await queryDune('3996608', { fullQuery: buildDuneQuery('robinhood', options) }, options)

  const byPool: Record<string, { tokens: string[]; amounts: string[] }> = {}
  for (const row of rows) {
    if (!row.pool || !row.token || !row.amount) continue
    const pool = row.pool.toLowerCase()
    if (!poolToLaunch.has(pool)) continue
    const entry = (byPool[pool] ??= { tokens: [], amounts: [] })
    entry.tokens.push(row.token)
    entry.amounts.push(row.amount)
  }

  const pools = Object.keys(byPool)
  if (pools.length) {
    const poolFees = await options.api.multiCall({
      calls: pools.map((pool) => poolToLaunch.get(pool)!.token),
      abi: POOL_FEE_FUNCTION,
      permitFailure: true,
    })

    pools.forEach((pool, i) => {
      if (!poolFees[i]) return
      addCreatorFeesFromAmounts(
        options,
        creatorFees,
        Number(poolFees[i]),
        byPool[pool].tokens,
        byPool[pool].amounts,
      )
    })
  }

  return buildResult(creatorFees)
}

async function fetchFromLogs(options: FetchOptions) {
  const creatorFees = options.createBalances()
  const poolToLaunch = await loadFilteredLaunches(options)
  const liquidityPools = [...poolToLaunch.keys()]
  const tokens = liquidityPools.map((pool) => poolToLaunch.get(pool)!.token)

  const poolFees = await options.api.multiCall({
    calls: tokens,
    abi: POOL_FEE_FUNCTION,
    permitFailure: true,
  })

  if (!liquidityPools.length) return buildResult(creatorFees)

  const tokenSwaps = await options.getLogs({
    targets: liquidityPools,
    eventAbi: UNI_V3_SWAP_EVENT,
    flatten: false,
  })

  for (const [index, logs] of tokenSwaps.entries()) {
    if (!poolFees[index]) continue
    const launch = poolToLaunch.get(liquidityPools[index])!
    const feesInPercentage = poolFees[index] / BPS
    const token = launch.token.toLowerCase()
    const pairToken = launch.pairToken.toLowerCase()
    const [token0, token1] = token < pairToken ? [token, pairToken] : [pairToken, token]
    for (const log of logs) {
      const amount0 = Number(log.amount0) * feesInPercentage / 100
      const amount1 = Number(log.amount1) * feesInPercentage / 100
      await addOneToken({ balances: creatorFees, chain: options.chain, token0, amount0, token1, amount1 })
    }
  }

  return buildResult(creatorFees)
}

function buildResult(creatorFees: ReturnType<FetchOptions['createBalances']>) {
  const dailyFees = creatorFees.clone(1, "Swap Fees")
  const dailySupplySideRevenue = creatorFees.clone(1, "Swap Fees to Creator")

  return {
    dailyFees,
    dailyRevenue: 0, // disabled for now
    dailySupplySideRevenue,
  }
}

async function fetch(options: FetchOptions) {
  if (options.chain === CHAIN.ROBINHOOD) return fetchFromDune(options)
  return fetchFromLogs(options)
}

const methodology = {
  Fees: "Includes uniswap swap fees for tokens graduated from noxa fun (filtered by pools with >$5k TVL)",
  Revenue: "Revenue is disabled for now",
  SupplySideRevenue: "All fees collected from swaps are distributed to the creator of the token",
}

const breakdownMethodology = {
  "Swap Fees": "Uniswap swap fees for tokens graduated from noxa fun",
  "Swap Fees to Creator": "All fees collected from swaps are distributed to the creator of the token",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  doublecounted: true, //uniswap
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
}

export default adapter;
