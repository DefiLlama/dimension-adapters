import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

// BOXA (https://boxa.pro) is a token launchpad on Elysium. Every coin trades in its own Uniswap v4 pool (0% LP fee) whose hook is
// a BOXA hook; the hook owns all launch liquidity and charges a fee in the pool's pair asset on every buy and sell: the 1% pool fee
// plus an optional extra tax set by the creator at launch, fixed for the coin's life. Fees are split between BOXA's treasury and the
// creator side (creator, holder rewards in the pair asset, buyback & burn of the coin). Hook sources are not published or verified,
// so event signatures were matched against their on-chain topic0, and the FeeTaken field order against the documented split.

// Logged once per fee-paying swap (every launch charges at least 1% per side); total = boxa + creator + holders + buyback.
// On a buy it is logged just before the PoolManager Swap (exact input) or just after it (exact output), on a sell just after.
const FEE_TAKEN = "event FeeTaken(bytes32 indexed poolId, uint256 total, uint256 boxa, uint256 creator, uint256 holders, uint256 buyback)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const NATIVE = "0x0000000000000000000000000000000000000000";

const LABEL = {
  swapFees: "Swap Fees",
  toTreasury: "Swap Fees To BOXA Treasury",
  toCreators: "Swap Fees To Creators",
  toHolderRewards: "Swap Fees To Coin Holder Rewards",
  toCoinBuybacks: "Swap Fees To Coin Buyback And Burn",
};

const lower = (a: string) => String(a).toLowerCase();
const abs = (v: bigint) => (v < 0n ? -v : v);
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

type BoxaHookConfig = {
  hook: string,
  poolManager: string,
  deployBlock: number,
  start: string,
  // the hook's per-launch event: bytes32 indexed poolId, address indexed token first
  poolRegisteredEvent: string,
  // event logging each pool's pair asset (bytes32 indexed poolId, address indexed quote); omitted when the hook only takes native HYPE
  poolQuoteEvent?: string,
  treasuryShare: string, // BOXA's share of each fee, for the methodology text
  doublecounted?: boolean,
};

export function boxaHookAdapter(config: BoxaHookConfig): SimpleAdapter {
  const hook = lower(config.hook);
  const { poolManager, deployBlock, start, poolRegisteredEvent, poolQuoteEvent, treasuryShare, doublecounted } = config;

  async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const addQuote = (balances: any, quote: string, amount: bigint, label?: string) =>
      quote === NATIVE ? balances.addGasToken(amount, label) : balances.add(quote, amount, label);

    // ---- every launch: pool -> coin and pair asset (full history, cached) ----
    const registered = await options.getLogs({ target: hook, eventAbi: poolRegisteredEvent, fromBlock: deployBlock, cacheInCloud: true });
    const quoteOf: Record<string, string> = {};
    if (poolQuoteEvent) {
      const quotes = await options.getLogs({ target: hook, eventAbi: poolQuoteEvent, fromBlock: deployBlock, cacheInCloud: true });
      for (const q of quotes) quoteOf[lower(q.poolId)] = lower(q.quote);
    }
    const info: Record<string, { quote: string, quoteIs0: boolean }> = {};
    for (const r of registered) {
      const poolId = lower(r.poolId), token = lower(r.token);
      const quote = poolQuoteEvent ? quoteOf[poolId] : NATIVE;
      if (!quote) throw new Error(`BOXA: pool ${poolId} has no pair asset logged on hook ${hook}`);
      info[poolId] = { quote, quoteIs0: quote < token }; // Uniswap v4 sorts currency0 < currency1 (native HYPE is address(0))
    }

    // ---- fees: every hook fee, split as logged ----
    const feeLogs = dedupeLogs(await options.getLogs({ target: hook, eventAbi: FEE_TAKEN, onlyArgs: false }));
    for (const log of feeLogs) {
      const poolId = lower(log.args.poolId);
      if (!info[poolId]) throw new Error(`BOXA: pool ${poolId} has no PoolRegistered log on hook ${hook}`);
      const { quote } = info[poolId];
      const { total, boxa, creator, holders, buyback } = log.args;
      if (BigInt(boxa) + BigInt(creator) + BigInt(holders) + BigInt(buyback) !== BigInt(total))
        throw new Error(`BOXA: FeeTaken parts do not sum to total in tx ${log.transactionHash}`);
      addQuote(dailyFees, quote, BigInt(total), LABEL.swapFees);
      addQuote(dailyRevenue, quote, BigInt(boxa), LABEL.toTreasury);
      addQuote(dailySupplySideRevenue, quote, BigInt(creator), LABEL.toCreators);
      addQuote(dailySupplySideRevenue, quote, BigInt(holders), LABEL.toHolderRewards);
      addQuote(dailySupplySideRevenue, quote, BigInt(buyback), LABEL.toCoinBuybacks);
    }

    // ---- volume: hook-pool swaps, in the pair asset, gross of the hook fee ----
    // Every launch charges at least 1% per side, so every swap logs a FeeTaken and the pools traded in the window are those
    // with one. Swaps sent by the hook itself are its buyback & burn of the coin (protocol action, not volume).
    const activePools = [...new Set(feeLogs.map((log: any) => lower(log.args.poolId)))];
    const swapLogs: any[] = [];
    for (let i = 0; i < activePools.length; i += 200) {
      const chunk = activePools.slice(i, i + 200);
      swapLogs.push(...await options.getLogs({ target: poolManager, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, chunk] as any, onlyArgs: false }));
    }
    const swaps = dedupeLogs(swapLogs).filter((s: any) => lower(s.args.sender) !== hook);

    // On a buy the Swap amount is net of the hook fee, so the fee of the matching FeeTaken (just before the Swap for exact input,
    // just after for exact output) is added back. On a sell the fee comes out of the pool's output, so the Swap is already gross.
    const byTxPool: Record<string, { poolId: string, swaps: any[], fees: any[] }> = {};
    const group = (tx: string, poolId: string) => (byTxPool[`${lower(tx)}-${poolId}`] ??= { poolId, swaps: [], fees: [] });
    for (const log of feeLogs) group(log.transactionHash, lower(log.args.poolId)).fees.push(log);
    for (const swap of swaps) group(swap.transactionHash, lower(swap.args.id)).swaps.push(swap);

    const byLogIndex = (a: any, b: any) => Number(a.logIndex) - Number(b.logIndex);
    for (const [key, { poolId, swaps: txSwaps, fees }] of Object.entries(byTxPool)) {
      if (!txSwaps.length) continue;
      const { quote, quoteIs0 } = info[poolId];
      txSwaps.sort(byLogIndex);
      fees.sort(byLogIndex);
      // A sell's fee is logged right after its Swap; claim those first so a following buy cannot take them.
      const used = new Set<any>();
      const between = (from: number, to: number) => fees.find((f) => !used.has(f) && Number(f.logIndex) > from && Number(f.logIndex) < to);
      const amounts = txSwaps.map((swap) => BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1));
      const bounds = txSwaps.map((swap, i) => ({
        at: Number(swap.logIndex),
        prev: i > 0 ? Number(txSwaps[i - 1].logIndex) : -1,
        next: i < txSwaps.length - 1 ? Number(txSwaps[i + 1].logIndex) : Infinity,
      }));
      txSwaps.forEach((_, i) => {
        if (amounts[i] < 0n) return;
        const fee = between(bounds[i].at, bounds[i].next);
        if (fee) used.add(fee);
      });
      txSwaps.forEach((_, i) => {
        addQuote(dailyVolume, quote, abs(amounts[i]));
        if (amounts[i] >= 0n) return; // sell: already gross
        const { at, prev, next } = bounds[i];
        const fee = between(prev, at) ?? between(at, next);
        if (!fee) return; // a dust buy whose fee rounds to 0
        used.add(fee);
        addQuote(dailyVolume, quote, BigInt(fee.args.total));
      });
      // every fee is paid on a swap: one left over means a swap log is missing
      if (used.size !== fees.length) throw new Error(`BOXA: FeeTaken without a matching Swap in ${key}`);
    }
    for (const [key, { swaps: txSwaps, fees }] of Object.entries(byTxPool))
      if (!txSwaps.length && fees.length) throw new Error(`BOXA: FeeTaken without a Swap in ${key}`);

    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees.clone(),
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue: dailyRevenue.clone(),
    };
  }

  const methodology = {
    Volume: "Value of all trades in BOXA launch pools, measured in the pool's pair asset (HYPE, or another asset BOXA allows) before the trading fee. BOXA's buyback-and-burn swaps are excluded.",
    Fees: "The 1% pool fee on every buy and sell plus any extra tax the creator set at launch, paid by traders in the pool's pair asset.",
    UserFees: "The pool fee and extra tax paid by traders on every BOXA launch-pool trade.",
    Revenue: `BOXA's share of trading fees: ${treasuryShare}.`,
    ProtocolRevenue: `BOXA's share of trading fees, paid to the BOXA treasury: ${treasuryShare}.`,
    SupplySideRevenue: "The rest of every trading fee, split as each coin's creator chose between the creator, rewards for the coin's holders and buyback & burn of the coin.",
  };

  const breakdownMethodology = {
    Fees: {
      [LABEL.swapFees]: "Hook fee charged in the pair asset on every launch-pool trade (1% pool fee plus any extra tax), from FeeTaken events.",
    },
    UserFees: {
      [LABEL.swapFees]: "Pool fee and extra tax paid by traders on every launch-pool trade.",
    },
    Revenue: {
      [LABEL.toTreasury]: `BOXA's share of every fee (${treasuryShare}), paid to the BOXA treasury.`,
    },
    ProtocolRevenue: {
      [LABEL.toTreasury]: `BOXA's share of every fee (${treasuryShare}), paid to the BOXA treasury.`,
    },
    SupplySideRevenue: {
      [LABEL.toCreators]: "Part of every fee paid to the coin's creator.",
      [LABEL.toHolderRewards]: "Part of every fee paid as rewards to the coin's holders, as set by the creator.",
      [LABEL.toCoinBuybacks]: "Part of every fee used to buy back and burn the coin, as set by the creator.",
    },
  };

  return {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ELYSIUM],
    start,
    methodology,
    breakdownMethodology,
    ...(doublecounted ? { doublecounted } : {}),
  };
}
