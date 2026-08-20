import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { filterPools } from "../../helpers/uniswap";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEES = {
  BPS: 10_000n,
  // Source: bow.fun docs use the 1% Uniswap V3 tier and split collected WETH fees 35% to creators.
  POOL_FEE_BPS: 100n,
  CREATOR_SHARE_BPS: 3_500n,
};
const LAUNCHED =
  "event Launched(address indexed token, address indexed deployer, address pool, uint256 positionId, uint256 launchId)";

const SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"

const chainConfig: Record<string, { start: string; factory: string; fromBlock: number; weth: string }> = {
  [CHAIN.ROBINHOOD]: {
    // https://bow.fun/docs.html#deployed-contracts
    start: "2026-07-11",
    factory: "0xC70E510E14710Ea535CAB7b2414860aF63FEab79",
    fromBlock: 7158095,
    weth: ADDRESSES.robinhood.WETH,
  },
};

const toBigInt = (amount: string | number | bigint) => BigInt(amount.toString());
const MIN_TVL = 1000;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { factory, fromBlock, weth } = chainConfig[options.chain];

  const launches = await options.getLogs({
    target: factory,
    eventAbi: LAUNCHED,
    fromBlock,
    cacheInCloud: true,
  });

  const pairObject: IJSON<string[]> = {};
  for (const launch of launches) {
    const [token0, token1] = launch.token < weth
      ? [launch.token, weth]
      : [weth, launch.token];
    pairObject[launch.pool.toLowerCase()] = [token0.toLowerCase(), token1.toLowerCase()];
  }

  const filteredPools = await filterPools({
    api: options.api,
    pairs: pairObject,
    createBalances: options.createBalances,
    minUSDValue: MIN_TVL,
    maxPairSize: 5000,
  });
  if (!launches.length) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  }

  const swapLogs = await options.getLogs({
    targets: Object.keys(filteredPools),
    eventAbi: SWAP_EVENT,
    entireLog: true,
    parseLog: true,
  })

  for (const log of swapLogs) {
    const [token0, _token1] = pairObject[log.address.toLowerCase()];
    const wethIsToken0 = token0.toLowerCase() === weth.toLowerCase();
    const raw = toBigInt(wethIsToken0 ? log.args.amount0 : log.args.amount1);
    if (raw === 0n) continue;

    const wethIn = raw > 0n;
    const wethLeg = wethIn ? raw : -raw;
    const swapFee = wethIn
      ? (wethLeg * FEES.POOL_FEE_BPS) / FEES.BPS
      : (wethLeg * FEES.POOL_FEE_BPS) / (FEES.BPS - FEES.POOL_FEE_BPS);
    const creatorFee = (swapFee * FEES.CREATOR_SHARE_BPS) / FEES.BPS;
    const protocolFee = swapFee - creatorFee;

    dailyFees.add(weth, swapFee, METRIC.SWAP_FEES);
    dailyRevenue.add(weth, protocolFee, "Token Swap Fees to Protocol");
    dailyProtocolRevenue.add(weth, protocolFee, "Token Swap Fees to Protocol");
    dailySupplySideRevenue.add(weth, creatorFee, "Token Swap Fees to Creators");
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "1% swap fees from bow.fun factory-launched Uniswap V3 pools on Robinhood Chain, filtered for pools with at least $1,000 TVL.",
  Revenue: "65% of swap fees retained by the bow.fun protocol, filtered for pools with at least $1,000 TVL.",
  ProtocolRevenue: "65% of swap fees retained by the bow.fun protocol, filtered for pools with at least $1,000 TVL.",
  SupplySideRevenue: "35% of swap fees routed to launched-token creators, filtered for pools with at least $1,000 TVL.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "1% swap fees from bow.fun factory-launched Uniswap V3 pools.",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "The protocol's 65% share of swap fees.",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "The protocol's 65% share of swap fees.",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "The launched token creator's 35% share of swap fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
  doublecounted: true, // Bow.fun pools are Uniswap V3 pools.
};

export default adapter;
