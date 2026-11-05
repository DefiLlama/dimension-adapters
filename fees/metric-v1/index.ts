import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { chainConfig as volumeChainConfig } from "../../dexs/metric-v1";
import { MetricFactoriesChainConfig } from "../../dexs/metric-v1/utils";

// The current factory exposes the LP, spread and notional amounts separately.
// Earlier pools expose only a protocol fee, so their swaps are excluded.
const FEES_START = "2026-09-15";

const chainConfig: MetricFactoriesChainConfig = Object.fromEntries(
  Object.entries(volumeChainConfig).map(([chain, { factories }]) => [
    chain,
    { start: FEES_START, factories: factories.filter((factory) => factory.events?.fees) },
  ]),
);

const GET_IMMUTABLES_ABI =
  "function getImmutables() view returns ((address factory, address token0, address token1, uint256 token0ScaleMultiplier, uint256 token1ScaleMultiplier, uint256 initialScaledToken0PerShareE18, uint256 initialScaledToken1PerShareE18, uint256 minimalOperationalLiquidity, address immutablePriceProvider, int256 lowestBin, int256 highestBin, address extension1, address extension2, address extension3, address extension4, address extension5, address extension6, address extension7, uint256 beforeAddLiquidityOrder, uint256 afterAddLiquidityOrder, uint256 beforeRemoveLiquidityOrder, uint256 afterRemoveLiquidityOrder, uint256 beforeSwapOrder, uint256 afterSwapOrder))";
const POOL_FEE_CONFIG_ABI =
  "function poolFeeConfig(address pool) view returns (uint24 protocolSpreadFeeE6, uint24 adminSpreadFeeE6, uint24 protocolNotionalFeeE8, uint24 adminNotionalFeeE8)";

const LABELS = {
  SwapFeesToLPs: "Swap Fees To LPs",
  SwapFeesToCurators: "Swap Fees To Pool Curators",
  SwapFeesToProtocol: "Swap Fees To Protocol",
};

const rateEvents = {
  adminSpreadFeeE6: "PoolAdminSpreadFeeUpdated",
  adminNotionalFeeE8: "PoolAdminNotionalFeeUpdated",
  protocolSpreadFeeE6: "PoolProtocolSpreadFeeUpdated",
  protocolNotionalFeeE8: "PoolProtocolNotionalFeeUpdated",
} as const;
type Rate = keyof typeof rateEvents;
type Rates = Record<Rate, bigint>;

function readRates(config: any): Rates {
  return {
    protocolSpreadFeeE6: BigInt(config.protocolSpreadFeeE6 ?? config.spreadProtocolFeeE6),
    adminSpreadFeeE6: BigInt(config.adminSpreadFeeE6),
    protocolNotionalFeeE8: BigInt(config.protocolNotionalFeeE8),
    adminNotionalFeeE8: BigInt(config.adminNotionalFeeE8),
  };
}

function adminShare(amount: bigint, protocol: bigint, admin: bigint) {
  if (amount === 0n) return 0n;
  if (protocol + admin === 0n) throw new Error("Metric platform fee with zero configured rates");
  return amount * admin / (protocol + admin);
}

function inputSide(delta0: bigint, delta1: bigint) {
  if ((delta0 > 0n) === (delta1 > 0n)) throw new Error("Ambiguous input token on fee-bearing Metric event");
  return delta0 > 0n ? 0 : 1;
}

type Entry = { block: number; index: number; pool: string } & (
  { kind: "swap"; args: any } | { kind: "update"; rate: Rate; value: bigint }
);

function position(log: any) {
  const block = Number(log.blockNumber ?? log.block_number);
  const index = Number(log.logIndex ?? log.log_index ?? log.index);
  if (!Number.isSafeInteger(block) || !Number.isSafeInteger(index)) throw new Error("Missing Metric event position");
  return { block, index };
}

// RPC fallback may include a boundary block twice when subdividing a query.
function uniqueLogs(logs: any[]) {
  const seen = new Set<string>();
  return logs.filter(log => {
    const { block, index } = position(log);
    const key = `${log.address}:${block}:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [start, end] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  for (const factory of chainConfig[options.chain].factories) {
    if (end < factory.fromBlock) continue;
    const events = factory.events!;
    const fees = events.fees!;
    const fromBlock = Math.max(start, factory.fromBlock);
    const range = { fromBlock, toBlock: end, onlyArgs: false, maxBlockRange: 10000 };
    // Every fee-bearing swap emits a BinSwapped as it accumulates its fees.
    const bins: any[] = [];
    // Public RPCs can silently cap broad topic queries. Subdivide dense ranges
    // and bypass cached responses that may already contain an incomplete range.
    async function getBins(first: number, last: number): Promise<void> {
      const logs = await options.getLogs({ ...range, fromBlock: first, toBlock: last, skipCache: true,
        noTarget: true, allowParseFailure: true, eventAbi: fees.binSwappedEvent });
      if (logs.length < 900) {
        bins.push(...logs);
        return;
      }
      if (first === last) throw new Error(`Metric bin log cap reached at block ${first}`);
      const mid = Math.floor((first + last) / 2);
      await getBins(first, mid);
      await getBins(mid + 1, last);
    }
    const chunkSize = 900;
    for (let first = fromBlock; first <= end; first += chunkSize) {
      await getBins(first, Math.min(first + chunkSize - 1, end));
    }
    const emitters = [...new Set<string>(bins.map(log => log.address.toLowerCase()))];
    if (!emitters.length) continue;

    const calls = emitters.map(pool => ({ target: factory.address, params: [pool] }));
    const registered = await options.api.multiCall({ abi: "function isPool(address) view returns (bool)", calls });
    const pools = emitters.filter((_, i) => registered[i]);
    if (!pools.length) continue;
    const active = new Set(pools);
    const [immutables, updates] = await Promise.all([
      options.api.multiCall({ abi: GET_IMMUTABLES_ABI, calls: pools }),
      Promise.all((Object.keys(rateEvents) as Rate[]).map(async rate => {
        const logs = await options.getLogs({ ...range, target: factory.address,
          eventAbi: `event ${rateEvents[rate]}(address indexed pool, uint24 value)` });
        return uniqueLogs(logs).map((log): Entry => ({ ...position(log), kind: "update", pool: log.args.pool.toLowerCase(), rate, value: BigInt(log.args.value) }));
      })),
    ]);
    const entries: Entry[] = updates.flat().filter(e => active.has(e.pool));
    const changed = new Set(entries.map(e => e.pool));
    const created = new Map<string, Rates>();
    if (changed.size) {
      const logs = await options.getLogs({ ...range, target: factory.address, eventAbi: events.poolCreatedEvent });
      for (const log of logs) created.set(log.args.poolAddress.toLowerCase(), readRates(log.args));
    }
    // Closing state is valid throughout the interval only if no rate update occurred.
    // Changed pools start from creation or state immediately before the inclusive first block.
    const rates = new Map<string, Rates>();
    async function loadRates(api: ChainApi, addresses: string[]) {
      if (!addresses.length) return;
      const configs = await api.multiCall({ abi: POOL_FEE_CONFIG_ABI, calls: addresses.map(pool => ({ target: factory.address, params: [pool] })) });
      addresses.forEach((pool, i) => rates.set(pool, readRates(configs[i])));
    }
    for (const pool of changed) if (created.has(pool)) rates.set(pool, created.get(pool)!);
    await Promise.all([
      loadRates(options.api, pools.filter(pool => !changed.has(pool))),
      loadRates(new ChainApi({ chain: options.chain, block: fromBlock - 1 }), [...changed].filter(pool => !created.has(pool))),
    ]);

    // FeeMath.notionalPartOfPlatformTake returns zero when notional is disabled.
    // In stable spread-only pools the bin event therefore contains both amounts
    // needed for accounting. Fetch individual Swap legs only for the other pools.
    const needsSwap = new Set(pools.filter(pool => {
      const r = rates.get(pool)!;
      return changed.has(pool) || r.protocolNotionalFeeE8 + r.adminNotionalFeeE8 > 0n;
    }));
    const swaps = needsSwap.size ? await options.getLogs({
      ...range, targets: [...needsSwap], flatten: true, eventAbi: events.swapEvent,
    }) : [];
    const newSide = () => ({ lp: 0n, binPlatform: 0n, spread: 0n, notional: 0n, protocol: 0n, admin: 0n });
    const amounts = new Map(pools.map(pool => [pool, [newSide(), newSide()]]));
    function split(pool: string) {
      const r = rates.get(pool)!;
      for (const side of amounts.get(pool)!) {
        const admin = adminShare(side.spread, r.protocolSpreadFeeE6, r.adminSpreadFeeE6)
          + adminShare(side.notional, r.protocolNotionalFeeE8, r.adminNotionalFeeE8);
        side.admin += admin;
        side.protocol += side.spread + side.notional - admin;
        side.spread = side.notional = 0n;
      }
    }
    for (const log of uniqueLogs(bins)) {
      const pool = log.address.toLowerCase();
      const sides = amounts.get(pool);
      if (!sides) continue;
      const { delta0, delta1, lpFee, platformFee } = fees.binSwapped(log.args);
      if (!lpFee && !platformFee) continue;
      const side = sides[inputSide(delta0, delta1)];
      side.lp += lpFee;
      side.binPlatform += platformFee;
      if (!needsSwap.has(pool)) side.spread += platformFee;
    }
    for (const log of uniqueLogs(swaps)) {
      const pool = log.address.toLowerCase();
      if (needsSwap.has(pool)) entries.push({ ...position(log), pool, kind: "swap", args: log.args });
    }
    entries.sort((a, b) => a.block - b.block || a.index - b.index);
    for (const entry of entries) {
      if (entry.kind === "update") {
        split(entry.pool);
        rates.get(entry.pool)![entry.rate] = entry.value;
      } else {
        const { spreadFee, notionalFee } = fees.swapPlatformFees(entry.args);
        if (!spreadFee && !notionalFee) continue;
        const { amount0, amount1 } = events.swapAmounts(entry.args);
        const side = amounts.get(entry.pool)![inputSide(amount0, amount1)];
        side.spread += spreadFee;
        side.notional += notionalFee;
      }
    }
    pools.forEach((pool, i) => {
      split(pool);
      const imm = immutables[i];
      amounts.get(pool)!.forEach((side, j) => {
        if (side.binPlatform !== side.protocol + side.admin)
          throw new Error(`Metric bin and swap platform fees disagree for ${pool} token${j}`);
        const token = j === 0 ? imm.token0 : imm.token1;
        const scale = Number(j === 0 ? imm.token0ScaleMultiplier : imm.token1ScaleMultiplier);
        const native = (value: bigint) => Number(value) / scale;
        dailyFees.add(token, native(side.lp + side.protocol + side.admin), METRIC.SWAP_FEES);
        dailyRevenue.add(token, native(side.protocol), LABELS.SwapFeesToProtocol);
        dailySupplySideRevenue.add(token, native(side.lp), LABELS.SwapFeesToLPs);
        dailySupplySideRevenue.add(token, native(side.admin), LABELS.SwapFeesToCurators);
      });
    });
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const protocol = "Protocol share of swap fees accrued at the factory's per-pool spread and notional rates.";
const methodology = {
  Fees: "Spread and notional fees accrued from swaps in current-factory Metric pools since September 15, 2026. Retired-factory pools are excluded.",
  Revenue: protocol,
  ProtocolRevenue: protocol,
  SupplySideRevenue: "Fees retained in liquidity bins plus fees accrued to pool curators.",
};
const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: methodology.Fees },
  Revenue: { [LABELS.SwapFeesToProtocol]: protocol },
  ProtocolRevenue: { [LABELS.SwapFeesToProtocol]: protocol },
  SupplySideRevenue: {
    [LABELS.SwapFeesToLPs]: "LP fees retained in the bins crossed by each swap.",
    [LABELS.SwapFeesToCurators]: "Pool admin share of accrued platform fees, computed separately for spread and notional.",
  },
};
const adapter: SimpleAdapter = { version: 2, fetch, pullHourly: true, adapter: chainConfig, methodology, breakdownMethodology };
export default adapter;
