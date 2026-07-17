import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";

const factories = [
  "0x0c37a24F5D23A486FA692d1500881d698B1F77a4", //old
  "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB", //new
];

const lpLockers = [
  "0x31ca5E101941A93A7DD6d0497928700625CF54B5", //old
  "0x736D76699C26D0d966744cAe304C000d471f7F35", //new
];

const MIN_TVL = 500;
const tokenLunchedEvent = "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)";
const swapEvent = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const SWAP_FEE = 1 / 100;

async function fetch(options: FetchOptions) {
  const feesFromSwap = options.createBalances();
  const swapFeesToCreator = options.createBalances();
  const swapFeesToProtocol = options.createBalances();

  const protocolFeeShares = await options.api.multiCall({
    calls: lpLockers,
    abi: "uint256:protocolFeeShare"
  })

  const tokenLaunchedLogs = await options.getLogs({
    targets: factories,
    eventAbi: tokenLunchedEvent,
    flatten: false,
    cacheInCloud: true,
    fromBlock: 8600612
  })

  const poolsFromNewFactory = new Set(tokenLaunchedLogs[1].map((log: any) => log.pool.toLowerCase()));

  const combinedTokenLaunchedLogs = [...tokenLaunchedLogs[0], ...tokenLaunchedLogs[1]];

  const pairObject: Record<string, string[]> = {};
  for (const log of combinedTokenLaunchedLogs) {
    const [token0, token1] = log.token < log.pairToken ? [log.token, log.pairToken] : [log.pairToken, log.token];
    pairObject[log.pool.toLowerCase()] = [token0.toLowerCase(), token1.toLowerCase()];
  }

  const filteredPairs = await filterPools({
    api: options.api,
    pairs: pairObject,
    createBalances: options.createBalances,
    minUSDValue: MIN_TVL,
    maxPairSize: 5000,
  })

  const poolIds = Object.keys(filteredPairs);
  const swapLogs: any[][] = await options.getLogs({
    targets: poolIds,
    eventAbi: swapEvent,
    flatten: false,
  })

  for (let index = 0; index < poolIds.length; index++) {
    const pool = poolIds[index];
    const poolSwapLogs = swapLogs[index];
    if (!poolSwapLogs?.length) continue;
    const protocolShare = (poolsFromNewFactory.has(pool) ? protocolFeeShares[1] : protocolFeeShares[0]) / 100;
    const creatorShare = 1 - protocolShare;
    const [token0, token1] = pairObject[pool] ?? [];
    if (!token0 || !token1) continue;
    for (const swapLog of poolSwapLogs) {
      await addOneToken({ balances: feesFromSwap, token0, amount0: Number(swapLog.amount0) * SWAP_FEE, token1, amount1: Number(swapLog.amount1) * SWAP_FEE });
      await addOneToken({ balances: swapFeesToCreator, token0, amount0: Number(swapLog.amount0) * SWAP_FEE * creatorShare, token1, amount1: Number(swapLog.amount1) * SWAP_FEE * creatorShare });
      await addOneToken({ balances: swapFeesToProtocol, token0, amount0: Number(swapLog.amount0) * SWAP_FEE * protocolShare, token1, amount1: Number(swapLog.amount1) * SWAP_FEE * protocolShare });
    }
  }

  const dailyFees = feesFromSwap.clone(1, METRIC.SWAP_FEES);
  const dailySupplySideRevenue = swapFeesToCreator.clone(1, "Token Swap Fees to Creators");
  const dailyProtocolRevenue = swapFeesToProtocol.clone(1, "Token Swap Fees to Protocol");

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: "1% swap fees paid on all token swaps of tokens launched on the platform",
  Revenue: "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function)",
  ProtocolRevenue: "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function)",
  SupplySideRevenue: "Part of swap fees paid to token creators after protocol revenue is deducted",
}

const breakdownMethodology = {
  Fees: {
    "Token Swap Fees": "1% swap fees paid on all token swaps of tokens launched on the platform",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function)",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function)",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "Part of swap fees paid to token creators after protocol revenue is deducted",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-13",
  methodology,
  breakdownMethodology,
  doublecounted: true, // uniswap
}

export default adapter;