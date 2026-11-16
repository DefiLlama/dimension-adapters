import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";
import { eventTopic, kalosReferralExclusion } from "../../helpers/kalos";

// Kalos V4 (https://www.kalos.fun): Kalos's Uniswap v4 pools on Kinetiq Elysium, the pools that carry Kalos's own fee
// hook (KalosDynamic). They sit in the shared Uniswap v4 PoolManager, which dexs/uniswap-v4 also tracks: hence
// doublecounted. Only addresses the hook allows can create a pool with it, and the hook registers every pool it is
// initialized with (PoolRegistered, emitted in afterInitialize; a pool it refuses is never created), so every pool it
// registered is a Kalos pool; no pool is hardcoded. Contracts: https://www.kalos.fun/learn/contracts
//
// A swap in a Kalos pool pays one fee, set per swap by the hook (a directional dynamic fee between a minimum and a
// maximum per side, at most 5%), all of it in the pool's fee asset: USDC on HYPE/USDC, native HYPE on HYPE/KNTQ (the
// pair's best ranked currency, the hook's feeAssetRank). Kalos takes 15% of it, the pool's liquidity providers 85%:
//  - fee asset in (e.g. a buy of HYPE with USDC): the LPs' part is the pool's own v4 LP fee, which the hook sets per swap
//    and the PoolManager's Swap event carries; Kalos's part is charged by the hook.
//  - fee asset out (e.g. a sale of HYPE for USDC): the v4 LP fee is 0 and the hook takes the whole fee off the output;
//    the LPs' part is booked per range in the hook's fee book (hook.book(), LpFeeBooked) and paid to LPs with their
//    positions, the same way v4 pays its own LP fee.
// The hook logs Kalos's part of every charged swap as FeeCharged (kalosAmount) and holds it until a keeper collects it
// to the Kalos revenue splitter 0xcA105395094Ceb27e6AfdA492c6379cBF468CDb8. Creator pools (a launchpad token that names
// its creator, paired with any token) pay a fixed 1% in the paired token, 60% to the token's creator (creatorAmount)
// and 40% to Kalos, nothing to LPs. A pool with no fee asset is a plain v4 pool: the whole fee is its LP fee.
// Hook v1 (2026-11-14 to 2026-11-16, replaced by v2) took Kalos's part the same way and left the LPs' part to v4's own LP
// fee on every swap; it has no fee book.
const POOL_MANAGER = "0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1"; // Uniswap v4 PoolManager on Elysium
const KALOS_HOOKS = [
  { hook: "0x0885b1C4aCDF4613C51F602B21D2bBd0876410CC", fromBlock: 6605271 }, // Kalos V4 fee hook v1, deployed 2026-11-14 23:44 UTC
  { hook: "0x0559EF6bC07974bfaB2149d7fbC0E898914115CF", fromBlock: 6897730 }, // KalosDynamic (hook v2), deployed 2026-11-16 00:15 UTC
];
// hook v2's fee book (hook.book(): deployed by the hook's constructor, written only by the hook)
const FEE_BOOK = "0xA6021410c5536F793E7D99b88636194f25A3f659";
const START = "2026-11-15"; // hook v1's first pools were created on 2026-11-15 at 00:03 UTC

// PoolRegistered.feeSide
const FEE_CURRENCY0 = 1;
const FEE_CURRENCY1 = 2;
// Priced majors on Elysium: a pool without a fee asset is valued on this leg, so a thin token can't set its value.
const MAJORS = new Set(
  [ADDRESSES.null, ADDRESSES.elysium.WHYPE, ADDRESSES.elysium.USDC, ADDRESSES.elysium.USDT0].map((a) => a.toLowerCase()),
);

const POOL_REGISTERED = "event PoolRegistered(bytes32 indexed id, address indexed currency0, address indexed currency1, uint8 kind, uint8 feeSide, uint8 preset, uint16 kalosShareBps, address sender)";
const SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const FEE_CHARGED = "event FeeCharged(bytes32 indexed id, address indexed currency, uint256 kalosAmount, uint256 creatorAmount)";
const LP_FEE_BOOKED = "event LpFeeBooked(bytes32 indexed id, address indexed currency, uint256 amount, uint256 booked)";
const SWAP_TOPIC = eventTopic(SWAP);
const POOLS_PER_CALL = 100;

const LABELS = {
  KALOS_FEES: "Kalos Hook Fees",
  KALOS_FEES_TO_PROTOCOL: "Kalos Hook Fees To Protocol",
  LP_FEES_TO_LPS: "Swap Fees To LPs",
  CREATOR_FEES_TO_CREATORS: "Creator Fees To Creators",
};

const FEE_UNITS = 1_000_000n; // v4 fees are in hundredths of a bip
const abs = (v: bigint) => (v < 0n ? -v : v);

type Pool = { currency0: string; currency1: string; countToken0: boolean };

/** Every pool a Kalos hook registered up to the window's end (lowercase ids), from each hook's own PoolRegistered logs */
async function getKalosPools(options: FetchOptions): Promise<Map<string, Pool>> {
  const toBlock = await options.getToBlock();
  const pools = new Map<string, Pool>();
  for (const { hook, fromBlock } of KALOS_HOOKS) {
    if (toBlock < fromBlock) continue;
    const logs = await options.getLogs({ target: hook, eventAbi: POOL_REGISTERED, fromBlock, toBlock, cacheInCloud: true });
    for (const log of logs) {
      const currency0 = String(log.currency0).toLowerCase();
      const currency1 = String(log.currency1).toLowerCase();
      const feeSide = Number(log.feeSide);
      // count each swap in the pool's fee asset (a creator pool's: the token paired with the launchpad token)
      const countToken0 = feeSide === FEE_CURRENCY0 || (feeSide !== FEE_CURRENCY1 && (MAJORS.has(currency0) || !MAJORS.has(currency1)));
      pools.set(String(log.id).toLowerCase(), { currency0, currency1, countToken0 });
    }
  }
  return pools;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const pools = await getKalosPools(options);
  if (pools.size) {
    // PoolManager swaps of the Kalos pool ids only (topic1), a batch of ids per call
    const ids = [...pools.keys()];
    const swapLogs: any[] = [];
    for (let i = 0; i < ids.length; i += POOLS_PER_CALL)
      swapLogs.push(...(await options.getLogs({ target: POOL_MANAGER, eventAbi: SWAP, topics: [SWAP_TOPIC, ids.slice(i, i + POOLS_PER_CALL)] as any })));
    for (const swap of swapLogs) {
      const pool = pools.get(String(swap.id).toLowerCase());
      if (!pool) continue;
      // Amounts are the swapper's balance changes: negative is paid in, positive is received. They are the pool's own
      // amounts, before the hook's fee.
      const counted = BigInt(pool.countToken0 ? swap.amount0 : swap.amount1);
      if (counted === 0n) continue;
      const lpFee = BigInt(swap.fee);
      const token = pool.countToken0 ? pool.currency0 : pool.currency1;
      // v4's LP fee is taken from the input: an input amount includes it, an output amount is what is left after it,
      // so the fee is added back to get the swap's gross amount on the counted side.
      const countedIn = counted < 0n;
      const gross = countedIn || lpFee >= FEE_UNITS ? abs(counted) : (abs(counted) * FEE_UNITS) / (FEE_UNITS - lpFee);
      dailyVolume.add(token, gross);
      // the v4 LP fee itself is in the swap's input currency (the leg paid in): input × fee
      const amount0 = BigInt(swap.amount0);
      const amount1 = BigInt(swap.amount1);
      const input = amount0 < 0n ? -amount0 : amount1 < 0n ? -amount1 : 0n;
      const inputToken = amount0 < 0n ? pool.currency0 : pool.currency1;
      const fee = (input * lpFee) / FEE_UNITS;
      if (fee > 0n) {
        dailyFees.add(inputToken, fee, METRIC.LP_FEES);
        dailySupplySideRevenue.add(inputToken, fee, LABELS.LP_FEES_TO_LPS);
      }
    }

    // Kalos's part (and on creator pools the creator's) of every charged swap, in the pool's fee asset
    const charged = await options.getLogs({ targets: KALOS_HOOKS.map(({ hook }) => hook), eventAbi: FEE_CHARGED });
    for (const log of charged) {
      if (!pools.has(String(log.id).toLowerCase())) throw new Error(`kalos-v4: FeeCharged for unknown pool ${log.id}`);
      const currency = String(log.currency).toLowerCase();
      const kalosAmount = BigInt(log.kalosAmount);
      const creatorAmount = BigInt(log.creatorAmount);
      if (kalosAmount > 0n) {
        dailyFees.add(currency, kalosAmount, LABELS.KALOS_FEES);
        dailyRevenue.add(currency, kalosAmount, LABELS.KALOS_FEES_TO_PROTOCOL);
      }
      if (creatorAmount > 0n) {
        dailyFees.add(currency, creatorAmount, METRIC.CREATOR_FEES);
        dailySupplySideRevenue.add(currency, creatorAmount, LABELS.CREATOR_FEES_TO_CREATORS);
      }
    }

    // hook v2: the LPs' part of every sale of the fee asset, booked in the fee book (the v4 LP fee was 0 on that swap)
    const booked = await options.getLogs({ target: FEE_BOOK, eventAbi: LP_FEE_BOOKED });
    for (const log of booked) {
      if (!pools.has(String(log.id).toLowerCase())) throw new Error(`kalos-v4: LpFeeBooked for unknown pool ${log.id}`);
      const currency = String(log.currency).toLowerCase();
      const amount = BigInt(log.amount);
      if (amount === 0n) continue;
      dailyFees.add(currency, amount, METRIC.LP_FEES);
      dailySupplySideRevenue.add(currency, amount, LABELS.LP_FEES_TO_LPS);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const REFERRAL_EXCLUSION = kalosReferralExclusion("Kalos V4");

const methodology = {
  Volume: "Swap volume in Kalos V4 pools (the Uniswap v4 pools on Elysium that carry the Kalos fee hook), from the PoolManager's Swap events, counted once per swap in the pool's fee asset (USDC on HYPE/USDC, HYPE on HYPE/KNTQ).",
  Fees: "Swap fees paid by traders in Kalos V4 pools: the dynamic fee the Kalos hook sets per swap, all of it in the pool's fee asset. The liquidity providers' 85% (the pool's v4 LP fee on swaps paid in the fee asset, the hook's fee book on sales of it) plus Kalos's 15% (the hook's FeeCharged events). On creator pools, a 1% fee split between the token's creator and Kalos.",
  UserFees: "Swap fees paid by traders in Kalos V4 pools: the dynamic fee the Kalos hook sets per swap, all of it in the pool's fee asset.",
  Revenue: `Kalos's 15% of every swap fee (40% on creator pools), taken by the hook and collected to the Kalos revenue splitter. ${REFERRAL_EXCLUSION}`,
  ProtocolRevenue: `Kalos's 15% of every swap fee (40% on creator pools), taken by the hook and collected to the Kalos revenue splitter, which pays Kalos's own vaults and referral pool. ${REFERRAL_EXCLUSION}`,
  SupplySideRevenue: "The liquidity providers' 85% of every swap fee, paid to them with their positions in the pool's fee asset, and on creator pools the token creator's 60%.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "The liquidity providers' part of each swap fee: the pool's v4 LP fee, which the hook sets per swap and the PoolManager's Swap event carries, counted in the swap's input currency where v4 takes it, and on a sale of the fee asset (v4 LP fee 0) the part booked in the hook's fee book (LpFeeBooked).",
    [LABELS.KALOS_FEES]: "Kalos's part of each swap fee (15%; 40% on creator pools), from the hook's FeeCharged events.",
    [METRIC.CREATOR_FEES]: "On creator pools, the token creator's 60% of the 1% fee, from the hook's FeeCharged events.",
  },
  UserFees: {
    [METRIC.LP_FEES]: "The liquidity providers' part of each swap fee, paid by the trader in the pool's fee asset.",
    [LABELS.KALOS_FEES]: "Kalos's part of each swap fee, paid by the trader in the pool's fee asset.",
    [METRIC.CREATOR_FEES]: "On creator pools, the token creator's part of the 1% fee, paid by the trader.",
  },
  Revenue: {
    [LABELS.KALOS_FEES_TO_PROTOCOL]: "Kalos's part of every swap fee, held by the hook until it is collected to the Kalos revenue splitter.",
  },
  ProtocolRevenue: {
    [LABELS.KALOS_FEES_TO_PROTOCOL]: "Kalos's part of every swap fee, collected to the Kalos revenue splitter, which pays Kalos's own vaults and referral pool.",
  },
  SupplySideRevenue: {
    [LABELS.LP_FEES_TO_LPS]: "The liquidity providers' 85% of every swap fee, in the pool's fee asset.",
    [LABELS.CREATOR_FEES_TO_CREATORS]: "On creator pools, the token creator's 60% of the 1% fee, which the creator claims from the hook.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // the pools sit in the Uniswap v4 PoolManager, which dexs/uniswap-v4 also tracks
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
