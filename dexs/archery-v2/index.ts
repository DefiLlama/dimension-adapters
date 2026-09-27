import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";

// Archery mainnet deployment on Arc. Source: PoolFactory deployment tx
// https://explorer.arc.io/tx/0xe92f423925bc5ccad196f3d3200de1378d011cffccc19f27cceff4664ded8cea (block 22447656)
const START = "2026-09-24";

// Archery v2 deployment addresses and deployment blocks on Arc.
// Source: Archery mainnet deployment manifest; all contracts are source-verified on https://explorer.arc.io
const CONFIG = {
  voter: "0x55e1be3aa0f751661f76669d4b5584175af8a36d",
  v2Factory: "0x0769d7d58e064d3dd4c2bb17274506f4824a9657",
  v2GaugeFactory: "0x1f7fdc021f5c8244f09cb2e3ac7c28c48744b4e7",
  v2FactoryStartBlock: 22447656,
  voterStartBlock: 22447700,
};

// Pool fee accounting uses a 1e18 index (Pool.sol: _ratio = amount * 1e18 / totalSupply).
const INDEX_PRECISION = new BigNumber(1e18);

const eventAbis = {
  poolCreated: "event PoolCreated(address indexed token0,address indexed token1,bool indexed stable,address pool,uint256)",
  swap:
    "event Swap(address indexed sender,address indexed to,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out)",
  // Emitted by Pool._update0/_update1 on every swap with the exact fee charged at that swap's fee rate.
  fees: "event Fees(address indexed sender,uint256 amount0,uint256 amount1)",
  // Emitted by Pool.claimFees; sender is the LP claiming (here: the gauge).
  claim: "event Claim(address indexed sender,address indexed recipient,uint256 amount0,uint256 amount1)",
  gaugeCreated:
    "event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)",
};

const abis = {
  index0: "uint256:index0",
  index1: "uint256:index1",
  supplyIndex0: "function supplyIndex0(address) view returns (uint256)",
  supplyIndex1: "function supplyIndex1(address) view returns (uint256)",
  claimable0: "function claimable0(address) view returns (uint256)",
  claimable1: "function claimable1(address) view returns (uint256)",
  balanceOf: "function balanceOf(address) view returns (uint256)",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  VOTER_FEES: "V2 Gauge Voter Fees",
  LP_FEES: "V2 Liquidity Provider Fees",
};

function toBN(value: any, context = "value") {
  if (value === null || value === undefined) throw new Error(`Missing ${context}`);
  return new BigNumber(value.toString());
}

const absBN = (value: any, context?: string) => toBN(value, context).abs();
const orZero = (value: any) => new BigNumber(value === null || value === undefined ? 0 : value.toString());

async function getV2PoolToGauge(options: FetchOptions): Promise<Map<string, string>> {
  const logs = await options.getLogs({
    target: CONFIG.voter,
    fromBlock: CONFIG.voterStartBlock,
    eventAbi: eventAbis.gaugeCreated,
    onlyArgs: true,
    cacheInCloud: true,
  });

  const v2PoolToGauge = new Map<string, string>();
  const v2GaugeFactory = CONFIG.v2GaugeFactory.toLowerCase();

  for (const log of logs) {
    const gaugeFactory = log.gaugeFactory.toLowerCase();
    const pool = log.pool.toLowerCase();
    const gauge = log.gauge.toLowerCase();
    if (gaugeFactory === v2GaugeFactory) v2PoolToGauge.set(pool, gauge);
  }

  return v2PoolToGauge;
}

// Fees accrued to `gauge` as an LP of `pool` up to the api's block, per token:
// claimable[gauge] + balanceOf(gauge) * (index - supplyIndex[gauge]) / 1e18  (Pool._updateFor accounting).
// Pools created inside the window do not exist at the start block, so failed reads count as zero.
async function getGaugeAccrued(api: any, gaugedPools: { pool: string; gauge: string }[]) {
  const poolCalls = gaugedPools.map(({ pool }) => pool);
  const gaugeCalls = gaugedPools.map(({ pool, gauge }) => ({ target: pool, params: [gauge] }));
  const index0 = await api.multiCall({ abi: abis.index0, calls: poolCalls, permitFailure: true });
  const index1 = await api.multiCall({ abi: abis.index1, calls: poolCalls, permitFailure: true });
  const supplyIndex0 = await api.multiCall({ abi: abis.supplyIndex0, calls: gaugeCalls, permitFailure: true });
  const supplyIndex1 = await api.multiCall({ abi: abis.supplyIndex1, calls: gaugeCalls, permitFailure: true });
  const claimable0 = await api.multiCall({ abi: abis.claimable0, calls: gaugeCalls, permitFailure: true });
  const claimable1 = await api.multiCall({ abi: abis.claimable1, calls: gaugeCalls, permitFailure: true });
  const balances = await api.multiCall({ abi: abis.balanceOf, calls: gaugeCalls, permitFailure: true });
  return gaugedPools.map((_, i) => {
    const balance = orZero(balances[i]);
    const pending0 = balance.times(orZero(index0[i]).minus(orZero(supplyIndex0[i]))).div(INDEX_PRECISION).integerValue(BigNumber.ROUND_FLOOR);
    const pending1 = balance.times(orZero(index1[i]).minus(orZero(supplyIndex1[i]))).div(INDEX_PRECISION).integerValue(BigNumber.ROUND_FLOOR);
    return {
      accrued0: orZero(claimable0[i]).plus(BigNumber.max(pending0, 0)),
      accrued1: orZero(claimable1[i]).plus(BigNumber.max(pending1, 0)),
    };
  });
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, fromApi, chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const v2PoolToGauge = await getV2PoolToGauge(options);

  const poolCreatedLogs = await getLogs({
    target: CONFIG.v2Factory,
    fromBlock: CONFIG.v2FactoryStartBlock,
    eventAbi: eventAbis.poolCreated,
    onlyArgs: true,
    cacheInCloud: true,
  });

  if (!poolCreatedLogs.length) {
    return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
  }

  const poolIds = poolCreatedLogs.map((pool) => pool.pool.toLowerCase());

  // Swaps and the pool's Fees events. Pool.swap emits Fees (one per input token, with the exact fee charged at the
  // fee rate in effect for that swap) right before its Swap event, in the same transaction.
  const swapLogsByPool = await getLogs({ targets: poolIds, eventAbi: eventAbis.swap, flatten: false, onlyArgs: false });
  const feeLogsByPool = await getLogs({ targets: poolIds, eventAbi: eventAbis.fees, flatten: false, onlyArgs: false });

  // Per-pool fee totals per token, used for the voter/LP split below.
  const feeTotals = feeLogsByPool.map((logs: any[]) => {
    let fee0 = new BigNumber(0);
    let fee1 = new BigNumber(0);
    for (const log of logs) {
      fee0 = fee0.plus(toBN(log.args.amount0));
      fee1 = fee1.plus(toBN(log.args.amount1));
    }
    return { fee0, fee1 };
  });

  // Voter share: fees accrued to the gauge's LP balance at the time of each swap, from the pool's own index accounting.
  const gaugedPools = poolIds
    .map((pool, index) => ({ pool, index, gauge: v2PoolToGauge.get(pool) as string }))
    .filter(({ gauge }) => gauge);
  const voterShareByIndex = new Map<number, { share0: BigNumber; share1: BigNumber }>();
  if (gaugedPools.length) {
    const accruedStart = await getGaugeAccrued(fromApi, gaugedPools);
    const accruedEnd = await getGaugeAccrued(api, gaugedPools);
    const claimLogsByPool = await getLogs({
      targets: gaugedPools.map(({ pool }) => pool),
      eventAbi: eventAbis.claim,
      flatten: false,
    });
    gaugedPools.forEach(({ index, gauge }, i) => {
      let claimed0 = new BigNumber(0);
      let claimed1 = new BigNumber(0);
      for (const log of claimLogsByPool[i]) {
        if (String(log.sender).toLowerCase() !== gauge) continue;
        claimed0 = claimed0.plus(toBN(log.amount0));
        claimed1 = claimed1.plus(toBN(log.amount1));
      }
      const holders0 = accruedEnd[i].accrued0.minus(accruedStart[i].accrued0).plus(claimed0);
      const holders1 = accruedEnd[i].accrued1.minus(accruedStart[i].accrued1).plus(claimed1);
      const { fee0, fee1 } = feeTotals[index];
      // Share of each token's fees that accrued to the gauge; index rounding can leave dust outside [0, 1].
      const clamp = (v: BigNumber) => BigNumber.min(BigNumber.max(v, 0), 1);
      voterShareByIndex.set(index, {
        share0: fee0.gt(0) ? clamp(holders0.div(fee0)) : new BigNumber(0),
        share1: fee1.gt(0) ? clamp(holders1.div(fee1)) : new BigNumber(0),
      });
    });
  }

  swapLogsByPool.forEach((swapLogs: any[], index: number) => {
    const { token0, token1 } = poolCreatedLogs[index];
    const voterShare = voterShareByIndex.get(index) ?? { share0: new BigNumber(0), share1: new BigNumber(0) };

    // Fees logs of this pool grouped by transaction, in log order, to pair each swap with its own fee.
    const feesByTx = new Map<string, any[]>();
    for (const log of feeLogsByPool[index]) {
      const key = String(log.transactionHash).toLowerCase();
      if (!feesByTx.has(key)) feesByTx.set(key, []);
      feesByTx.get(key)!.push(log);
    }
    for (const logs of feesByTx.values()) logs.sort((a, b) => Number(a.logIndex ?? a.index) - Number(b.logIndex ?? b.index));

    for (const log of swapLogs) {
      const args = log.args;
      const amount0In = toBN(args.amount0In);
      const amount1In = toBN(args.amount1In);
      const amount0 = amount0In.plus(absBN(args.amount0Out));
      const amount1 = amount1In.plus(absBN(args.amount1Out));
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });

      // Fees events emitted by this swap: same tx, before this Swap log, not yet paired with an earlier swap.
      const txFees = feesByTx.get(String(log.transactionHash).toLowerCase()) ?? [];
      const swapLogIndex = Number(log.logIndex ?? log.index);
      let fee0 = new BigNumber(0);
      let fee1 = new BigNumber(0);
      while (txFees.length && Number(txFees[0].logIndex ?? txFees[0].index) < swapLogIndex) {
        const feeLog = txFees.shift();
        fee0 = fee0.plus(toBN(feeLog.args.amount0));
        fee1 = fee1.plus(toBN(feeLog.args.amount1));
      }
      if (fee0.isZero() && fee1.isZero()) continue;

      // Exact fee rate charged on this swap, applied to both sides so the fee is valued on the pricing side
      // (same side used for volume), as in the up-v2 adapter.
      const rate = amount0In.gt(0) ? fee0.div(amount0In) : fee1.div(amount1In);
      const { token: feeToken, amount: feeAmount } = addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: amount0.times(rate),
        amount1: amount1.times(rate),
        label: METRIC.SWAP_FEES,
      });
      addOneToken({ chain, balances: dailyUserFees, token0, token1, amount0: amount0.times(rate), amount1: amount1.times(rate), label: METRIC.SWAP_FEES });

      // The voter share of a swap's fee follows the token the fee was charged in.
      const share = (amount0In.gt(0) ? voterShare.share0 : voterShare.share1).toNumber();
      dailyHoldersRevenue.add(feeToken, Number(feeAmount) * share, METRIC.VOTER_FEES);
      dailySupplySideRevenue.add(feeToken, Number(feeAmount) * (1 - share), METRIC.LP_FEES);
    }
  });

  dailyRevenue.add(dailyHoldersRevenue);

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Swap volume from Archery v2 pools on Arc. Each swap is counted once on the pricing side of the pair.",
  Fees: "V2 swap fees paid by traders, taken from each pool's Fees events, which record the exact fee charged on each swap's input amount at the fee rate in effect for that swap.",
  UserFees: "Swap fees directly paid by traders.",
  Revenue: "V2 swap fees routed to veArchery voters through gauges, equal to HoldersRevenue.",
  HoldersRevenue: "Fees accrued to the gauge's staked LP balance, from the pool's fee index accounting: change in claimable + balanceOf(gauge) * (index - supplyIndex[gauge]) / 1e18, plus fees the gauge claimed in the period.",
  SupplySideRevenue: "V2 liquidity provider fees not routed to veArchery voters.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "All v2 swap fees paid by traders.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "All v2 swap fees paid directly by traders.",
  },
  Revenue: {
    [METRIC.VOTER_FEES]: "V2 pool swap fees accrued to LP tokens staked in gauges and routed to veArchery voters.",
  },
  HoldersRevenue: {
    [METRIC.VOTER_FEES]: "V2 pool swap fees accrued to LP tokens staked in gauges and routed to veArchery voters.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "V2 pool swap fees retained by unstaked liquidity providers.",
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
