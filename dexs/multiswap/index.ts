import { SimpleAdapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";
import { ethers } from "ethers";

const FACTORY = "0x0A513fac50880fb7fC1588D0A590583Ef34D85a1".toLowerCase();
const POOL_CREATED_EVENT =
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

// Cache pools across invocations to avoid refetching
let cachedPools: {
  pairObject: Record<string, string[]>;
  fees: Record<string, number>;
} | null = null;

const fetch: FetchV2 = async (fetchOptions) => {
  const { createBalances, getLogs, chain, api } = fetchOptions;

  // 1. Build (or reuse) the pool list
  if (!cachedPools) {
    const rawLogs = await getLogs({
      target: FACTORY,
      eventAbi: POOL_CREATED_EVENT,
      onlyArgs: false, // we want full log object to parse ourselves
      fromBlock: 1,
      cacheInCloud: true,
    });

    const iface = new ethers.Interface([POOL_CREATED_EVENT]);
    const pairObject: Record<string, string[]> = {};
    const fees: Record<string, number> = {};

    rawLogs.forEach((log: any) => {
      const parsed = iface.parseLog(log);
      if (!parsed) return;
      const { token0, token1, fee, pool } = parsed.args as unknown as {
        token0: string;
        token1: string;
        fee: bigint;
        pool: string;
      };
      pairObject[pool] = [token0, token1];
      fees[pool] = Number(fee.toString()) / 1e6;
    });

    cachedPools = { pairObject, fees };
    // const samplePairs = Object.entries(pairObject).slice(0, 5)
    // console.info('Sample pools:')
    // samplePairs.forEach(([pool, tokens]) => console.info(pool, '->', tokens))
  }

  const { pairObject, fees } = cachedPools;

  // 2. Filter pools by on-chain liquidity using helper
  const filteredPairs = await filterPools({
    api,
    pairs: pairObject,
    createBalances,
    minUSDValue: 100,   // try 0 to include all pools
  });

  const pairIds = Object.keys(filteredPairs);
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  if (!pairIds.length) return { dailyVolume };

  // 3. Fetch swap logs for the last 24h
  const allLogs = await getLogs({
    targets: pairIds,
    eventAbi: SWAP_EVENT,
    flatten: false,
  });

  allLogs.forEach((logsArr: any, idx: number) => {
    const pair = pairIds[idx];
    const [token0, token1] = pairObject[pair];
    const fee = fees[pair] ?? 0;
    logsArr.forEach((log: any) => {
      addOneToken({
        chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: log.amount0,
        amount1: log.amount1,
      });
      // fee calculation (protocol fee portion)
      addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: Number(log.amount0) * fee,
        amount1: Number(log.amount1) * fee,
      });
    });
  });

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.DCHAIN]: {
      fetch,
      start: "2024-01-01",
    },
  },
  methodology: {
    Fees: "Fees paid by users while trading on Multiswap.",
    Revenue: "Fees paid by users while trading on Multiswap.",
  }
};

export default adapter; 