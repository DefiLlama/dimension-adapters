import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const BFACTORY = '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd'
const BFACTORY_DEPLOY_BLOCK = 9562480

const abi = {
  LOG_NEW_POOL: 'event LOG_NEW_POOL(address indexed caller, address indexed pool)',
  LOG_SWAP: 'event LOG_SWAP(address indexed caller, address indexed tokenIn, address indexed tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut)',
  getSwapFee: 'uint256:getSwapFee',
}

// Dust pools get manipulated: WETH-AKITA and DAI-YELD pools recorded ~$100M/day of
// fake value when priced off pool spot prices. So a swap is counted only when one
// side is a trusted numeraire, valued by that side's real amount and market price.
// The fee is charged on tokenIn at the pool's swapFee fraction (1e18 = 100%).
const NUMERAIRES = new Set([
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
  '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
  '0xba100000625a3754423978a60c9317c58a424e3d', // BAL
])

const LABELS = {
  SwapFees: 'Token Swap Fees',
  SwapFeesToLPs: 'Token Swap Fees To LPs',
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, api } = options
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const poolLogs = await getLogs({ target: BFACTORY, eventAbi: abi.LOG_NEW_POOL, fromBlock: BFACTORY_DEPLOY_BLOCK, cacheInCloud: true })
  const pools = new Set<string>(poolLogs.map((log: any) => log.pool.toLowerCase()))

  const allLogs = await getLogs({ eventAbi: abi.LOG_SWAP, noTarget: true, entireLog: true, parseLog: true })
  const swaps = allLogs
    .filter((log: any) => pools.has(log.source.toLowerCase()))
    .map((log: any) => ({
      pool: log.source.toLowerCase(),
      tx: log.transactionHash.toLowerCase(),
      tokenIn: log.parsedLog.args.tokenIn.toLowerCase(),
      tokenOut: log.parsedLog.args.tokenOut.toLowerCase(),
      amountIn: log.parsedLog.args.tokenAmountIn,
      amountOut: log.parsedLog.args.tokenAmountOut,
    }))

  // Wash loops execute both directions of the same pool inside one transaction
  // (hundreds of micro round trips per tx, netting to ~zero) - drop every swap of
  // a (tx, pool) group that traded both directions. Real arbitrage cycles route
  // through different pools and are unaffected.
  const txPoolDirections: { [key: string]: Set<string> } = {};
  for (const swap of swaps) {
    const key = `${swap.tx}-${swap.pool}`
    if (!txPoolDirections[key]) txPoolDirections[key] = new Set();
    txPoolDirections[key].add(`${swap.tokenIn}->${swap.tokenOut}`);
  }
  const cleanSwaps = swaps.filter((swap) => !txPoolDirections[`${swap.tx}-${swap.pool}`].has(`${swap.tokenOut}->${swap.tokenIn}`))

  const activePools = [...new Set(cleanSwaps.map((swap) => swap.pool))]
  const swapFees = await api.multiCall({ abi: abi.getSwapFee, calls: activePools, permitFailure: true })
  const swapFeeByPool: { [pool: string]: number } = {}
  activePools.forEach((pool, i) => { swapFeeByPool[pool] = Number(swapFees[i] ?? 0) / 1e18 })

  for (const swap of cleanSwaps) {
    const swapFee = swapFeeByPool[swap.pool]
    if (NUMERAIRES.has(swap.tokenIn)) {
      dailyVolume.add(swap.tokenIn, swap.amountIn)
      if (swapFee > 0 && swapFee < 1)
        dailyFees.add(swap.tokenIn, Number(swap.amountIn) * swapFee, LABELS.SwapFees)
    } else if (NUMERAIRES.has(swap.tokenOut)) {
      dailyVolume.add(swap.tokenOut, swap.amountOut)
      // fee was taken on tokenIn; tokenOut is a post-fee amount, so gross it up
      if (swapFee > 0 && swapFee < 1)
        dailyFees.add(swap.tokenOut, Number(swap.amountOut) * swapFee / (1 - swapFee), LABELS.SwapFees)
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: "0",
    dailyProtocolRevenue: "0",
    dailySupplySideRevenue: dailyFees.clone(1, LABELS.SwapFeesToLPs),
  }
};

const methodology = {
  UserFees: "Trading fees paid by users, set per pool by the pool creator (0.0001% to 10%)",
  Fees: "All swap fees collected from trades across Balancer V1 pools",
  Revenue: "Balancer V1 takes no protocol fee, so protocol revenue is zero",
  ProtocolRevenue: "Balancer V1 takes no protocol fee, so protocol revenue is zero",
  SupplySideRevenue: "All swap fees are distributed to pool liquidity providers",
}

const breakdownMethodology = {
  UserFees: {
    [LABELS.SwapFees]: "Swap fees paid by users on each trade",
  },
  Fees: {
    [LABELS.SwapFees]: "All swap fees collected from trades across Balancer V1 pools",
  },
  SupplySideRevenue: {
    [LABELS.SwapFeesToLPs]: "100% of swap fees are distributed to pool liquidity providers",
  },
}

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2020-02-27',
    },
  },
};

export default adapter;
