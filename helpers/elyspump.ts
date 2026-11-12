import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

// ElysPump (https://elysp.com) Launchpad v2 and v3 are the same Uniswap v4 hook bytecode, deployed on two PoolManagers
// (docs: https://docs.elysp.com/, "Deployed contracts" and "Interfaces"). The hook creates every coin with a one-sided pool vs
// the pair asset (native HYPE, or another allowed quote such as KNTQ), owns all of its liquidity forever, and charges a buy /
// sell fee fixed at launch (0-10%, plus an optional anti-snipe buy fee decaying over up to 15 minutes) in the pair asset.
// Every fee: 30% platform (PLATFORM_SHARE_BPS), 70% split as the creator chose between their fee receiver, HYPE holder rewards
// and buyback & burn of the coin. The hook source is not published, so event signatures were matched against on-chain topic0.

// The docs name it Launch; the deployed topic0 (0xd99cc6fb) is Launched with these types.
const LAUNCHED = "event Launched(address indexed token, address indexed creator, bytes32 indexed poolId, address quote, int24 tick, uint16 buyFeeBps, uint16 sellFeeBps, address feeReceiver, uint16 receiverShareBps, uint16 holdersShareBps, uint16 buybackShareBps, string name, string symbol, string metadata)";
// One per swap that pays a hook fee (none when the fee is 0); fee = platform + receiver + holders + buyback, in the pair asset.
const FEE_TAKEN = "event FeeTaken(address indexed token, bool isBuy, uint256 fee, uint256 platform, uint256 receiver, uint256 holders, uint256 buyback)";
// Pays out pending holder rewards and runs the coin's buyback & burn: the hook swaps `buyback` of the pair asset for the coin.
const FLUSHED = "event Flushed(address indexed token, uint256 holders, uint256 buyback, uint256 burned)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const NATIVE = "0x0000000000000000000000000000000000000000";

export const ELYSPUMP_LABEL = {
  swapFees: "Swap Fees",
  toPlatform: "Swap Fees To Platform",
  toCreators: "Swap Fees To Creators",
  toHolderRewards: "Swap Fees To Coin Holder Rewards",
  toCoinBuybacks: "Swap Fees To Coin Buyback And Burn",
};
const LABEL = ELYSPUMP_LABEL;

const lower = (a: string) => String(a).toLowerCase();
const abs = (v: bigint) => (v < 0n ? -v : v);
// getLogs can return the same log twice when it splits a busy block range on Elysium (see dexs/montra).
export const dedupeLogs = (logs: any[]) => {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${lower(log.transactionHash)}-${Number(log.logIndex)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

type HookConfig = { hook: string, poolManager: string, deployBlock: number, start: string, doublecounted?: boolean };

export function elyspumpHookAdapter({ hook, poolManager, deployBlock, start, doublecounted }: HookConfig): SimpleAdapter {
  hook = lower(hook);

  async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const addQuote = (balances: any, quote: string, amount: bigint, label?: string) =>
      quote === NATIVE ? balances.addGasToken(amount, label) : balances.add(quote, amount, label);

    // ---- every launch: coin -> pool and pair asset (full history, cached) ----
    const launches = await options.getLogs({ target: hook, eventAbi: LAUNCHED, fromBlock: deployBlock, cacheInCloud: true });
    const info: Record<string, { poolId: string, quote: string, quoteIs0: boolean, hasZeroFee: boolean }> = {};
    const tokenOfPool: Record<string, string> = {};
    for (const l of launches) {
      const token = lower(l.token), quote = lower(l.quote), poolId = lower(l.poolId);
      // Uniswap v4 sorts currency0 < currency1 (native HYPE is address(0), so always currency0)
      info[token] = { poolId, quote, quoteIs0: quote < token, hasZeroFee: Number(l.buyFeeBps) === 0 || Number(l.sellFeeBps) === 0 };
      tokenOfPool[poolId] = token;
    }

    const feeLogs = dedupeLogs(await options.getLogs({ target: hook, eventAbi: FEE_TAKEN, onlyArgs: false }));
    const flushes = dedupeLogs(await options.getLogs({ target: hook, eventAbi: FLUSHED, onlyArgs: false }));

    // ---- fees: every hook fee, split as logged ----
    for (const log of feeLogs) {
      const token = lower(log.args.token);
      if (!info[token]) throw new Error(`ElysPump: token ${token} has no Launched log on hook ${hook}`);
      const { quote } = info[token];
      const { fee, platform, receiver, holders, buyback } = log.args;
      if (BigInt(platform) + BigInt(receiver) + BigInt(holders) + BigInt(buyback) !== BigInt(fee))
        throw new Error(`ElysPump: FeeTaken parts do not sum to fee in tx ${log.transactionHash}`);
      addQuote(dailyFees, quote, BigInt(fee), LABEL.swapFees);
      addQuote(dailyRevenue, quote, BigInt(platform), LABEL.toPlatform);
      addQuote(dailySupplySideRevenue, quote, BigInt(receiver), LABEL.toCreators);
      addQuote(dailySupplySideRevenue, quote, BigInt(holders), LABEL.toHolderRewards);
      addQuote(dailySupplySideRevenue, quote, BigInt(buyback), LABEL.toCoinBuybacks);
    }

    // ---- volume: hook-pool swaps, in the pair asset, gross of the hook fee ----
    // A swap that pays a fee always logs FeeTaken, so the pools traded in the window are those with a FeeTaken plus the few
    // launched with a 0% buy or sell fee (their swaps can log none). Filtering the PoolManager by every launched poolId instead
    // would cost one getLogs per 200 launches per hour on a rate-limited RPC.
    const activePools = [...new Set([
      ...feeLogs.map((log: any) => info[lower(log.args.token)].poolId),
      ...Object.values(info).filter((i) => i.hasZeroFee).map((i) => i.poolId),
    ])];
    const swapLogs: any[] = [];
    for (let i = 0; i < activePools.length; i += 200) {
      const chunk = activePools.slice(i, i + 200);
      swapLogs.push(...await options.getLogs({ target: poolManager, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, chunk] as any, onlyArgs: false }));
    }
    const swaps = dedupeLogs(swapLogs);

    // The coin's buyback & burn is a swap sent by the hook in the tx that logs Flushed for that coin: protocol action, not volume.
    // The creator's dev buy is also sent by the hook, but inside the launch tx (no Flushed), and is a real buy.
    const flushTxs = new Set(flushes.map((f: any) => `${lower(f.transactionHash)}-${lower(f.args.token)}`));

    // On a buy the Swap amount is net of the hook fee, so the fee is added back: exact-input buys log their FeeTaken just before
    // the Swap (fee taken from the input), exact-output buys just after it (fee charged on top, e.g.
    // 0xf218e11f9843f1d99625f35841527bbfdeba4001adca4b3fd4ddaebc3b7e408d). On a sell the fee comes out of the pool's output,
    // so the Swap amount is already gross.
    const byTxToken: Record<string, { token: string, swaps: any[], buyFees: any[] }> = {};
    const group = (tx: string, token: string) => (byTxToken[`${lower(tx)}-${token}`] ??= { token, swaps: [], buyFees: [] });
    for (const log of feeLogs) if (log.args.isBuy) group(log.transactionHash, lower(log.args.token)).buyFees.push(log);
    for (const swap of swaps) {
      const token = tokenOfPool[lower(swap.args.id)];
      if (lower(swap.args.sender) === hook && flushTxs.has(`${lower(swap.transactionHash)}-${token}`)) continue;
      group(swap.transactionHash, token).swaps.push(swap);
    }

    const byLogIndex = (a: any, b: any) => Number(a.logIndex) - Number(b.logIndex);
    for (const [key, { token, swaps: txSwaps, buyFees }] of Object.entries(byTxToken)) {
      const { quote, quoteIs0 } = info[token];
      txSwaps.sort(byLogIndex);
      buyFees.sort(byLogIndex);
      const used = new Set<any>();
      const between = (from: number, to: number) => buyFees.find((f) => !used.has(f) && Number(f.logIndex) > from && Number(f.logIndex) < to);
      txSwaps.forEach((swap, i) => {
        const amount = BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1);
        addQuote(dailyVolume, quote, abs(amount));
        if (amount >= 0n) return; // sell: already gross
        const at = Number(swap.logIndex);
        const prev = i > 0 ? Number(txSwaps[i - 1].logIndex) : -1;
        const next = i < txSwaps.length - 1 ? Number(txSwaps[i + 1].logIndex) : Infinity;
        const fee = between(prev, at) ?? between(at, next);
        if (fee) { used.add(fee); addQuote(dailyVolume, quote, BigInt(fee.args.fee)); }
      });
      if (used.size !== buyFees.length) throw new Error(`ElysPump: unmatched buy FeeTaken in ${key}`);
    }

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
    Volume: "Value of all trades in the launchpad's pools, measured in the pool's pair asset (HYPE or KNTQ) before the trading fee. The launchpad's own buyback-and-burn swaps are excluded.",
    Fees: "Buy and sell fees set by each coin's creator at launch (0-10%, plus any anti-snipe premium right after launch), paid by traders in the pair asset on every trade.",
    UserFees: "Buy and sell fees paid by traders on every launch-pool trade.",
    Revenue: "The platform's 30% of every trading fee.",
    ProtocolRevenue: "The platform's 30% of every trading fee, sent to the ElysPump platform fee address.",
    SupplySideRevenue: "The other 70% of every trading fee, split as each coin's creator chose between their fee receiver, HYPE rewards for the coin's holders and buyback & burn of the coin.",
  };

  const breakdownMethodology = {
    Fees: {
      [LABEL.swapFees]: "Hook buy/sell fee charged in the pair asset on every launch-pool trade, anti-snipe premium included, from FeeTaken events.",
    },
    UserFees: {
      [LABEL.swapFees]: "Hook buy/sell fee paid by traders on every launch-pool trade.",
    },
    Revenue: {
      [LABEL.toPlatform]: "30% of every hook fee, to the platform.",
    },
    ProtocolRevenue: {
      [LABEL.toPlatform]: "30% of every hook fee, paid to the ElysPump platform fee address.",
    },
    SupplySideRevenue: {
      [LABEL.toCreators]: "Part of the hook fee sent to the launch's fee receiver, as set by the creator.",
      [LABEL.toHolderRewards]: "Part of the hook fee paid as HYPE rewards to the coin's holders, as set by the creator.",
      [LABEL.toCoinBuybacks]: "Part of the hook fee used by the hook to buy back and burn the coin, as set by the creator.",
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
