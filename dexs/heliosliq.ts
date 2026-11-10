import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

// Helios (https://heliosliq.app, https://x.com/heliosliq): a liquidity platform on Elysium.
// Its DLMM (bin) and DAMM (full range) pools are Uniswap v4 pools carrying the Helios fee hook. Only
// launchers registered on the hook can initialize a pool with it, so every pool with one of these hooks
// is a Helios pool; no pool is hardcoded.
//
// A swap in a Helios pool pays two fees:
//  - the pool's LP fee, set per swap by the hook (a launch fee that steps down, a base fee that rises with
//    volatility, a tax on sandwich bots) and carried in the PoolManager's Swap event. It stays in the pool
//    for its liquidity providers.
//  - Helios' protocol fee, 0.1% of the swap's unspecified side (protocolFeeBps = 10 on both hooks since
//    they were deployed, capped at 1% by the contract). The hook logs each one as ProtocolFeeTaken and
//    holds it for the treasury (protocolFeeRecipient).
//
// The pools sit in the canonical Uniswap v4 PoolManager, so dexs/uniswap-v4 can count the same swaps:
// hence doublecounted.
//
// Token holders: Helios pays HYPE to $HELIOS stakers (HeliosStaking.RewardAdded) and buys $HELIOS back
// and burns it. Both are funded from the creator fee of the $HELIOS pool on Boxa (another protocol's
// pool), not from the fees above, so they are holders revenue only. A buyback is counted when it is
// made, as the native HYPE spent on it: the buyback wallet buys through KyberSwap's router, whose
// Swapped event carries the amount spent, so no $HELIOS price is needed. The $HELIOS bought is burned
// afterwards and is not counted a second time. That creator fee is a tax on trading the token in
// Boxa's pool, not a fee of a Helios pool, so it is left out of fees and revenue (Boxa's pool fees are
// Boxa's to report) and only what reaches $HELIOS holders is counted, under holders revenue, as the
// repository's guidelines ask for token taxes.
// Contracts: https://heliosliq.app/#contracts (explorer: https://elysium.kinetiq.xyz)

const POOL_MANAGER = "0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1"; // Uniswap v4 PoolManager on Elysium
const FEE_HOOKS = [
  "0xa129c69D439f30e6FfACC435a1627b7f4F9d30c4", // HeliosFeeHook, deployed 2026-11-04 03:56 UTC
  "0x885E170Ab95421C38175d6aD43017b54AD6E30c4", // HeliosFeeHook v2 (adds the sandwich tax)
].map((a) => a.toLowerCase());
const HOOK_FROM_BLOCK = 347956; // the first hook's deployment block: no Helios pool exists before it

// $HELIOS (relaunched 2026-11-09) and its staking contract, which pays stakers in native HYPE.
const HELIOS = "0x875e0130b52404c75f594ea8451597dd16c6b6e4";
const STAKING = "0x4f08ca6FEe7b5121Abaeb1006647F8df98cD7DBE";
// The wallet that buys $HELIOS back and burns it, and the router it buys through: KyberSwap's
// MetaAggregationRouterV2 (sample buyback: tx 0xe94b666a4a81d4c7759da3ae5302b55359d68b580f94b773e49b47fb17f7c83a).
const BUYBACK_WALLET = "0x8176632892683e306dbc25636985cac75540d374";
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const KYBER_NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; // how the router names the native token

// Priced majors on Elysium: a swap is valued on this leg, so a thin token can't set its value.
// Addresses as in the `elysium` entry of DefiLlama-Adapters' projects/helper/coreAssets.json
// (https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/helper/coreAssets.json).
const MAJORS = new Set(
  [
    ADDRESSES.null, // native HYPE
    "0xbA876237B0F021A6c6D852d6c26E107997cC5E81", // WHYPE
    "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65", // USDC
    "0x3BdE42a1dA8F1D95564f2c4a51a0cF73a725674C", // USDT0
  ].map((a) => a.toLowerCase()),
);

const INITIALIZE =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)";
const SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const PROTOCOL_FEE_TAKEN = "event ProtocolFeeTaken(bytes32 indexed id, address indexed currency, uint256 amount)";
const REWARD_ADDED = "event RewardAdded(address indexed from, uint256 amount, uint256 rewardRate, uint256 periodFinish)";
const KYBER_SWAPPED = "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"; // v4 Swap topic0
const POOLS_PER_CALL = 100;

const PROTOCOL_SWAP_FEE = "Protocol Swap Fees";
const SWAP_FEES_TO_LPS = "Swap Fees To LPs";
const PROTOCOL_SWAP_FEE_TO_TREASURY = "Protocol Swap Fees To Treasury";
const STAKING_DISTRIBUTIONS = "HYPE Paid To HELIOS Stakers";

const FEE_UNITS = 1_000_000n; // v4 fees are in hundredths of a bip
const abs = (v: bigint) => (v < 0n ? -v : v);

type Pool = { currency0: string; currency1: string; useToken0: boolean };
// One swap, valued in the pool's counted token: what the trader paid in (gross) and what came out (net of the LP fee).
type SwapValue = { logIndex: number; amount0: bigint; amount1: bigint; gross: bigint; net: bigint; token0In: boolean };

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // From the hook's first block, not the window: a pool launched earlier still trades today.
  const initialized = await options.getLogs({ target: POOL_MANAGER, eventAbi: INITIALIZE, fromBlock: HOOK_FROM_BLOCK, cacheInCloud: true });
  const pools = new Map<string, Pool>();
  for (const log of initialized) {
    if (!FEE_HOOKS.includes(String(log.hooks).toLowerCase())) continue;
    const currency0 = String(log.currency0).toLowerCase();
    const currency1 = String(log.currency1).toLowerCase();
    pools.set(String(log.id).toLowerCase(), { currency0, currency1, useToken0: MAJORS.has(currency0) || !MAJORS.has(currency1) });
  }

  if (pools.size) {
    // PoolManager swaps of the Helios pool ids only (topic1), a batch of ids per call: the chain's public
    // RPC refuses a getLogs answer of more than 10,000 logs, which every v4 swap on the chain can exceed.
    const ids = [...pools.keys()];
    const swapLogs: any[] = [];
    for (let i = 0; i < ids.length; i += POOLS_PER_CALL)
      swapLogs.push(...(await options.getLogs({ target: POOL_MANAGER, eventAbi: SWAP, topics: [SWAP_TOPIC, ids.slice(i, i + POOLS_PER_CALL)] as any, onlyArgs: false })));
    const swapsByTxPool = new Map<string, SwapValue[]>();
    for (const log of swapLogs) {
      const id = String(log.args.id).toLowerCase();
      const pool = pools.get(id);
      if (!pool) continue;
      // Amounts are the swapper's balance changes: negative is paid in, positive is received.
      const amount0 = BigInt(log.args.amount0);
      const amount1 = BigInt(log.args.amount1);
      const lpFee = BigInt(log.args.fee);
      const counted = pool.useToken0 ? amount0 : amount1;
      const countedIn = counted < 0n;
      // The LP fee is taken from the input. An input amount includes it; an output amount is what is left
      // after it, so the fee is added back to get what the trader put in.
      const gross = countedIn || lpFee >= FEE_UNITS ? abs(counted) : (abs(counted) * FEE_UNITS) / (FEE_UNITS - lpFee);
      const fee = countedIn ? (gross * lpFee) / FEE_UNITS : gross - abs(counted);
      const token = pool.useToken0 ? pool.currency0 : pool.currency1;
      dailyVolume.add(token, gross);
      dailyFees.add(token, fee, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(token, fee, SWAP_FEES_TO_LPS);

      const key = `${log.transactionHash}:${id}`;
      if (!swapsByTxPool.has(key)) swapsByTxPool.set(key, []);
      swapsByTxPool.get(key)!.push({ logIndex: Number(log.logIndex ?? log.index), amount0, amount1, gross, net: gross - fee, token0In: pool.useToken0 === countedIn });
    }

    const feeLogs = await options.getLogs({ targets: FEE_HOOKS, eventAbi: PROTOCOL_FEE_TAKEN, onlyArgs: false });
    for (const log of feeLogs) {
      const id = String(log.args.id).toLowerCase();
      const pool = pools.get(id);
      if (!pool) throw new Error(`ProtocolFeeTaken for unknown pool ${id}`);
      const token = pool.useToken0 ? pool.currency0 : pool.currency1;
      let amount = BigInt(log.args.amount);
      if (String(log.args.currency).toLowerCase() !== token) {
        // Taken in the pool's other currency: value it in the counted token at the rate of its own swap
        // (the hook emits ProtocolFeeTaken right after the swap, in the same transaction).
        const index = Number(log.logIndex ?? log.index);
        const swap = (swapsByTxPool.get(`${log.transactionHash}:${id}`) ?? []).filter((s) => s.logIndex < index).sort((a, b) => b.logIndex - a.logIndex)[0];
        if (!swap) throw new Error(`no swap found for ProtocolFeeTaken in ${log.transactionHash}`);
        const feeIsToken0 = String(log.args.currency).toLowerCase() === pool.currency0;
        const otherLeg = abs(feeIsToken0 ? swap.amount0 : swap.amount1);
        // an input leg is worth what the trader paid in, an output leg what was left after the LP fee
        const otherIsInput = feeIsToken0 === swap.token0In;
        amount = otherLeg === 0n ? 0n : (amount * (otherIsInput ? swap.gross : swap.net)) / otherLeg;
      }
      dailyFees.add(token, amount, PROTOCOL_SWAP_FEE);
      dailyRevenue.add(token, amount, PROTOCOL_SWAP_FEE_TO_TREASURY);
    }
  }

  // HYPE paid to $HELIOS stakers.
  const rewards = await options.getLogs({ target: STAKING, eventAbi: REWARD_ADDED });
  for (const log of rewards) dailyHoldersRevenue.addGasToken(log.amount, STAKING_DISTRIBUTIONS);

  // $HELIOS buybacks: the native HYPE the buyback wallet spent buying $HELIOS through KyberSwap's router.
  const routerSwaps = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_SWAPPED });
  for (const log of routerSwaps) {
    if (String(log.sender).toLowerCase() !== BUYBACK_WALLET) continue;
    if (String(log.srcToken).toLowerCase() !== KYBER_NATIVE || String(log.dstToken).toLowerCase() !== HELIOS) continue;
    dailyHoldersRevenue.addGasToken(log.spentAmount, METRIC.TOKEN_BUY_BACK);
  }

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailyHoldersRevenue,
  };
};

const methodology = {
  Volume: "Swap volume in Helios DLMM and DAMM pools (the Uniswap v4 pools that carry the Helios fee hook), counted once per trade as what the trader paid in, on the HYPE or stablecoin side of the pool.",
  Fees: "Fees paid by traders on swaps in Helios DLMM and DAMM pools: each pool's LP fee, which the Helios hook sets per swap, plus Helios' 0.1% protocol fee.",
  SupplySideRevenue: "The LP fee of every swap in Helios DLMM and DAMM pools, which stays in the pool for its liquidity providers.",
  Revenue: "Helios' 0.1% protocol fee on every swap in its DLMM and DAMM pools, taken by the fee hook.",
  ProtocolRevenue: "Helios' 0.1% protocol fee on every swap in its DLMM and DAMM pools, taken by the fee hook for the Helios treasury.",
  HoldersRevenue: "HYPE that Helios pays to $HELIOS stakers and HYPE that Helios spends buying $HELIOS back from the market to burn it, since the token's relaunch on 2026-11-09. Both are funded from the creator fee of the $HELIOS pool on Boxa, not from Helios pool fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "The LP fee of each swap in a Helios DLMM or DAMM pool, at the rate the hook set for that swap (carried in the Uniswap v4 Swap event).",
    [PROTOCOL_SWAP_FEE]: "Helios' 0.1% protocol fee on each swap in a Helios DLMM or DAMM pool, from the hook's ProtocolFeeTaken events.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_LPS]: "All LP fees, which stay in the pools for their liquidity providers.",
  },
  Revenue: {
    [PROTOCOL_SWAP_FEE_TO_TREASURY]: "All of Helios' 0.1% protocol fee, held by the hook for the Helios treasury.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SWAP_FEE_TO_TREASURY]: "All of Helios' 0.1% protocol fee, held by the hook for the Helios treasury.",
  },
  HoldersRevenue: {
    [STAKING_DISTRIBUTIONS]: "Native HYPE sent to the HeliosStaking contract for $HELIOS stakers, counted when it is added (RewardAdded).",
    [METRIC.TOKEN_BUY_BACK]: "Native HYPE the Helios buyback wallet spent buying $HELIOS through KyberSwap's router, counted when each purchase is made. The $HELIOS bought is burned afterwards.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // the pools sit in the Uniswap v4 PoolManager, which dexs/uniswap-v4 also tracks
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-04", // HeliosFeeHook was deployed on 2026-11-04 03:56 UTC
  methodology,
  breakdownMethodology,
};

export default adapter;
