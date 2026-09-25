import * as sdk from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { PromisePool } from "@supercharge/promise-pool";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";

// Archery mainnet deployment on Arc. Source: CLFactory deployment tx
// https://explorer.arc.io/tx/0xdc8c3afb16ba528119a53fe7149cf988754e7ae6762f88dc213ee7d5071a9bbb (block 22447744)
const START = "2026-09-24";

// Archery concentrated liquidity (Slipstream-style) contracts on Arc.
// Source: Archery mainnet deployment manifest; all contracts are source-verified on https://explorer.arc.io
const CONFIG = {
  clFactory: "0xc481038c013fe96f38ce7a2dc417b2b1b78b16a4",
  clFactoryStartBlock: 22447744,
  // DynamicSwapFeeModule set on the CLFactory; only used to read tx.origin fee discounts.
  swapFeeModule: "0x6bfce61498dea65d62ce11c2480d529a1a9325d4",
};

// CLPool.fee() returns pips (1e6 = 100%). It is dynamic: DynamicSwapFeeModule adds a surcharge based on the
// distance between the current tick and the 10-minute average tick, so it can change between swaps.
// CLPool.swap reads fee() once at the start of each swap, so we read fee() at the state right before the
// block that contains the swap (block - 1) and apply it to that swap.
// Source: https://archery.wtf/docs/dynamic-fees and CLPool.swap (`fee: fee()`).
const CL_FEE_DENOMINATOR = 1_000_000;
const HISTORICAL_CALL_CONCURRENCY = 5;

const eventAbis = {
  poolCreated: "event PoolCreated(address indexed token0,address indexed token1,int24 indexed tickSpacing,address pool)",
  swap:
    "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
  collectFees: "event CollectFees(address indexed recipient,uint128 amount0,uint128 amount1)",
  discountedRegistered: "event DiscountedRegistered(address indexed discountReceiver,uint24 indexed discount)",
};

const abis = {
  fee: "uint24:fee",
  gaugeFees: "function gaugeFees() view returns (uint128 token0, uint128 token1)",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  VOTER_FEES: "CL Gauge Voter Fees",
  LP_FEES: "CL Liquidity Provider Fees",
};

function toBN(value: any, context = "value") {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return new BigNumber(value.toString());
}

const absBN = (value: any, context?: string) => toBN(value, context).abs();

function gaugeAmount(value: any, field: "token0" | "token1") {
  const index = field === "token0" ? 0 : 1;
  return toBN(value?.[field] ?? value?.[index] ?? 0);
}

const blockOf = (log: any) => Number(log.blockNumber ?? log.block ?? log.block_number);

// Fee (pips) charged to each swap, keyed by `${block}:${pool}`.
async function getSwapFees(chain: string, swapsByBlock: Map<number, Set<string>>): Promise<Map<string, number>> {
  const feeByBlockPool = new Map<string, number>();
  const { errors } = await PromisePool.withConcurrency(HISTORICAL_CALL_CONCURRENCY)
    .for([...swapsByBlock.entries()])
    .process(async ([block, pools]) => {
      const targets = [...pools];
      const api = new sdk.ChainApi({ chain, block: block - 1 });
      const fees = await api.multiCall({ abi: abis.fee, calls: targets });
      targets.forEach((pool, i) => feeByBlockPool.set(`${block}:${pool}`, Number(fees[i])));
    });
  if (errors.length) throw errors[0];
  return feeByBlockPool;
}

// tx.origin fee discounts (pips of the fee) registered on the swap fee module. None are registered at launch;
// if any appear, the discount is applied to swaps whose transaction origin is registered.
async function getDiscounts(options: FetchOptions): Promise<Map<string, number>> {
  const logs = await options.getLogs({
    target: CONFIG.swapFeeModule,
    fromBlock: CONFIG.clFactoryStartBlock,
    eventAbi: eventAbis.discountedRegistered,
    onlyArgs: true,
    cacheInCloud: true,
  });
  const discounts = new Map<string, number>();
  for (const log of logs) discounts.set(String(log.discountReceiver).toLowerCase(), Number(log.discount));
  return discounts;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, fromApi, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolCreatedLogs = await getLogs({
    target: CONFIG.clFactory,
    fromBlock: CONFIG.clFactoryStartBlock,
    eventAbi: eventAbis.poolCreated,
    onlyArgs: true,
    cacheInCloud: true,
  });

  if (!poolCreatedLogs.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = poolCreatedLogs.map((pool) => pool.pool.toLowerCase());
  const gaugeFeesStart = await fromApi.multiCall({ abi: abis.gaugeFees, calls: poolIds, permitFailure: true });
  const gaugeFeesEnd = await api.multiCall({ abi: abis.gaugeFees, calls: poolIds, permitFailure: true });

  const swapLogsByPool = await getLogs({
    targets: poolIds,
    eventAbi: eventAbis.swap,
    flatten: false,
    onlyArgs: false,
  });

  // Blocks that contain swaps, and the pools that swapped in each block.
  const swapsByBlock = new Map<number, Set<string>>();
  swapLogsByPool.forEach((logs: any[], index: number) => {
    for (const log of logs) {
      const block = blockOf(log);
      if (!swapsByBlock.has(block)) swapsByBlock.set(block, new Set());
      swapsByBlock.get(block)!.add(poolIds[index]);
    }
  });
  const feeByBlockPool = await getSwapFees(chain, swapsByBlock);

  const discounts = await getDiscounts(options);
  const originOf = async (log: any): Promise<string> => {
    const tx = await sdk.getProvider(chain).getTransaction(log.transactionHash);
    return String(tx?.from ?? "").toLowerCase();
  };

  const poolFeeTotals: Record<string, { fee0: BigNumber; fee1: BigNumber }> = {};
  for (let index = 0; index < swapLogsByPool.length; index++) {
    const pool = poolIds[index];
    const { token0, token1 } = poolCreatedLogs[index];

    for (const log of swapLogsByPool[index]) {
      const args = log.args ?? log;
      const amount0 = absBN(args.amount0);
      const amount1 = absBN(args.amount1);
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });

      let feePips = feeByBlockPool.get(`${blockOf(log)}:${pool}`);
      if (feePips === undefined) throw new Error(`Missing swap fee for ${pool} at block ${blockOf(log)}`);
      if (discounts.size) {
        const discount = discounts.get(await originOf(log)) ?? 0;
        // DynamicSwapFeeModule: discount = mulDivRoundingUp(totalFee, discount, 1e6)
        if (discount) feePips -= Math.ceil((feePips * discount) / CL_FEE_DENOMINATOR);
      }
      const fee = new BigNumber(feePips).div(CL_FEE_DENOMINATOR);

      if (!poolFeeTotals[pool]) poolFeeTotals[pool] = { fee0: new BigNumber(0), fee1: new BigNumber(0) };
      // The fee is taken from the input side (positive amount) of each swap.
      if (toBN(args.amount0).gt(0)) poolFeeTotals[pool].fee0 = poolFeeTotals[pool].fee0.plus(amount0.times(fee));
      if (toBN(args.amount1).gt(0)) poolFeeTotals[pool].fee1 = poolFeeTotals[pool].fee1.plus(amount1.times(fee));
    }
  }

  const collectLogsByPool = await getLogs({
    targets: poolIds,
    eventAbi: eventAbis.collectFees,
    flatten: false,
  });

  const collectedByPool: Record<string, { c0: BigNumber; c1: BigNumber }> = {};
  collectLogsByPool.forEach((logs: any[], index: number) => {
    const pool = poolIds[index];
    for (const log of logs) {
      if (!collectedByPool[pool]) collectedByPool[pool] = { c0: new BigNumber(0), c1: new BigNumber(0) };
      collectedByPool[pool].c0 = collectedByPool[pool].c0.plus(toBN(log.amount0));
      collectedByPool[pool].c1 = collectedByPool[pool].c1.plus(toBN(log.amount1));
    }
  });

  poolCreatedLogs.forEach(({ token0, token1, pool }, index) => {
    const poolId = pool.toLowerCase();
    const totals = poolFeeTotals[poolId];
    if (!totals || (totals.fee0.isZero() && totals.fee1.isZero())) return;

    // Voter share is measured from the pool's own gauge fee accounting (staked-liquidity fees plus the
    // unstaked-fee share), so it reflects the staked share at the time each swap accrued fees.
    const collected = collectedByPool[poolId] ?? { c0: new BigNumber(0), c1: new BigNumber(0) };
    let holders0 = gaugeAmount(gaugeFeesEnd[index], "token0")
      .minus(gaugeAmount(gaugeFeesStart[index], "token0"))
      .plus(collected.c0);
    let holders1 = gaugeAmount(gaugeFeesEnd[index], "token1")
      .minus(gaugeAmount(gaugeFeesStart[index], "token1"))
      .plus(collected.c1);

    if (holders0.lt(0)) holders0 = new BigNumber(0);
    if (holders1.lt(0)) holders1 = new BigNumber(0);
    if (holders0.gt(totals.fee0)) holders0 = totals.fee0;
    if (holders1.gt(totals.fee1)) holders1 = totals.fee1;

    const supply0 = totals.fee0.minus(holders0);
    const supply1 = totals.fee1.minus(holders1);

    if (totals.fee0.gt(0)) {
      dailyFees.add(token0, totals.fee0.toFixed(0), METRIC.SWAP_FEES);
      dailyUserFees.add(token0, totals.fee0.toFixed(0), METRIC.SWAP_FEES);
    }
    if (totals.fee1.gt(0)) {
      dailyFees.add(token1, totals.fee1.toFixed(0), METRIC.SWAP_FEES);
      dailyUserFees.add(token1, totals.fee1.toFixed(0), METRIC.SWAP_FEES);
    }
    if (holders0.gt(0)) dailyHoldersRevenue.add(token0, holders0.toFixed(0), METRIC.VOTER_FEES);
    if (holders1.gt(0)) dailyHoldersRevenue.add(token1, holders1.toFixed(0), METRIC.VOTER_FEES);
    if (supply0.gt(0)) dailySupplySideRevenue.add(token0, supply0.toFixed(0), METRIC.LP_FEES);
    if (supply1.gt(0)) dailySupplySideRevenue.add(token1, supply1.toFixed(0), METRIC.LP_FEES);
  });

  dailyRevenue.add(dailyHoldersRevenue);

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Swap volume from Archery concentrated liquidity pools on Arc. Each swap is counted once on the pricing side of the pair.",
  Fees: "Concentrated liquidity swap fees paid by traders. Each swap is charged on its input amount at the dynamic CLPool.fee() in effect for that swap (read from the state right before the swap's block; 3000 means 0.30%), net of any registered tx.origin discount.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "Concentrated liquidity fees routed to veArchery voters through gauges, equal to HoldersRevenue.",
  HoldersRevenue: "Voter fee share is measured from CLPool.gaugeFees() deltas plus CollectFees events and applied per token.",
  SupplySideRevenue: "Concentrated liquidity provider fees not routed to veArchery voters.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "All concentrated liquidity swap fees paid by traders.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "All concentrated liquidity swap fees paid directly by traders.",
  },
  Revenue: {
    [METRIC.VOTER_FEES]: "Concentrated liquidity swap fees accumulated for gauges and routed to veArchery voters.",
  },
  HoldersRevenue: {
    [METRIC.VOTER_FEES]: "Concentrated liquidity swap fees accumulated for gauges and routed to veArchery voters.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Concentrated liquidity swap fees retained by liquidity providers after gauge-routed fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
