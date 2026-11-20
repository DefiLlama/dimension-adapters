import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from "../../helpers/prices";

// Shared across every Metric factory version (see dexs/metric-v1). Each version
// lives in its own adapter folder and only differs by its factories (address,
// deployment block, event layout) — pool discovery + volume accounting is
// identical, so it is built here once.

// A pool's fee split as stored by its factory: platform shares of the spread leg (E6) and of the notional leg (E8).
export type MetricFeeConfig = {
  protocolSpreadFeeE6: bigint;
  adminSpreadFeeE6: bigint;
  protocolNotionalFeeE8: bigint;
  adminNotionalFeeE8: bigint;
};

// Fee readers for pool generations that log the LP share of each swap's fee, amounts in scaled units (native × scale multiplier).
export type MetricFees = {
  binSwappedEvent: string;
  // One routing step of a swap: LP leg, platform leg and the bin's token deltas.
  binStep: (args: any) => { lp: bigint; platform: bigint; amount0: bigint; amount1: bigint };
  // Platform (protocol + curator) fee of the whole swap: spread leg and notional leg.
  platformLegs: (args: any) => { spread: bigint; notional: bigint };
  initialConfig: (poolCreatedArgs: any) => MetricFeeConfig;
  // Factory events that change one config field, each shaped (address indexed pool, uint24 value).
  configEvents: { eventAbi: string; field: keyof MetricFeeConfig }[];
  poolFeeConfigAbi: string;
  immutablesAbi: string;
};

// Event ABIs differ between pool generations, so they are injected per factory.
// `poolField` is the PoolCreated field holding the pool address (legacy: `pool`,
// v1: `poolAddress`); `swapAmounts` extracts the two token deltas from a decoded
// Swap log, whose layout also differs per generation. `fees` is set only for
// generations whose fees can be read in full from their logs.
export type MetricEvents = {
  swapEvent: string;
  poolCreatedEvent: string;
  poolField: string;
  swapAmounts: (args: any) => { amount0: bigint; amount1: bigint };
  fees?: MetricFees;
};

export type MetricFactory = {
  address: string;
  // Factory deployment block: lower bound for the PoolCreated scan.
  fromBlock: number;
  // Retired factory: its pools are only counted for periods that start before
  // this UTC date (YYYY-MM-DD), so history stays intact while new days ignore it.
  end?: string;
  events?: MetricEvents;
};

export type MetricFactoriesChainConfig = Record<string, { start: string; factories: MetricFactory[] }>;

// Single-factory shape used by dexs/metric: one factory per chain, deployed at `fromBlock`.
export type MetricChainConfig = Record<string, { fromBlock: number; start: string }>;

const LEGACY_EVENTS: MetricEvents = {
  swapEvent:
    "event Swap(address sender, address recipient, bool exactInput, int128 amount0Delta, int128 amount1Delta, int16 newTick, uint104 newPositionInBin)",
  poolCreatedEvent:
    "event PoolCreated(address indexed token0,address indexed token1,address indexed priceProvider,address pool,bytes32 poolId)",
  poolField: "pool",
  swapAmounts: (args) => ({ amount0: BigInt(args.amount0Delta), amount1: BigInt(args.amount1Delta) }),
};

const LABELS = {
  lps: "Swap Fees To LPs",
  curators: "Swap Fees To Curators",
  protocol: "Swap Fees To Protocol",
};

const methodology = {
  Volume:
    "Sum of all input token amounts from Swap events across every pool created by Metric. Pools are discovered on-chain from factory contract's PoolCreated event.",
  Fees:
    "Fees traders pay on every swap, built into the quoted price: the half spread from the pool's price provider, any extra per-bin fee set by the pool curator and any notional fee. Counted from 2026-09-22, because pools of the previous factory do not log the liquidity providers' share.",
  UserFees:
    "Fees traders pay on every swap, built into the quoted price: the half spread, any extra per-bin fee and any notional fee.",
  Revenue: "Metric's share of swap fees: its configured share of the spread (15% by default) plus any notional fee.",
  ProtocolRevenue:
    "Metric's share of swap fees, paid to Metric's fee receiver: its configured share of the spread (15% by default) plus any notional fee.",
  SupplySideRevenue:
    "Swap fees kept by liquidity providers in the pool's bins, plus the pool curator's configured share of the spread.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Half spread, per-bin fees and notional fees paid by traders on every swap.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Half spread, per-bin fees and notional fees paid by traders on every swap.",
  },
  SupplySideRevenue: {
    [LABELS.lps]: "Part of the spread that stays in the pool's bins for liquidity providers.",
    [LABELS.curators]: "Pool curator's configured share of the spread, paid to the curator's fee address.",
  },
  Revenue: {
    [LABELS.protocol]: "Metric's configured share of the spread plus any notional fee.",
  },
  ProtocolRevenue: {
    [LABELS.protocol]: "Metric's configured share of the spread plus any notional fee, paid to Metric's fee receiver.",
  },
};

const dateToTimestamp = (date: string) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);

type MetricPool = { address: string; token0: string; token1: string; factory: string; initialConfig?: MetricFeeConfig };
type FeeBalances = Record<"dailyFees" | "dailySupplySideRevenue" | "dailyRevenue", ReturnType<FetchOptions["createBalances"]>>;
type BookedSwap = { pool: MetricPool; log: any; amount0: bigint; amount1: bigint; volumeToken: string };
type ConfigChange = { log: any; field: keyof MetricFeeConfig; value: bigint };

// Chain order of two logs: block first, then position inside the block.
const isBefore = (a: any, b: any) =>
  Number(a.blockNumber) < Number(b.blockNumber) || (Number(a.blockNumber) === Number(b.blockNumber) && Number(a.logIndex) < Number(b.logIndex));
const byChainOrder = (a: any, b: any) => (isBefore(a, b) ? -1 : isBefore(b, a) ? 1 : 0);
const abs = (value: bigint) => (value < 0n ? -value : value);

// Curator share rounds down and Metric keeps the remainder, as in MetricOmmPool._calculateUpdatedPendingFees.
const curatorPart = (amount: bigint, adminRate: bigint, totalRate: bigint, pool: string) => {
  if (amount === 0n) return 0n;
  if (totalRate === 0n) throw new Error(`Metric pool ${pool} charged a platform fee while its platform rate is 0`);
  return (amount * adminRate) / totalRate;
};

// Sums the BinSwapped steps that precede each Swap of one pool and checks them against the Swap's platform fee.
const pairBinSteps = (fees: MetricFees, pool: string, swaps: BookedSwap[], binLogs: any[]) => {
  const steps = [...binLogs].sort(byChainOrder);
  let next = 0;
  const paired = [...swaps].sort((a, b) => byChainOrder(a.log, b.log)).map((swap) => {
    let lp = 0n;
    let platform = 0n;
    while (next < steps.length && isBefore(steps[next], swap.log)) {
      const step = steps[next++];
      if (step.transactionHash !== swap.log.transactionHash) throw new Error(`Metric pool ${pool}: BinSwapped in ${step.transactionHash} has no Swap`);
      const leg = fees.binStep(step.args);
      if (leg.amount0 !== 0n && (leg.amount0 > 0n) !== (swap.amount0 > 0n)) throw new Error(`Metric pool ${pool}: bin and swap input sides differ in ${step.transactionHash}`);
      lp += leg.lp;
      platform += leg.platform;
    }
    const { spread, notional } = fees.platformLegs(swap.log.args);
    if (platform !== spread + notional) throw new Error(`Metric pool ${pool}: BinSwapped platform fees ${platform} != Swap platform fees ${spread + notional} in ${swap.log.transactionHash}`);
    return { swap, lp, spread, notional };
  });
  if (next !== steps.length) throw new Error(`Metric pool ${pool}: ${steps.length - next} BinSwapped logs after its last Swap`);
  return paired;
};

// Applies every config change logged before `log` to the pool's creation config.
const configAt = (initial: MetricFeeConfig, changes: ConfigChange[], log?: any) => {
  const config = { ...initial };
  for (const change of changes) {
    if (log && !isBefore(change.log, log)) break;
    config[change.field] = change.value;
  }
  return config;
};

const getConfigChanges = async (options: FetchOptions, fees: MetricFees, factories: MetricFactory[]) => {
  const changesByPool = new Map<string, ConfigChange[]>();
  const toBlock = await options.getToBlock();
  for (const factory of factories) {
    for (const { eventAbi, field } of fees.configEvents) {
      const logs = await options.getLogs({ target: factory.address, eventAbi, fromBlock: factory.fromBlock, toBlock, cacheInCloud: true, onlyArgs: false });
      for (const log of logs) {
        if (Number(log.blockNumber) > toBlock) continue;
        const pool = String(log.args[0]).toLowerCase();
        if (!changesByPool.has(pool)) changesByPool.set(pool, []);
        changesByPool.get(pool)!.push({ log, field, value: BigInt(log.args[1]) });
      }
    }
  }
  changesByPool.forEach((changes) => changes.sort((a, b) => byChainOrder(a.log, b.log)));
  return changesByPool;
};

// Books each swap's fee, split into LP, curator and Metric shares, in the token its volume was booked in.
const addMetricFees = async (
  options: FetchOptions,
  fees: MetricFees,
  factories: MetricFactory[],
  pools: MetricPool[],
  swapsByPool: BookedSwap[][],
  balances: FeeBalances,
) => {
  const binLogs = await options.getLogs({ targets: pools.map((pool) => pool.address), eventAbi: fees.binSwappedEvent, flatten: false, onlyArgs: false });
  const paired = pools.flatMap((pool, index) => pairBinSteps(fees, pool.address, swapsByPool[index], binLogs[index]));
  const active = pools.filter((_, index) => swapsByPool[index].length > 0);
  if (active.length === 0) return;

  const immutables = await options.api.multiCall({ abi: fees.immutablesAbi, calls: active.map((pool) => pool.address) });
  const endConfigs = await options.api.multiCall({
    abi: fees.poolFeeConfigAbi,
    calls: active.map((pool) => ({ target: pool.factory, params: [pool.address] })),
  });
  const changesByPool = await getConfigChanges(options, fees, factories);
  const scales = new Map<string, { scale0: bigint; scale1: bigint }>();
  active.forEach((pool, index) => {
    const imm = immutables[index];
    if (String(imm.token0).toLowerCase() !== pool.token0 || String(imm.token1).toLowerCase() !== pool.token1) throw new Error(`Metric pool ${pool.address}: getImmutables tokens differ from PoolCreated`);
    const timelineEnd = configAt(pool.initialConfig!, changesByPool.get(pool.address) ?? []);
    for (const field of Object.keys(timelineEnd) as (keyof MetricFeeConfig)[]) {
      if (timelineEnd[field] !== BigInt(endConfigs[index][field])) throw new Error(`Metric pool ${pool.address}: logged ${field} ${timelineEnd[field]} != poolFeeConfig ${endConfigs[index][field]}`);
    }
    scales.set(pool.address, { scale0: BigInt(imm.token0ScaleMultiplier), scale1: BigInt(imm.token1ScaleMultiplier) });
  });

  for (const { swap, lp, spread, notional } of paired) {
    const totalScaled = lp + spread + notional;
    if (totalScaled === 0n) continue;
    const { pool, amount0, amount1, volumeToken } = swap;
    if ((amount0 > 0n) === (amount1 > 0n)) throw new Error(`Metric pool ${pool.address}: swap ${swap.log.transactionHash} has no single input side`);
    const { scale0, scale1 } = scales.get(pool.address)!;
    const [inputAmount, inputScale] = amount0 > 0n ? [amount0, scale0] : [amount1, scale1];
    const volumeAmount = volumeToken === pool.token0 ? abs(amount0) : abs(amount1);
    // Scaled input-token amount → booked token, at the swap's own exchange rate.
    const toBooked = (scaled: bigint) => (scaled * volumeAmount) / (inputScale * inputAmount);
    const config = configAt(pool.initialConfig!, changesByPool.get(pool.address) ?? [], swap.log);
    const curatorScaled =
      curatorPart(spread, config.adminSpreadFeeE6, config.protocolSpreadFeeE6 + config.adminSpreadFeeE6, pool.address) +
      curatorPart(notional, config.adminNotionalFeeE8, config.protocolNotionalFeeE8 + config.adminNotionalFeeE8, pool.address);
    const fee = toBooked(totalScaled);
    const protocol = toBooked(spread + notional - curatorScaled);
    const curator = toBooked(curatorScaled);
    if (fee > volumeAmount) throw new Error(`Metric pool ${pool.address}: fee above gross input in ${swap.log.transactionHash}`);
    balances.dailyFees.add(volumeToken, fee, METRIC.SWAP_FEES);
    balances.dailySupplySideRevenue.add(volumeToken, fee - protocol - curator, LABELS.lps);
    balances.dailySupplySideRevenue.add(volumeToken, curator, LABELS.curators);
    balances.dailyRevenue.add(volumeToken, protocol, LABELS.protocol);
  }
};

export const getMetricFactoriesAdapter = (chainConfig: MetricFactoriesChainConfig): SimpleAdapter => {
  // Fees start once no chain counts a pool generation without fee logs, so no day reports fees for only some chains.
  const feesFromTimestamp = Math.max(
    0,
    ...Object.values(chainConfig).flatMap(({ factories }) =>
      factories.filter((factory) => !(factory.events ?? LEGACY_EVENTS).fees).map((factory) => (factory.end ? dateToTimestamp(factory.end) : Infinity)),
    ),
  );

  const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const feeBalances: FeeBalances = {
      dailyFees: options.createBalances(),
      dailySupplySideRevenue: options.createBalances(),
      dailyRevenue: options.createBalances(),
    };

    const factories = chainConfig[options.chain].factories
      .filter((factory) => !factory.end || options.fromTimestamp < dateToTimestamp(factory.end))
      .map((factory) => ({ ...factory, events: factory.events ?? LEGACY_EVENTS }));
    const withFees = options.fromTimestamp >= feesFromTimestamp;
    if (withFees && !factories.every((factory) => factory.events.fees)) throw new Error(`Metric ${options.chain}: a counted factory has no fee logs`);

    // Factories that share a PoolCreated ABI are one getLogs: every factory address
    // in `targets`, scanned from the earliest of their deployment blocks. Swap ABIs
    // differ per generation, so pools are grouped by the emitting factory and each
    // generation is one Swap getLogs over that generation's pools.
    const createdGroups = new Map<string, { eventAbi: string; factories: typeof factories }>();
    for (const factory of factories) {
      const key = `${factory.events.poolField}\0${factory.events.poolCreatedEvent}`;
      const group = createdGroups.get(key);
      if (group) group.factories.push(factory);
      else createdGroups.set(key, { eventAbi: factory.events.poolCreatedEvent, factories: [factory] });
    }

    for (const { eventAbi, factories: group } of createdGroups.values()) {
      const createdLogs = await options.getLogs({
        targets: group.map((factory) => factory.address),
        eventAbi,
        fromBlock: Math.min(...group.map((factory) => factory.fromBlock)),
        cacheInCloud: true,
        onlyArgs: false,
      });

      const eventsByFactory = new Map(group.map((factory) => [factory.address.toLowerCase(), factory.events]));
      const poolsBySwap = new Map<string, { events: MetricEvents; pools: MetricPool[] }>();
      for (const log of createdLogs) {
        const emitter = String(log.address || log.source || "").toLowerCase();
        const events = eventsByFactory.get(emitter);
        if (!events) throw new Error(`Metric PoolCreated log from unknown factory ${emitter}`);
        const args = log.args;
        if (!args?.[events.poolField]) throw new Error(`Metric PoolCreated log from ${emitter} is missing decoded args`);
        const pool: MetricPool = {
          address: String(args[events.poolField]).toLowerCase(),
          token0: String(args.token0).toLowerCase(),
          token1: String(args.token1).toLowerCase(),
          factory: emitter,
          initialConfig: events.fees?.initialConfig(args),
        };
        const bucket = poolsBySwap.get(events.swapEvent);
        if (bucket) bucket.pools.push(pool);
        else poolsBySwap.set(events.swapEvent, { events, pools: [pool] });
      }

      for (const { events, pools } of poolsBySwap.values()) {
        const swapLogs = await options.getLogs({
          targets: pools.map((pool) => pool.address),
          eventAbi: events.swapEvent,
          flatten: false,
          onlyArgs: false,
        });

        const swapsByPool: BookedSwap[][] = swapLogs.map((logs: any[], index: number) => {
          const pool = pools[index];
          return logs.map((log) => {
            const { amount0, amount1 } = events.swapAmounts(log.args);
            const booked = addOneToken({ balances: dailyVolume, token0: pool.token0, amount0, token1: pool.token1, amount1 });
            return { pool, log, amount0, amount1, volumeToken: booked.token };
          });
        });

        if (withFees) {
          const feeFactories = group.filter((factory) => pools.some((pool) => pool.factory === factory.address.toLowerCase()));
          await addMetricFees(options, events.fees!, feeFactories, pools, swapsByPool, feeBalances);
        }
      }
    }

    if (!withFees) return { dailyVolume };
    return {
      dailyVolume,
      dailyFees: feeBalances.dailyFees,
      dailyUserFees: feeBalances.dailyFees.clone(),
      dailySupplySideRevenue: feeBalances.dailySupplySideRevenue,
      dailyRevenue: feeBalances.dailyRevenue,
      dailyProtocolRevenue: feeBalances.dailyRevenue.clone(),
    };
  };

  return {
    version: 2,
    fetch,
    pullHourly: true,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
  };
};

export const getMetricAdapter = (factory: string, chainConfig: MetricChainConfig, events: MetricEvents = LEGACY_EVENTS): SimpleAdapter =>
  getMetricFactoriesAdapter(
    Object.fromEntries(
      Object.entries(chainConfig).map(([chain, { fromBlock, start }]) => [chain, { start, factories: [{ address: factory, fromBlock, events }] }]),
    ),
  );
