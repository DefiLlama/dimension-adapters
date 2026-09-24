import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Tsunami (tsunami.trade) - bonding-curve token launchpad on Ink.
//
// Slug note: `factory/uniSubgraph.ts` already has a dead "tsunami" key (the same brand's prior
// V3-subgraph DEX phase on Ink, deadFrom 2026-08-04, subgraph project literally named
// "tsunami-v3"). That entry is registered under both the fees and dexs adapter types via
// factory/registry.ts, so a new file also named "tsunami" would collide with it under the same
// adapter type. This is a different mechanism entirely (bonding-curve launches on a dedicated v4
// hook, not a subgraph-tracked AMM), so it gets its own versioned slug rather than reusing or
// renaming the dead entry - never rename/delete an existing adapter's key.
//
// Every launch trades as a real Uniswap-v4-style pool from day one on Calamari, a separate,
// dedicated PoolManager deployed on Ink - NOT the canonical Uniswap Labs PoolManager that
// dexs/uniswap-v4.ts tracks for CHAIN.INK (0x360e68faccca8ca495c1b759fd9eee466db9fb32). Not
// doublecounted there today; revisit if/when Calamari itself gets a dex/fees listing on this
// PoolManager.
// https://explorer.inkonchain.com/address/0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560
// (verified contract "PoolManager", standard v4 ABI; also listed at
// https://docs.tsunami.trade/reference/addresses.md under "Calamari Periphery")
const CALAMARI_POOL_MANAGER = "0x6E4723A612831AfB9f5B2a5aE22723c37aAB9560";

// Original factory, deployed block 54686019 (2026-08-31T13:53:50Z, tx
// 0x2998315e4911cf3526a5ea995c5e9cdb5befd08fe4e5507dda34942356e477a0). Used as the Initialize-log
// floor and the adapter start date.
const DEPLOY_BLOCK = 54686019;

const SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const INITIALIZE_EVENT =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";

// Two ABI generations, verified per-address on https://explorer.inkonchain.com/address/<addr>:
const SWAP_FEE_ACCRUED_V2 = "event SwapFeeAccrued(address indexed currency, address indexed curve, uint256 amount)";
const SWAP_FEE_ACCRUED_V1 = "event SwapFeeAccrued(address indexed currency, uint256 amount)";

const NATIVE = "0x0000000000000000000000000000000000000000";

type HookConfig = { address: string; hasCurveIndex: boolean; creatorBps: number };

// swapFeeBps()/SWAP_FEE_BPS() reads 100 (1%) live on every hook below, matching
// https://docs.tsunami.trade/reference/addresses.md ("Platform fees: 100 bps (1%)").
// What changed across hook generations is the platform/creator SPLIT of that fee:
// - historical (0x110aAc8...) and previous ("Legacy Hook", 0xbA7286...) predate the creator-fee
//   feature entirely (their SwapFeeAccrued/FeesSwept ABIs have no creator leg) - 100% platform.
// - current (0x5dC5426..., original factory) and the second factory's hook (0xAE08d8b...,
//   deployed 2026-09-13, zero launches through it as of writing) both support a creator split.
//   The docs give defaults of 30% (original factory) and 1% (second factory) to the creator, but
//   explicitly note "individual curves require separate split configuration" - there is no
//   on-chain getter for a per-curve split (the curve/factory implementation contracts are
//   unverified), so this is a documented approximation, not a live-read value.
const HOOKS: HookConfig[] = [
  { address: "0x110aAc8EE9cd4853fb2C12F4F73937996ECfA8CC", hasCurveIndex: false, creatorBps: 0 }, // historical
  { address: "0xbA7286377D0369F566256770Dbe2FC59D13128cC", hasCurveIndex: false, creatorBps: 0 }, // previous / Legacy Hook
  { address: "0x5dC5426A33c1D095B9fD0449ac16F6AaeBEeE8cc", hasCurveIndex: true, creatorBps: 3000 }, // current, original factory
  { address: "0xAE08d8bFF05b19a32F0215123244e70DD54368Cc", hasCurveIndex: true, creatorBps: 100 }, // current, second factory (2026-09-13)
];

const BPS = 10000n;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const feeLogs: { log: any; hook: HookConfig }[] = [];
  for (const hook of HOOKS) {
    const logs = await options.getLogs({
      target: hook.address,
      eventAbi: hook.hasCurveIndex ? SWAP_FEE_ACCRUED_V2 : SWAP_FEE_ACCRUED_V1,
      entireLog: true,
    });
    for (const log of logs) feeLogs.push({ log, hook });
  }
  if (!feeLogs.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };

  // Pool registry: currency0/currency1 per poolId, restricted to pools created with one of our
  // hooks, so this never picks up unrelated Calamari pools. Slowly-changing, so cached.
  const initLogs = await options.getLogs({
    target: CALAMARI_POOL_MANAGER,
    eventAbi: INITIALIZE_EVENT,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const hookAddresses = new Set(HOOKS.map((h) => h.address.toLowerCase()));
  const poolCurrencies = new Map<string, [string, string]>();
  for (const log of initLogs) {
    const args = log.args ?? log;
    if (!hookAddresses.has(String(args.hooks).toLowerCase())) continue;
    poolCurrencies.set(String(args.id).toLowerCase(), [
      String(args.currency0).toLowerCase(),
      String(args.currency1).toLowerCase(),
    ]);
  }

  const txHashes = new Set(feeLogs.map((f) => String(f.log.transactionHash).toLowerCase()));

  // Calamari's own Swap stream for the window, filtered down to transactions that also carried a
  // Tsunami fee log. Calamari's overall volume is still small (a new, dedicated PoolManager), so
  // a full scan filtered client-side is acceptable for now; if Calamari grows into shared
  // multi-protocol infra this needs a pool-id allowlist instead.
  const swapLogs = await options.getLogs({ target: CALAMARI_POOL_MANAGER, eventAbi: SWAP_EVENT, entireLog: true });
  const swapsByTx = new Map<string, any[]>();
  for (const log of swapLogs) {
    const tx = String(log.transactionHash).toLowerCase();
    if (!txHashes.has(tx)) continue;
    if (!swapsByTx.has(tx)) swapsByTx.set(tx, []);
    swapsByTx.get(tx)!.push(log);
  }
  for (const arr of swapsByTx.values()) arr.sort((a, b) => a.logIndex - b.logIndex);

  // Paired by tx, consumed in log order - correct for the overwhelmingly common single-hop swap;
  // a router batching several Tsunami trades in one tx is a known, accepted approximation here.
  const nextSwapIdx = new Map<string, number>();
  for (const { log, hook } of feeLogs.sort((a, b) => a.log.logIndex - b.log.logIndex)) {
    const args = log.args ?? log;
    const tx = String(log.transactionHash).toLowerCase();
    const currency = String(args.currency).toLowerCase();
    const fee = BigInt(args.amount);

    const swaps = swapsByTx.get(tx);
    if (!swaps?.length) continue; // fee accrued but its Swap fell outside this window/target
    const idx = Math.min(nextSwapIdx.get(tx) ?? 0, swaps.length - 1);
    nextSwapIdx.set(tx, idx + 1);
    const swap = swaps[idx];
    const sArgs = swap.args ?? swap;

    const currencies = poolCurrencies.get(String(sArgs.id).toLowerCase());
    if (!currencies) continue; // pool not seen in the Initialize registry - skip rather than guess
    const [currency0] = currencies;
    const delta = BigInt(currency === currency0 ? sArgs.amount0 : sArgs.amount1);

    // beforeSwap charges the fee out of the input leg before the swap runs, so the pool-reported
    // delta is already net of it (negative delta = user paying in); afterSwap charges it out of
    // the output leg after the swap settles, so the delta is already gross (positive = user
    // receiving). Verified against a live buy (delta -0.099 ETH, fee 0.001 ETH, gross 0.1 ETH)
    // and a live sell (delta and fee both positive, fee exactly 1% of delta, no addition needed).
    const gross = delta < 0n ? -delta + fee : delta;

    const add = (balances: typeof dailyVolume, amount: bigint, label?: string) => {
      if (currency === NATIVE) balances.addGasToken(amount, label);
      else balances.add(currency, amount, label);
    };

    const creatorCut = (fee * BigInt(hook.creatorBps)) / BPS;
    const platformCut = fee - creatorCut;

    add(dailyVolume, gross);
    add(dailyFees, fee, "Swap Fees");
    add(dailyRevenue, platformCut, "Swap Fees to Protocol");
    add(dailyProtocolRevenue, platformCut, "Swap Fees to Protocol");
    add(dailySupplySideRevenue, creatorCut, "Swap Fees to Creators");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Swap volume on Tsunami's bonding-curve launches, all of which trade as Uniswap v4-style pools on Calamari's dedicated PoolManager on Ink, measured in each pool's quote currency",
  Fees: "1% swap fee charged by Tsunami's fee hook on every swap (buy and sell alike)",
  Revenue:
    "The protocol's share of the swap fee: 100% before the creator-fee hook upgrade, then the documented default share (70% original factory, 99% second factory) after - a curve can be configured with a different split",
  ProtocolRevenue:
    "Same as Revenue: all protocol-side fees go to the Tsunami treasury, there is no token holder distribution",
  SupplySideRevenue:
    "The token creator's documented default share of the swap fee (30% original factory, 1% second factory) once the creator-fee hook was live - a curve can be configured with a different split",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "1% swap fee collected by Tsunami's fee hook on every trade",
  },
  Revenue: {
    "Swap Fees to Protocol": "Protocol's share of the swap fee (100% pre creator-fee hook, then the documented default per factory)",
  },
  ProtocolRevenue: {
    "Swap Fees to Protocol": "Protocol's share of the swap fee (100% pre creator-fee hook, then the documented default per factory)",
  },
  SupplySideRevenue: {
    "Swap Fees to Creators": "Token creator's documented default share of the swap fee, once the creator-fee hook was live",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INK],
  methodology,
  breakdownMethodology,
  start: "2026-08-31",
};

export default adapter;
