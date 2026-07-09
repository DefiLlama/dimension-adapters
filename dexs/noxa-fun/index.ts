import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
    fromBlock: 61688
  }
}

const TOKEN_LAUNCHED_EVENT = 'event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)'
const POOL_FEE_FUNCTION = 'function poolFee() external view returns (uint24)'
const UNI_V3_SWAP_EVENT = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const BPS = 10000;

async function fetch(options: FetchOptions) {
  const { factory, fromBlock } = chainConfig[options.chain]
  const creatorFees = options.createBalances()

  const tokenLaunchedLogs = await options.getLogs({
    target: factory,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock,
    cacheInCloud: true,
  })

  const liquidityPools = tokenLaunchedLogs.map(log => log.pool)
  const tokens = tokenLaunchedLogs.map(log => log.token)

  const poolFees = await options.api.multiCall({
    calls: tokens,
    abi: POOL_FEE_FUNCTION,
    permitFailure: true,
  })

  const tokenSwaps = await options.getLogs({
    targets: liquidityPools,
    eventAbi: UNI_V3_SWAP_EVENT,
    flatten: false,
  })

  for (const [index, logs] of tokenSwaps.entries()) {
    if (!poolFees[index]) continue
    const feesInPercentage = poolFees[index] / BPS;
    const token = tokenLaunchedLogs[index].token.toLowerCase()
    const pairToken = tokenLaunchedLogs[index].pairToken.toLowerCase()
    const [token0, token1] = token < pairToken ? [token, pairToken] : [pairToken, token]
    for (const log of logs) {
      const amount0 = Number(log.amount0) * feesInPercentage / 100;
      const amount1 = Number(log.amount1) * feesInPercentage / 100;
      await addOneToken({ balances: creatorFees, chain: options.chain, token0, amount0, token1, amount1 })
    }
  }

  const dailyFees = creatorFees.clone(1, "Swap Fees")
  const dailySupplySideRevenue = creatorFees.clone(1, "Swap Fees to Creator")

  return {
    dailyFees,
    dailyRevenue: 0, // disabled for now
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Includes uniswap swap fees for tokens graduated from noxa fun",
  Revenue: "Revenue is disabled for now",
  SupplySideRevenue: "All fees collected from swaps are distributed to the creator of the token",
}

const breakdownMethodology = {
  "Swap Fees": "Uniswap swap fees for tokens graduated from noxa fun",
  "Swap Fees to Creator": "All fees collected from swaps are distributed to the creator of the token",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true, //uniswap
  methodology,
  breakdownMethodology,
}

export default adapter;