import { Balances, ChainApi } from "@defillama/sdk";
import { AbiCoder, id, keccak256 } from "ethers";
import { FetchOptions } from "../adapters/types";

// Kleos (https://thekleos.pro, https://x.com/TheKleos_) is a launchpad on Elysium. Every coin launches straight into a pool
// that holds all of its supply, with the liquidity locked forever. Two kinds of venue:
//
// - Classic launches trade on KleosSwap, Kleos's own Uniswap v3-style DEX (factory 0x809ff799…), in pools against Kleos's
//   wrapped HYPE. The launchpad owns every launch's position (locked), whose share of the pool's 1% LP fee is split: the HYPE
//   side between the coin's creator (creatorShareBps, part of it possibly set aside for buyback & burn of the coin), the Road
//   to Core fund (coreBpsOf) and the platform; the coin side is burned (FluxLaunchpad.collectFees). Since 2026-11-13 anyone can
//   add liquidity to these pools too (thekleos.pro/liquidity): their share of the fee is theirs, less the 10% of it the
//   platform keeps when they collect through Kleos's page.
// - Taxed launches trade in Uniswap v4 pools whose hook charges a buy / sell tax set by the creator (1-10%) in the pool's pair
//   asset (HYPE, $KLEOS, KNTQ, tokenized stocks…). Every Kleos tax hook (KleosTaxHook, KleosPairHook, KleosV5Hook) splits it
//   the same way and logs it as Taxed: platformBps of it to the platform (or burned, for a pair asset whose platform cut burns,
//   as $KLEOS's does), then of the rest holdersBps to the coin's holders, buybackBps to the coin's buyback & burn, and what's left
//   to the creator. The split is stamped per coin at launch and read with taxOf(token).
//
// Contract sources: https://github.com/aidaonsui-collab/flux (contracts/launchpad, contracts/v4).

export const KLEOS_LABEL = {
  swapTaxes: "Swap Taxes",
  lpFees: "KleosSwap LP Fees",
  toPlatform: "Fees To Platform",
  platformBurned: "Platform Cut Burned ($KLEOS)",
  toCreators: "Fees To Creators",
  toHolders: "Fees To Coin Holders",
  toCoinBuyback: "Fees To Coin Buyback And Burn",
  toCoreFund: "Fees To Road To Core Fund",
  coinSideBurned: "Coin-Side LP Fees Burned",
  toLps: "LP Fees To Liquidity Providers",
  lpInterfaceFee: "Kleos Share Of LP Fees Collected",
};
const LABEL = KLEOS_LABEL;

const NATIVE = "0x0000000000000000000000000000000000000000";
// The $KLEOS token on Elysium: the `quote` of the $KLEOS-paired set in the app's deployment record
// (https://github.com/aidaonsui-collab/flux, app/src/config/deployments/99901.json), and the coin on
// https://thekleos.pro/token/0x51C343Ed5131F17895991849860B61C2cb0E7e7a.
const KLEOS = "0x51c343ed5131f17895991849860b61c2cb0e7e7a";
const BPS = 10_000n;
/** A Uniswap pool's fee unit: hundredths of a basis point (pips), so 1,000,000 is the whole trade. Shares are in it too. */
const PIPS = 1_000_000n;
/**
 * Pool ids asked for in one getLogs call. A PoolManager's Swap logs are filtered by pool id (topic 1); Elysium's nodes
 * (Arbitrum Nitro) refuse a filter with more than 1,000 values in one topic, and 200 keeps each request small.
 */
const POOL_IDS_PER_CALL = 200;
const lower = (a: string) => String(a).toLowerCase();
const abs = (v: bigint) => (v < 0n ? -v : v);

const TAXED = "event Taxed(address indexed token, bool buy, uint256 tax)";
const TAX_OF = "function taxOf(address token) view returns ((address token, address creator, uint16 buyBps, uint16 sellBps, uint16 platformBps, uint16 creatorBps, uint16 holdersBps, uint16 buybackBps))";
const POOL_KEY_OF = "function poolKeyOf(address token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";
const PLAN_OF = "function planOf(address token) view returns ((address quote, bool burnsPlatformCut, uint256 buybackMin, (address token, uint16 bps, address pool, uint32 twapWindow, uint16 maxTickDeviation, uint256 minBatch)[2] rewards))";
const BURNS_PLATFORM_CUT = "function burnsPlatformCut() view returns (bool)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
// The Swap event's topic 0, derived from V4_SWAP's signature (0x40e9cecb…7112f).
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const V3_POOL_CREATED = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const V3_SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const V3_COLLECT = "event Collect(address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)";
const NPM_POSITIONS = "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)";
const GET_LAUNCH = "function getLaunch(address token) view returns ((address creator, uint64 createdAt, uint64 createdBlock, bool tokenIsToken0, uint16 creatorShareBps, uint16 buybackBps, uint64 windowEndsAt, address pool, uint256 positionId, int24 tickLower, int24 tickUpper, uint256 startMarketCap))";
const CORE_BPS_OF = "function coreBpsOf(address token) view returns (uint16)";
const V3_SLOT0 = "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";
const V3_FEE_GROWTH_0 = "function feeGrowthGlobal0X128() view returns (uint256)";
const V3_FEE_GROWTH_1 = "function feeGrowthGlobal1X128() view returns (uint256)";
const V3_TICKS = "function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)";
/** Uniswap v3's fee growth is a Q128 fixed-point number kept modulo 2^256. */
const Q128 = 1n << 128n;
const WORD = 1n << 256n;
const wrapSub = (a: bigint, b: bigint) => (((a - b) % WORD) + WORD) % WORD;

// getLogs can return the same log twice when it splits a busy block range on Elysium (see dexs/montra).
const dedupeLogs = (logs: any[]) => {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${lower(log.transactionHash)}-${Number(log.logIndex)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const poolId = (k: any) =>
  lower(keccak256(AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks])));

export type KleosBalances = {
  dailyVolume: Balances;
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
  dailySupplySideRevenue: Balances;
};

/**
 * The six balances a Kleos adapter fills, each empty: volume; fees (taxes and LP fees traders pay, also reported as user
 * fees); revenue (the platform's cut, kept or burned); protocol revenue (the part the platform keeps); holders revenue
 * (the platform's cut on $KLEOS-paired coins, burned); and supply-side revenue (creators, coin holders, buybacks, the
 * Road to Core fund and liquidity providers).
 */
export function kleosBalances(options: FetchOptions): KleosBalances {
  return {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailyHoldersRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };
}

const addAsset = (balances: Balances, asset: string, amount: bigint, label?: string) => {
  if (amount === 0n) return;
  if (asset === NATIVE) balances.addGasToken(amount, label);
  else balances.add(asset, amount, label);
};

/**
 * A Kleos tax hook's coins on `poolManager`: the taxes it logged in the window (fees, split as each coin's taxOf says), and the
 * swaps in those coins' pools (volume, in the pair asset). The hook's own buyback & burn swaps (sent by the hook) aren't volume;
 * their tax is still a fee, as the hook charges it like any other. A buy's Swap amount is net of the tax it paid, so it's
 * grossed up at the coin's buy rate; a sell's is already gross.
 */
export async function addTaxHook(options: FetchOptions, b: KleosBalances, hook: string, poolManager: string, kind: "v4" | "pair" | "v5") {
  hook = lower(hook);
  const taxed = dedupeLogs(await options.getLogs({ target: hook, eventAbi: TAXED, onlyArgs: false }));
  if (!taxed.length) return;
  const tokens = [...new Set(taxed.map((l: any) => lower(l.args.token)))];
  const [taxes, keys] = await Promise.all([
    options.api.multiCall({ target: hook, abi: TAX_OF, calls: tokens }),
    options.api.multiCall({ target: hook, abi: POOL_KEY_OF, calls: tokens }),
  ]);
  let burns: boolean[];
  if (kind === "v5") {
    // planOf stamps it per coin; an older hook whose Plan reads differently falls back to the one quote that burns it, $KLEOS.
    // The quote is whichever currency of the pool isn't the coin (KleosV5Hook puts it first, but neither order is assumed).
    const plans = await options.api.multiCall({ target: hook, abi: PLAN_OF, calls: tokens, permitFailure: true });
    const quoteOf = (i: number) => lower(lower(keys[i].currency1) === tokens[i] ? keys[i].currency0 : keys[i].currency1);
    burns = tokens.map((_t, i) => (plans[i] ? !!plans[i].burnsPlatformCut : quoteOf(i) === KLEOS));
  } else if (kind === "pair") {
    const b0 = await options.api.call({ target: hook, abi: BURNS_PLATFORM_CUT });
    burns = tokens.map(() => !!b0);
  } else burns = tokens.map(() => false);

  const info: Record<string, { quote: string; quoteIs0: boolean; tax: any; burns: boolean; id: string }> = {};
  const tokenOfPool: Record<string, string> = {};
  tokens.forEach((token, i) => {
    const k = keys[i];
    const quoteIs0 = lower(k.currency1) === token;
    const quote = lower(quoteIs0 ? k.currency0 : k.currency1);
    const id = poolId(k);
    info[token] = { quote, quoteIs0, tax: taxes[i], burns: burns[i], id };
    tokenOfPool[id] = token;
  });

  // Each buy's tax, by transaction and coin, in log order: a buy's Swap amount is net of it (volume below).
  const buyTaxes = new Map<string, bigint[]>();
  for (const log of taxed) {
    if (!log.args.buy) continue;
    const key = `${lower(log.transactionHash)}|${lower(log.args.token)}`;
    const list = buyTaxes.get(key) ?? [];
    list.push(BigInt(log.args.tax));
    buyTaxes.set(key, list);
  }

  // ---- fees: every tax, split as the coin's taxOf says ----
  for (const log of taxed) {
    const { quote, tax: t, burns: burnsCut } = info[lower(log.args.token)];
    const tax = BigInt(log.args.tax);
    const toPlatform = (tax * BigInt(t.platformBps)) / BPS;
    const rest = tax - toPlatform;
    const toHolders = (rest * BigInt(t.holdersBps)) / BPS;
    const toBuyback = (rest * BigInt(t.buybackBps)) / BPS;
    const toCreator = rest - toHolders - toBuyback;
    addAsset(b.dailyFees, quote, tax, LABEL.swapTaxes);
    if (burnsCut) {
      addAsset(b.dailyRevenue, quote, toPlatform, LABEL.platformBurned);
      addAsset(b.dailyHoldersRevenue, quote, toPlatform, LABEL.platformBurned);
    } else {
      addAsset(b.dailyRevenue, quote, toPlatform, LABEL.toPlatform);
      addAsset(b.dailyProtocolRevenue, quote, toPlatform, LABEL.toPlatform);
    }
    addAsset(b.dailySupplySideRevenue, quote, toCreator, LABEL.toCreators);
    addAsset(b.dailySupplySideRevenue, quote, toHolders, LABEL.toHolders);
    addAsset(b.dailySupplySideRevenue, quote, toBuyback, LABEL.toCoinBuyback);
  }

  // ---- volume: swaps in those coins' pools ----
  const ids = Object.keys(tokenOfPool);
  const swapLogs: any[] = [];
  for (let i = 0; i < ids.length; i += POOL_IDS_PER_CALL) {
    swapLogs.push(...await options.getLogs({ target: poolManager, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, ids.slice(i, i + POOL_IDS_PER_CALL)] as any, onlyArgs: false }));
  }
  for (const swap of dedupeLogs(swapLogs)) {
    if (lower(swap.args.sender) === hook) continue; // the hook's own buyback & burn
    const token = tokenOfPool[lower(swap.args.id)];
    if (!token) continue;
    const { quote, quoteIs0, tax: t } = info[token];
    const amount = BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1);
    // The swapper's delta: negative quote = a buy, paying quote net of the tax taken before the swap. Its gross is that
    // plus the tax its own Taxed log charged in the same transaction; the coin's rate now (a creator can lower it) is
    // only the fallback for a buy whose log isn't in the window.
    let gross = amount;
    if (amount < 0n) {
      const charged = buyTaxes.get(`${lower(swap.transactionHash)}|${token}`)?.shift();
      gross = charged !== undefined ? abs(amount) + charged : (abs(amount) * BPS) / (BPS - BigInt(t.buyBps));
    }
    addAsset(b.dailyVolume, quote, gross);
  }
}

/**
 * KleosSwap pools against Kleos's wrapped HYPE: volume on the HYPE leg, and the pool's LP fee. On a launchpad coin's pool the
 * launch's locked position earns part of the fees. What it earned in the window is read from the pool itself, as the pool
 * would pay it: the position's liquidity times the growth of the pool's fee-per-liquidity inside its range between the
 * window's first and last block (Uniswap v3's feeGrowthInside, from feeGrowthGlobal and the two edge ticks' feeGrowthOutside).
 * That is exact however many ticks a trade crosses, where a ratio taken from a Swap log's one `liquidity` figure is not. Its
 * HYPE side (buys' fees) is split as the launch says; its coin side (sells' fees) is burned when collected, valued here at
 * the window's sells' own prices (the coin has no price feed; see the note where it's computed). The rest, and every fee on a pool that isn't a launch, goes to the pool's other liquidity
 * providers.
 *
 * The platform's 10% of the LP fees outside providers collect through Kleos's page (`treasury` as a pool Collect's recipient)
 * is revenue, moved out of what those providers were counted to earn. Only its HYPE side: the coin side isn't priced.
 */
export async function addKleosSwap(options: FetchOptions, b: KleosBalances, cfg: { factory: string; fromBlock: number; whype: string; launchpads: string[]; positionManager: string; treasury: string }) {
  const whype = lower(cfg.whype);
  const created = await options.getLogs({ target: cfg.factory, eventAbi: V3_POOL_CREATED, fromBlock: cfg.fromBlock, cacheInCloud: true });
  const pools: Record<string, { coin: string; whypeIs0: boolean; fee: bigint }> = {};
  for (const p of created) {
    const t0 = lower(p.token0), t1 = lower(p.token1);
    if (t0 !== whype && t1 !== whype) continue;
    pools[lower(p.pool)] = { coin: t0 === whype ? t1 : t0, whypeIs0: t0 === whype, fee: BigInt(p.fee) };
  }
  const targets = Object.keys(pools);
  if (!targets.length) return;
  const swaps = dedupeLogs(await options.getLogs({ targets, eventAbi: V3_SWAP, onlyArgs: false }));
  if (!swaps.length) return;

  const active = [...new Set(swaps.map((s: any) => lower(s.address)))];
  const coins = active.map((p) => pools[p].coin);
  type Launch = { creatorShareBps: bigint; buybackBps: bigint; coreBps: bigint; positionId: string; tickLower: number; tickUpper: number; liquidity: bigint; createdAt: number };
  const launches: Record<string, Launch | null> = {};
  for (const lp of cfg.launchpads) {
    const [ls, cores] = await Promise.all([
      options.api.multiCall({ target: lp, abi: GET_LAUNCH, calls: coins, permitFailure: true }),
      options.api.multiCall({ target: lp, abi: CORE_BPS_OF, calls: coins, permitFailure: true }),
    ]);
    coins.forEach((coin, i) => {
      const l = ls[i];
      if (launches[coin] || !l || lower(l.creator) === NATIVE) return;
      launches[coin] = {
        creatorShareBps: BigInt(l.creatorShareBps),
        buybackBps: BigInt(l.buybackBps),
        coreBps: BigInt(cores[i] ?? 0),
        positionId: String(l.positionId),
        tickLower: Number(l.tickLower),
        tickUpper: Number(l.tickUpper),
        liquidity: 0n,
        createdAt: Number(l.createdAt),
      };
    });
  }
  // Each launch position's liquidity (locked, so it doesn't change).
  const withLaunch = Object.values(launches).filter((l): l is Launch => !!l);
  const positions = await options.api.multiCall({ target: cfg.positionManager, abi: NPM_POSITIONS, calls: withLaunch.map((l) => l.positionId), permitFailure: true });
  withLaunch.forEach((l, i) => (l.liquidity = positions[i] ? BigInt(positions[i].liquidity) : 0n));

  // What each launch position earned in the window, per token: its liquidity times the growth of the pool's fee growth
  // inside its range from the window's first block to its last.
  const launchPools = active.filter((p) => (launches[pools[p].coin]?.liquidity ?? 0n) > 0n);
  /**
   * These pools' fee growth inside their launch ranges, per token, at `api`'s block. No read may fail quietly: a missing
   * figure would be scored as a whole history of fees, so a failed read fails the run and it is tried again.
   */
  const insideAt = async (api: ChainApi, at: string[]) => {
    if (!at.length) return [];
    const edges = at.flatMap((p) => {
      const l = launches[pools[p].coin]!;
      return [{ target: p, params: [l.tickLower] }, { target: p, params: [l.tickUpper] }];
    });
    // One after another: Elysium's public RPC refuses bursts, and these are reads of past state.
    const slots = await api.multiCall({ abi: V3_SLOT0, calls: at });
    const g0s = await api.multiCall({ abi: V3_FEE_GROWTH_0, calls: at });
    const g1s = await api.multiCall({ abi: V3_FEE_GROWTH_1, calls: at });
    const ticks = await api.multiCall({ abi: V3_TICKS, calls: edges });
    return at.map((p, i) => {
      const [lo, hi] = [ticks[2 * i], ticks[2 * i + 1]];
      const l = launches[pools[p].coin]!;
      const tick = Number(slots[i].tick);
      const inside = (g: bigint, outLo: bigint, outHi: bigint) => {
        const below = tick >= l.tickLower ? outLo : wrapSub(g, outLo);
        const above = tick < l.tickUpper ? outHi : wrapSub(g, outHi);
        return wrapSub(wrapSub(g, below), above);
      };
      return [inside(BigInt(g0s[i]), BigInt(lo.feeGrowthOutside0X128), BigInt(hi.feeGrowthOutside0X128)), inside(BigInt(g1s[i]), BigInt(lo.feeGrowthOutside1X128), BigInt(hi.feeGrowthOutside1X128))] as const;
    });
  };
  // A coin launched inside the window has no pool at the window's first block: its launch range's growth started at 0
  // (the launch mints the pool's first position, so its edge ticks start with nothing inside them).
  const older = launchPools.filter((p) => launches[pools[p].coin]!.createdAt < options.fromTimestamp);
  // The window's logs run from its first block to its last, both included, so the starting figure is the state before the
  // first block: the block before it, which is the previous window's last. (`options.fromApi` reads after the first block,
  // and would leave that block's fees out of every window.)
  const before = new ChainApi({ chain: options.chain, block: (await options.getFromBlock()) - 1 });
  const insideOlder = await insideAt(before, older);
  const insideTo = await insideAt(options.toApi, launchPools);
  const insideFrom: Record<string, readonly [bigint, bigint]> = {};
  older.forEach((p, i) => (insideFrom[p] = insideOlder[i]));
  /** A launch pool's launch position's fees over the window: the HYPE side and the coin side, in each token's units. */
  const launchEarned: Record<string, { hype: bigint; coin: bigint }> = {};
  launchPools.forEach((p, i) => {
    const to = insideTo[i];
    const from = insideFrom[p] ?? ([0n, 0n] as const);
    const l = launches[pools[p].coin]!;
    const fee0 = (l.liquidity * wrapSub(to[0], from[0])) / Q128;
    const fee1 = (l.liquidity * wrapSub(to[1], from[1])) / Q128;
    launchEarned[p] = pools[p].whypeIs0 ? { hype: fee0, coin: fee1 } : { hype: fee1, coin: fee0 };
  });

  // Each pool's fees in the window from its swaps: buys pay theirs in HYPE, sells in the coin.
  const paid: Record<string, { hype: bigint; coin: bigint; coinAsHype: bigint }> = {};
  for (const s of swaps) {
    const address = lower(s.address);
    const pool = pools[address];
    // The pool's delta: positive WHYPE = HYPE paid in (a buy), negative = HYPE paid out (a sell).
    const hype = BigInt(pool.whypeIs0 ? s.args.amount0 : s.args.amount1);
    const coin = BigInt(pool.whypeIs0 ? s.args.amount1 : s.args.amount0);
    // Volume before the fee, both ways: a buy's HYPE in already includes it; a sell's fee was taken in the coin, worth
    // fee / (1 - fee) of the HYPE it paid out, so it's added back.
    const sellFee = hype < 0n ? (abs(hype) * pool.fee) / (PIPS - pool.fee) : 0n;
    b.dailyVolume.addGasToken(abs(hype) + sellFee);
    const sum = (paid[address] ??= { hype: 0n, coin: 0n, coinAsHype: 0n });
    if (hype > 0n) sum.hype += (hype * pool.fee) / PIPS;
    else if (hype < 0n && coin > 0n) {
      sum.coin += (coin * pool.fee) / PIPS;
      sum.coinAsHype += sellFee;
    }
  }
  const least = (a: bigint, c: bigint) => (a < c ? a : c);
  for (const [address, sum] of Object.entries(paid)) {
    const launch = launches[pools[address].coin];
    const earned = launchEarned[address] ?? { hype: 0n, coin: 0n };
    // Never more than the pool took in: the swaps' fees are rounded a wei at a time, the position's are not.
    const fee = least(earned.hype, sum.hype);
    // The coin side is an amount of the coin, which has no price here. It's valued at the window's own sells: the
    // launch position's part of the coin fees, times the HYPE value of all of them (each sell's fee at that sell's
    // price). An approximation when the position's share and the price both move between sells in one window (an
    // hour): it shifts value between "burned" and other providers' fees only, never the totals or the revenue.
    const burned = sum.coin > 0n ? (sum.coinAsHype * least(earned.coin, sum.coin)) / sum.coin : 0n;
    b.dailyFees.addGasToken(sum.hype + sum.coinAsHype, LABEL.lpFees);
    b.dailySupplySideRevenue.addGasToken(sum.hype - fee + sum.coinAsHype - burned, LABEL.toLps);
    // The launch position's coin side is burned when collected.
    b.dailySupplySideRevenue.addGasToken(burned, LABEL.coinSideBurned);
    if (!launch || fee === 0n) continue;
    // Its HYPE side is split as the launch says.
    const toCreatorSide = (fee * launch.creatorShareBps) / BPS;
    const toBuyback = (toCreatorSide * launch.buybackBps) / BPS;
    const toCore = (fee * launch.coreBps) / BPS;
    const toPlatform = fee - toCreatorSide - toCore;
    b.dailySupplySideRevenue.addGasToken(toCreatorSide - toBuyback, LABEL.toCreators);
    b.dailySupplySideRevenue.addGasToken(toBuyback, LABEL.toCoinBuyback);
    b.dailySupplySideRevenue.addGasToken(toCore, LABEL.toCoreFund);
    b.dailyRevenue.addGasToken(toPlatform, LABEL.toPlatform);
    b.dailyProtocolRevenue.addGasToken(toPlatform, LABEL.toPlatform);
  }

  // The platform's share of fees collected through Kleos's page: pool Collects paid to the treasury, HYPE side.
  const treasury = lower(cfg.treasury);
  const collects = dedupeLogs(await options.getLogs({ targets, eventAbi: V3_COLLECT, onlyArgs: false }));
  for (const c of collects) {
    if (lower(c.args.recipient) !== treasury) continue;
    const pool = pools[lower(c.address)];
    const hype = BigInt(pool.whypeIs0 ? c.args.amount0 : c.args.amount1);
    if (hype === 0n) continue;
    b.dailyRevenue.addGasToken(hype, LABEL.lpInterfaceFee);
    b.dailyProtocolRevenue.addGasToken(hype, LABEL.lpInterfaceFee);
    // Already counted with the fees, as other providers' share: it's the platform's instead.
    b.dailySupplySideRevenue.subtractToken(NATIVE, hype, LABEL.toLps); // keyed as addGasToken keys it (the null address)
  }
}

export const KLEOS_METHODOLOGY = {
  Volume: "Value of every trade in Kleos's pools, in the pool's pair asset (HYPE, $KLEOS, KNTQ, …) and before the trading fee or tax. Kleos's own buyback & burn swaps are left out.",
  Fees: "On taxed coins, the buy / sell tax each creator set (1-10%), paid in the pair asset on every trade. On classic coins, KleosSwap's LP fee (1%).",
  UserFees: "The taxes and LP fees traders pay on every trade.",
  Revenue: "The platform's cut of every tax (or, for a pair asset whose platform cut burns, such as $KLEOS, that burn), the platform's part of the LP fees classic coins' locked launch positions earn on KleosSwap, and the platform's 10% of the LP fees other providers collect through Kleos's liquidity page (its HYPE side).",
  ProtocolRevenue: "The platform's cut of taxes and classic LP fees that the platform keeps, and its 10% of LP fees collected through Kleos's page.",
  HoldersRevenue: "The platform's cut of taxes on $KLEOS-paired coins, which is burned.",
  SupplySideRevenue: "The rest: each coin's creator, its holders (rewards), its buyback & burn, the Road to Core fund on classic coins, the coin side of classic launch positions' LP fees (burned), and the LP fees other liquidity providers earn on KleosSwap (their share of each trade by active liquidity), less the platform's 10% of what they collect through Kleos's page.",
};

export const KLEOS_BREAKDOWN = {
  Fees: {
    [LABEL.swapTaxes]: "Buy / sell tax on taxed coins, from the hook's Taxed events.",
    [LABEL.lpFees]: "KleosSwap's pool fee on classic coins' trades.",
  },
  UserFees: {
    [LABEL.swapTaxes]: "Buy / sell tax paid by traders.",
    [LABEL.lpFees]: "KleosSwap pool fee paid by traders.",
  },
  Revenue: {
    [LABEL.toPlatform]: "The platform's share of taxes (platformBps, stamped per coin) and of classic coins' HYPE-side LP fees.",
    [LABEL.platformBurned]: "The platform's share of taxes on $KLEOS-paired coins, burned.",
    [LABEL.lpInterfaceFee]: "10% of the LP fees other providers collect through Kleos's liquidity page (HYPE side), paid to the platform in the collect.",
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "The platform's share the platform keeps.",
    [LABEL.lpInterfaceFee]: "10% of the LP fees collected through Kleos's liquidity page (HYPE side).",
  },
  HoldersRevenue: {
    [LABEL.platformBurned]: "The platform's share of taxes on $KLEOS-paired coins, burned.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "The coin creator's share.",
    [LABEL.toHolders]: "Rewards to the coin's holders.",
    [LABEL.toCoinBuyback]: "Set aside to buy back and burn the coin.",
    [LABEL.toCoreFund]: "Classic coins' Road to Core share (coreBpsOf).",
    [LABEL.coinSideBurned]: "Classic coins' LP fees paid in the coin, burned by the launchpad.",
    [LABEL.toLps]: "LP fees earned by liquidity providers other than the launch position (the pool's fees less what the launch position earned), less the platform's 10% of what's collected through Kleos's page.",
  },
};
