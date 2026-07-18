import { Balances } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { isCoreAsset } from "../../helpers/prices";

// UP public launch on Robinhood Chain. Source: first public UP pool deployments on the Robinhood Chain explorer.
const START = "2026-07-10";

// Public UP CL deployment address and first event block on Robinhood Chain.
// Source: Robinhood Chain explorer contract/event history for the CL factory.
const CONFIG = {
  clFactory: "0x1ac9dB4a2608ba45D6127B1737949b51Bb54B7F3",
  clFactoryStartBlock: 6184096,
};

// CLPool.fee returns Uniswap-V3-style pips.
const CL_FEE_DENOMINATOR = 1_000_000;

const eventAbis = {
  poolCreated: "event PoolCreated(address indexed token0,address indexed token1,int24 indexed tickSpacing,address pool)",
  swap:
    "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
};

const abis = {
  fee: "uint256:fee",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  PROTOCOL_FEES: "Protocol Swap Fees",
};

type PoolLog = {
  token0: string;
  token1: string;
  pool: string;
};

function toBN(value: any, context = "value") {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return new BigNumber(value.toString());
}

const absBN = (value: any, context?: string) => toBN(value, context).abs();

function normalizePoolLog(log: any): PoolLog {
  const args = log.args ?? log;
  return {
    token0: args.token0,
    token1: args.token1,
    pool: args.pool,
  };
}

function addAmount(balances: Balances, token: string, amount: BigNumber, label?: string) {
  if (!amount.gt(0)) return;
  if (label) balances.add(token, amount.toFixed(0), label);
  else balances.add(token, amount.toFixed(0));
}

function getPricedAmount(
  chain: string,
  token0: string,
  token1: string,
  amount0: BigNumber,
  amount1: BigNumber,
): { token: string; amount: BigNumber } {
  if (isCoreAsset(chain, token0)) return { token: token0, amount: amount0 };
  return { token: token1, amount: amount1 };
}

function addPricedAmount(
  chain: string,
  balances: Balances,
  token0: string,
  token1: string,
  amount0: BigNumber,
  amount1: BigNumber,
  label?: string,
) {
  const { token, amount } = getPricedAmount(chain, token0, token1, amount0, amount1);
  addAmount(balances, token, amount, label);
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const rawPools = (
    (await getLogs({
      target: CONFIG.clFactory,
      fromBlock: CONFIG.clFactoryStartBlock,
      toBlock,
      eventAbi: eventAbis.poolCreated,
      entireLog: true,
      skipCacheRead: true,
    })) as any[]
  ).map(normalizePoolLog);

  if (!rawPools.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue };
  }

  const poolIds = rawPools.map((pool) => pool.pool.toLowerCase());
  const fees = await api.multiCall({ abi: abis.fee, calls: poolIds });

  const poolInfo: Record<string, { token0: string; token1: string; fee: BigNumber }> = {};
  rawPools.forEach((pool, index) => {
    poolInfo[pool.pool.toLowerCase()] = {
      token0: pool.token0,
      token1: pool.token1,
      fee: toBN(fees[index], `${pool.pool} CL fee`).div(CL_FEE_DENOMINATOR),
    };
  });

  const swapLogsByPool = await getLogs({
    targets: poolIds,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.swap,
    flatten: false,
  });

  const poolFeeTotals: Record<
    string,
    {
      pricedFee: BigNumber;
      pricedToken: string;
    }
  > = {};
  (swapLogsByPool as any[][]).forEach((logs, index) => {
    const pool = poolIds[index];
    const info = poolInfo[pool];
    if (!info) return;

    for (const log of logs) {
      const amount0 = absBN(log.amount0);
      const amount1 = absBN(log.amount1);
      addPricedAmount(chain, dailyVolume, info.token0, info.token1, amount0, amount1);

      if (!poolFeeTotals[pool]) {
        poolFeeTotals[pool] = {
          pricedFee: new BigNumber(0),
          pricedToken: getPricedAmount(chain, info.token0, info.token1, new BigNumber(0), new BigNumber(0)).token,
        };
      }
      poolFeeTotals[pool].pricedFee = poolFeeTotals[pool].pricedFee.plus(
        getPricedAmount(chain, info.token0, info.token1, amount0.times(info.fee), amount1.times(info.fee)).amount,
      );
    }
  });

  rawPools.forEach((poolLog) => {
    const pool = poolLog.pool.toLowerCase();
    const totals = poolFeeTotals[pool];
    if (!totals || totals.pricedFee.isZero()) return;

    addAmount(dailyFees, totals.pricedToken, totals.pricedFee, METRIC.SWAP_FEES);
    addAmount(dailyUserFees, totals.pricedToken, totals.pricedFee, METRIC.SWAP_FEES);
    addAmount(dailyRevenue, totals.pricedToken, totals.pricedFee, METRIC.PROTOCOL_FEES);
    addAmount(dailyProtocolRevenue, totals.pricedToken, totals.pricedFee, METRIC.PROTOCOL_FEES);
  });

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Volume: "Swap volume from UP concentrated liquidity pools on Robinhood Chain. Each swap is counted once on the pricing side of the pair.",
  Fees: "Total concentrated liquidity swap fees paid by traders, valued on the same pricing side used for volume. Fees use CLPool.fee(), where 3000 means 0.30%.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "100% of concentrated liquidity swap fees are protocol revenue.",
  ProtocolRevenue: "100% of concentrated liquidity swap fees are protocol revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "All concentrated liquidity swap fees paid by traders.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "All concentrated liquidity swap fees paid directly by traders.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "All concentrated liquidity swap fees are protocol revenue.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "All concentrated liquidity swap fees are protocol revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
