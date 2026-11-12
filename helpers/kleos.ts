import { AbiCoder, keccak256 } from "ethers";
import { FetchOptions } from "../adapters/types";

// Kleos (https://thekleos.pro, https://x.com/TheKleos_) is a launchpad on Elysium. Every coin launches straight into a pool
// that holds all of its supply, with the liquidity locked forever. Two kinds of venue:
//
// - Classic launches trade on KleosSwap, Kleos's own Uniswap v3-style DEX (factory 0x809ff799…), in pools against Kleos's
//   wrapped HYPE. The pool's 1% LP fee belongs to the launchpad, which owns every launch's position: the HYPE side is split
//   between the coin's creator (creatorShareBps, part of it possibly set aside for buyback & burn of the coin), the Road to Core
//   fund (coreBpsOf) and the platform; the coin side is burned (FluxLaunchpad.collectFees).
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
};
const LABEL = KLEOS_LABEL;

const NATIVE = "0x0000000000000000000000000000000000000000";
const KLEOS = "0x51c343ed5131f17895991849860b61c2cb0e7e7a";
const BPS = 10_000n;
const lower = (a: string) => String(a).toLowerCase();
const abs = (v: bigint) => (v < 0n ? -v : v);

const TAXED = "event Taxed(address indexed token, bool buy, uint256 tax)";
const TAX_OF = "function taxOf(address token) view returns ((address token, address creator, uint16 buyBps, uint16 sellBps, uint16 platformBps, uint16 creatorBps, uint16 holdersBps, uint16 buybackBps))";
const POOL_KEY_OF = "function poolKeyOf(address token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))";
const PLAN_OF = "function planOf(address token) view returns ((address quote, bool burnsPlatformCut, uint256 buybackMin, (address token, uint16 bps, address pool, uint32 twapWindow, uint16 maxTickDeviation, uint256 minBatch)[2] rewards))";
const BURNS_PLATFORM_CUT = "function burnsPlatformCut() view returns (bool)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const V3_POOL_CREATED = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const V3_SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const GET_LAUNCH = "function getLaunch(address token) view returns ((address creator, uint64 createdAt, uint64 createdBlock, bool tokenIsToken0, uint16 creatorShareBps, uint16 buybackBps, uint64 windowEndsAt, address pool, uint256 positionId, int24 tickLower, int24 tickUpper, uint256 startMarketCap))";
const CORE_BPS_OF = "function coreBpsOf(address token) view returns (uint16)";

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
  dailyVolume: any; dailyFees: any; dailyRevenue: any; dailyProtocolRevenue: any; dailyHoldersRevenue: any; dailySupplySideRevenue: any;
};

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

const addAsset = (balances: any, asset: string, amount: bigint, label?: string) => {
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
    const plans = await options.api.multiCall({ target: hook, abi: PLAN_OF, calls: tokens, permitFailure: true });
    burns = tokens.map((_t, i) => (plans[i] ? !!plans[i].burnsPlatformCut : lower(keys[i].currency0) === KLEOS));
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
  for (let i = 0; i < ids.length; i += 200) {
    swapLogs.push(...await options.getLogs({ target: poolManager, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, ids.slice(i, i + 200)] as any, onlyArgs: false }));
  }
  for (const swap of dedupeLogs(swapLogs)) {
    if (lower(swap.args.sender) === hook) continue; // the hook's own buyback & burn
    const token = tokenOfPool[lower(swap.args.id)];
    if (!token) continue;
    const { quote, quoteIs0, tax: t } = info[token];
    const amount = BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1);
    // The swapper's delta: negative quote = a buy, paying quote net of the tax taken before the swap.
    const gross = amount < 0n ? (abs(amount) * BPS) / (BPS - BigInt(t.buyBps)) : amount;
    addAsset(b.dailyVolume, quote, gross);
  }
}

/**
 * KleosSwap pools against Kleos's wrapped HYPE: volume on the HYPE leg, and the pool's LP fee. On a launchpad coin's pool the
 * launchpad owns the liquidity: a buy's fee (paid in HYPE) is split as the launch says; a sell's (paid in the coin) is burned
 * when collected, valued here at the HYPE the sell paid out. On any other pool the fee goes to its liquidity providers.
 */
export async function addKleosSwap(options: FetchOptions, b: KleosBalances, cfg: { factory: string; fromBlock: number; whype: string; launchpads: string[] }) {
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
  const launches: Record<string, { creatorShareBps: bigint; buybackBps: bigint; coreBps: bigint } | null> = {};
  for (const lp of cfg.launchpads) {
    const [ls, cores] = await Promise.all([
      options.api.multiCall({ target: lp, abi: GET_LAUNCH, calls: coins, permitFailure: true }),
      options.api.multiCall({ target: lp, abi: CORE_BPS_OF, calls: coins, permitFailure: true }),
    ]);
    coins.forEach((coin, i) => {
      const l = ls[i];
      if (launches[coin] || !l || lower(l.creator) === NATIVE) return;
      launches[coin] = { creatorShareBps: BigInt(l.creatorShareBps), buybackBps: BigInt(l.buybackBps), coreBps: BigInt(cores[i] ?? 0) };
    });
  }

  for (const s of swaps) {
    const pool = pools[lower(s.address)];
    // The pool's delta: positive WHYPE = HYPE paid in (a buy), negative = HYPE paid out (a sell).
    const hype = BigInt(pool.whypeIs0 ? s.args.amount0 : s.args.amount1);
    b.dailyVolume.addGasToken(abs(hype));
    const launch = launches[pool.coin];
    if (hype > 0n) {
      const fee = (hype * pool.fee) / 1_000_000n;
      b.dailyFees.addGasToken(fee, LABEL.lpFees);
      if (!launch) { b.dailySupplySideRevenue.addGasToken(fee, LABEL.toLps); continue; }
      const toCreatorSide = (fee * launch.creatorShareBps) / BPS;
      const toBuyback = (toCreatorSide * launch.buybackBps) / BPS;
      const toCore = (fee * launch.coreBps) / BPS;
      const toPlatform = fee - toCreatorSide - toCore;
      b.dailySupplySideRevenue.addGasToken(toCreatorSide - toBuyback, LABEL.toCreators);
      b.dailySupplySideRevenue.addGasToken(toBuyback, LABEL.toCoinBuyback);
      b.dailySupplySideRevenue.addGasToken(toCore, LABEL.toCoreFund);
      b.dailyRevenue.addGasToken(toPlatform, LABEL.toPlatform);
      b.dailyProtocolRevenue.addGasToken(toPlatform, LABEL.toPlatform);
    } else if (hype < 0n) {
      // The fee was paid in the coin; it's worth fee / (1 - fee) of the HYPE the sell paid out.
      const fee = (abs(hype) * pool.fee) / (1_000_000n - pool.fee);
      b.dailyFees.addGasToken(fee, LABEL.lpFees);
      b.dailySupplySideRevenue.addGasToken(fee, launch ? LABEL.coinSideBurned : LABEL.toLps);
    }
  }
}

export const KLEOS_METHODOLOGY = {
  Volume: "Value of every trade in Kleos's pools, in the pool's pair asset (HYPE, $KLEOS, KNTQ, …) and before the trading fee or tax. Kleos's own buyback & burn swaps are left out.",
  Fees: "On taxed coins, the buy / sell tax each creator set (1-10%), paid in the pair asset on every trade. On classic coins, KleosSwap's LP fee (1%).",
  UserFees: "The taxes and LP fees traders pay on every trade.",
  Revenue: "The platform's cut of every tax (or, for a pair asset whose platform cut burns, such as $KLEOS, that burn), and the platform's part of KleosSwap LP fees on classic coins.",
  ProtocolRevenue: "The platform's cut of taxes and classic LP fees that the platform keeps.",
  HoldersRevenue: "The platform's cut of taxes on $KLEOS-paired coins, which is burned.",
  SupplySideRevenue: "The rest: each coin's creator, its holders (rewards), its buyback & burn, the Road to Core fund on classic coins, the coin side of classic LP fees (burned), and LP fees on KleosSwap pools that aren't launches.",
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
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "The platform's share the platform keeps.",
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
    [LABEL.toLps]: "LP fees on KleosSwap pools that aren't Kleos launches, to their liquidity providers.",
  },
};
