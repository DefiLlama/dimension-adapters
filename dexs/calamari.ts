import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { getPositionedLogArgs } from "../helpers/logs";
import { isCoreAsset } from "../helpers/prices";
import { formatAddress } from "../utils/utils";

// Calamari (docs.calamari.trade) - standalone Uniswap v4-styled DEX on Ink, its own PoolManager
// singleton (not the official Uniswap Labs deployment dexs/uniswap-v4.ts already tracks on Ink).
// https://explorer.inkonchain.com/address/0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560
const POOL_MANAGER = "0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560";
const DEPLOY_BLOCK = 54652108; // 2026-08-31

const InitializeEvent =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const SwapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
// Unlike most v4 deployments, Calamari's protocol-fee switch is on: a permissionless
// InkProtocolFeeController stamps pools with v4-core's max (0.1% each direction) once it
// reaches them, so this is read per-pool from history rather than assumed.
const ProtocolFeeUpdatedEvent = "event ProtocolFeeUpdated(bytes32 indexed id, uint24 protocolFee)";

const PIPS = 1_000_000n;
const abs = (v: bigint) => (v < 0n ? -v : v);

type Pool = { currency0: string; currency1: string };
type FeeChange = { blockNumber: number; logIndex: number; protocolFee: number };

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, chain } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Pool registry and protocol-fee history: small, slowly-growing scans, cached.
  const initLogs = await getPositionedLogArgs(options, {
    target: POOL_MANAGER,
    eventAbi: InitializeEvent,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const pools = new Map<string, Pool>();
  for (const log of initLogs) {
    pools.set(String(log.id).toLowerCase(), { currency0: formatAddress(log.currency0), currency1: formatAddress(log.currency1) });
  }

  const feeLogs = await getPositionedLogArgs(options, {
    target: POOL_MANAGER,
    eventAbi: ProtocolFeeUpdatedEvent,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const feeTimelines = new Map<string, FeeChange[]>();
  for (const log of feeLogs) {
    const id = String(log.id).toLowerCase();
    const arr = feeTimelines.get(id) ?? [];
    arr.push({ blockNumber: log.blockNumber, logIndex: log.logIndex, protocolFee: Number(log.protocolFee) });
    feeTimelines.set(id, arr);
  }
  for (const arr of feeTimelines.values()) arr.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  // protocolFee packs two 12-bit fields (zeroForOne low, oneForZero high); replay history by
  // (blockNumber, logIndex) so a pool stamped mid-window still splits correctly either side of it.
  const protocolFeeAt = (poolId: string, blockNumber: number, logIndex: number): number => {
    let current = 0;
    for (const c of feeTimelines.get(poolId) ?? []) {
      if (c.blockNumber > blockNumber || (c.blockNumber === blockNumber && c.logIndex > logIndex)) break;
      current = c.protocolFee;
    }
    return current;
  };

  const blacklistTokens = new Set(getDefaultDexTokensBlacklisted(chain));
  const add = (balances: typeof dailyVolume, token: string, amt: bigint, label?: string) =>
    token === ADDRESSES.null ? balances.addGasToken(amt, label) : balances.add(token, amt, label);

  const swapLogs = await getPositionedLogArgs(options, { target: POOL_MANAGER, eventAbi: SwapEvent });
  for (const log of swapLogs) {
    const poolId = String(log.id).toLowerCase();
    const pool = pools.get(poolId);
    if (!pool) continue; // Initialize always precedes a pool's Swap; skip rather than guess
    if (blacklistTokens.has(pool.currency0) || blacklistTokens.has(pool.currency1)) continue;

    const amount0 = BigInt(log.amount0);
    const amount1 = BigInt(log.amount1);
    // v4's delta is signed from the swapper's side, not the pool's: negative = they paid it
    // in, positive = they received it. Verified against a real tx's own Transfer logs.
    const zeroForOne = amount0 < 0n;

    // Price off the native/core-asset side where possible, matching dexs/uniswap-v4.ts.
    const useToken0 = pool.currency0 === ADDRESSES.null || isCoreAsset(chain, pool.currency0) || !isCoreAsset(chain, pool.currency1);
    const token = useToken0 ? pool.currency0 : pool.currency1;
    const amount = useToken0 ? abs(amount0) : abs(amount1);

    const packedProtocolFee = protocolFeeAt(poolId, log.blockNumber, log.logIndex);
    const protocolFeeRate = BigInt(zeroForOne ? packedProtocolFee & 0xfff : (packedProtocolFee >> 12) & 0xfff);
    // Protocol fee is taken off the input first, independent of the LP fee, so it and the LP
    // cut always sum to the Swap event's own total `fee`.
    const totalFee = (amount * BigInt(log.fee)) / PIPS;
    const protocolCut = (amount * protocolFeeRate) / PIPS;
    const lpCut = totalFee - protocolCut;

    add(dailyVolume, token, amount);
    add(dailyFees, token, totalFee, "Swap Fees");
    add(dailyRevenue, token, protocolCut, "Swap Fees To Protocol");
    add(dailyProtocolRevenue, token, protocolCut, "Swap Fees To Protocol");
    add(dailySupplySideRevenue, token, lpCut, "Swap Fees To LPs");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Swap volume on Calamari's own PoolManager on Ink, priced off the native/core-asset side of each trade.",
  Fees: "Total swap fee (LP + protocol) from each trade's Swap event.",
  Revenue: "Protocol's cut of the swap fee, via v4-core's protocol-fee switch (0% until a pool is stamped, then up to 0.1% each direction).",
  ProtocolRevenue: "Same as Revenue - Calamari has no token or holder distribution.",
  SupplySideRevenue: "Remainder of the swap fee, paid to LPs.",
};

const breakdownMethodology = {
  Fees: { "Swap Fees": "Total swap fee (LP + protocol) reported on the Swap event." },
  Revenue: { "Swap Fees To Protocol": "Protocol's cut per the pool's ProtocolFeeUpdated history." },
  ProtocolRevenue: { "Swap Fees To Protocol": "Protocol's cut per the pool's ProtocolFeeUpdated history." },
  SupplySideRevenue: { "Swap Fees To LPs": "Swap fee remaining after the protocol's cut." },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.INK],
  start: "2026-08-31",
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
