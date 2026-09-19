import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Minara (minara.fun) - USDC-native Uniswap v4 launchpad on Arc. A launch mints a token
// and opens a single-sided v4 pool bound to Minara's own fee hook, in one transaction.
// Contracts are Minara's own, published at api.minara.fun/minara-fun/contracts (the
// marketing docs at minara.fun/docs render client-side with no technical content), and
// cross-checked against real on-chain logs before being relied on here.
const STRATEGY = "0x4d3a3f4e1a918845c2038bc064c4d250822b203e"; // instantLaunchStrategyWithHook
const STRATEGY_DEPLOY_BLOCK = 21123525; // 2026-09-16
const HOOK = "0xb6a65950534f061618b4ae102fbcbb8541a8e0cc"; // minaraFeeHook
// A canonical Liquidity Launcher fork; whether this instance is Minara-exclusive or
// shared with other launchpads couldn't be established, so its launch-fee event is only
// counted when its transaction also carries a Minara TokenLaunched event (joined below).
const LIQUIDITY_LAUNCHER = "0xb6c6f77ee74af874a183bfd77dd0176d1ac91de6";

// Contracts are unverified, so events are matched by raw topic0 hash and decoded
// manually, not via eventAbi.
const TOKEN_LAUNCHED_TOPIC = "0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4";
const FEE_ACCRUED_TOPIC = "0x2cbc7a49494b955fc97f275d59dab3e8cb331287723f93b9505b81482cfd1b98";
const LAUNCH_FEE_TOPIC = "0x4cef2d27cdf43d743c3c66401182e93989938e77d1be10f3ab9e6afdf799f839";

const NATIVE = "0x0000000000000000000000000000000000000000";
const abiCoder = AbiCoder.defaultAbiCoder();

// data: [quoteCurrency, token, reserved, tickSpacing, hook]. Verified against a real
// launch tx: the decoded hook matched HOOK, tickSpacing matched the pool's own v4
// Initialize event, and quoteCurrency matched Initialize's currency0 - so the quote
// asset (native or ERC20) is read per-launch here, not assumed.
function decodeTokenLaunched(log: any) {
  const [quoteCurrency] = abiCoder.decode(["address", "address", "uint256", "int24", "address"], log.data);
  return { poolId: log.topics[1] as string, quoteCurrency: (quoteCurrency as string).toLowerCase() };
}

// Hook's per-swap fee-accrual event: data = [platformAmount, creatorAmount, flag].
// Verified against a real tx: the two amounts summed to exactly the native transfer
// into the hook in that tx, at a 3:1 ratio matching the pool's 75/25 platform/creator
// split. Reading amounts directly (not re-derived from a rate) captures the documented
// anti-snipe surcharge automatically, with no formula needed.
function decodeFeeAccrued(log: any) {
  const [platformAmount, creatorAmount] = abiCoder.decode(["uint256", "uint256", "uint256"], log.data);
  return { poolId: log.topics[1] as string, platformAmount: platformAmount as bigint, creatorAmount: creatorAmount as bigint };
}

const SWAP_FEES_TO_PROTOCOL = "Token Swap Fees to Protocol";
const SWAP_FEES_TO_CREATORS = "Token Swap Fees to Creators";
const LAUNCH_FEES = "Launch Fees";
const LAUNCH_FEES_TO_PROTOCOL = "Launch Fees to Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Full launch history (cached) resolves each pool's quote currency, since a pool
  // launched on an earlier day can still be trading - and collecting fees - today.
  // Today's launches are fetched separately (no fromBlock, i.e. this window only) to
  // scope the launch-fee join below to just this window's launches.
  const [allLaunches, todaysLaunches, feeAccruals, launchFees] = await Promise.all([
    options.getLogs({ target: STRATEGY, topic: TOKEN_LAUNCHED_TOPIC, fromBlock: STRATEGY_DEPLOY_BLOCK, entireLog: true, cacheInCloud: true }),
    options.getLogs({ target: STRATEGY, topic: TOKEN_LAUNCHED_TOPIC, entireLog: true }),
    options.getLogs({ target: HOOK, topic: FEE_ACCRUED_TOPIC, entireLog: true }),
    options.getLogs({ target: LIQUIDITY_LAUNCHER, topic: LAUNCH_FEE_TOPIC, entireLog: true }),
  ]);

  const poolQuote = new Map<string, string>();
  for (const log of allLaunches) {
    const { poolId, quoteCurrency } = decodeTokenLaunched(log);
    poolQuote.set(poolId, quoteCurrency);
  }

  for (const log of feeAccruals) {
    const { poolId, platformAmount, creatorAmount } = decodeFeeAccrued(log);
    const quote = poolQuote.get(poolId);
    // Unidentifiable pool (no matching TokenLaunched log) - skip rather than guess.
    if (!quote) continue;
    const total = platformAmount + creatorAmount;
    if (quote === NATIVE) {
      dailyFees.addGasToken(total, METRIC.SWAP_FEES);
      dailyRevenue.addGasToken(platformAmount, SWAP_FEES_TO_PROTOCOL);
      if (creatorAmount > 0n) dailySupplySideRevenue.addGasToken(creatorAmount, SWAP_FEES_TO_CREATORS);
    } else {
      dailyFees.add(quote, total, METRIC.SWAP_FEES);
      dailyRevenue.add(quote, platformAmount, SWAP_FEES_TO_PROTOCOL);
      if (creatorAmount > 0n) dailySupplySideRevenue.add(quote, creatorAmount, SWAP_FEES_TO_CREATORS);
    }
  }

  // Flat launch fee, always paid in native ARC/USDC regardless of the pool's own quote
  // asset. Verified on two independent real launches as exactly 1 native unit ($1); no
  // on-chain getter exists, so it's a constant here (matching fees/sashimi's approach).
  const minaraLaunchTxs = new Set(todaysLaunches.map((log: any) => log.transactionHash));
  for (const log of launchFees) {
    if (!minaraLaunchTxs.has(log.transactionHash)) continue;
    const amount = BigInt(log.data);
    dailyFees.addGasToken(amount, LAUNCH_FEES);
    dailyRevenue.addGasToken(amount, LAUNCH_FEES_TO_PROTOCOL);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The 1% (0.75% platform + 0.25% creator) fee Minara's hook charges on every swap, read from the hook's own fee event, plus the flat $1 launch fee. Includes any anti-snipe surcharge automatically, since the amount is read from the event, not computed from a rate.",
  UserFees: "Both fees are paid by users: the swap fee by traders, the launch fee by the creator.",
  Revenue: "The platform's share of each swap fee plus the flat launch fee in full.",
  ProtocolRevenue: "Same as Revenue. Minara has no token of its own, so none of this is distributed to holders.",
  SupplySideRevenue: "The token creator's share of each swap fee, zero on launches where the creator opted out.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Platform plus creator share of the swap fee Minara's hook charges in-pool, on the pool's own quote asset (native ARC/USDC or an allowed ERC20), read from the hook's fee-accrual event.",
    [LAUNCH_FEES]: "Flat 1 USDC-equivalent fee, paid in native ARC/USDC by the creator when a token is launched.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fee paid by the trader in the pool's own quote asset.",
    [LAUNCH_FEES]: "Flat launch fee paid by the creator.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The platform's share of each swap fee (0.75% by default).",
    [LAUNCH_FEES_TO_PROTOCOL]: "Flat launch fee, kept in full by the platform.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The platform's share of each swap fee (0.75% by default).",
    [LAUNCH_FEES_TO_PROTOCOL]: "Flat launch fee, kept in full by the platform.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_CREATORS]: "The token creator's share of each swap fee (0.25% by default, zero when the launch opted the creator fee out), claimed by the pool's creator role.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16", // instantLaunchStrategyWithHook and minaraFeeHook both deployed this day
  methodology,
  breakdownMethodology,
  // No dexs/minara: dexs/uniswap-v4.ts already tracks volume for every v4 pool on Arc,
  // Minara's included, so a second adapter would double count. Not a fees double-count
  // either: Minara's pools use the dynamic-fee flag and never set it, so that adapter's
  // own fee field reads 0 on every Minara swap (confirmed on-chain) - the real fee is
  // taken by the hook outside amount0/amount1, which is what FEE_ACCRUED_TOPIC reads.
};

export default adapter;
