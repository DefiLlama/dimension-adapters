import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// Coinbarrel (https://coinbarrel.com) — token launchpad on Robinhood Chain (4663).
//
// Every launch is a Uniswap V4 pool carrying the Coinbarrel hook. The hook takes
// a fee on the quote leg of every swap and splits it, per launch policy, into a
// flat platform fee (Coinbarrel treasury) and the creator-configured fee, which
// goes 100% to the launched token's side: creator revenue, holder rewards,
// reinvestment into the pool, or burn. Nothing of the creator fee reaches
// Coinbarrel.
//
// Fees are read from the events the contracts emit, never from rate x volume:
//
//   Hook        QuoteFeeAccrued     per-swap fee split in the pool's quote asset;
//                                   treasuryFee is Coinbarrel's platform fee
//   Vault       FeesCollected       Uniswap LP fees swept from the locked launch
//                                   position, split project / treasury (WETH)
//   Launcher    UnifiedV5TokenLaunched  one fixed 0.0005 ETH service fee per
//                                   launch, paid straight to the treasury with
//                                   no event of its own, so it is counted as
//                                   launches x the on-chain constant
//   Legacy (Jul 13-27 2026, before Hook V5; most of the all-time volume):
//     Simple launches   Uniswap V3 pools (1% tier) enumerated from the Simple
//                       launcher's TokenLaunched; fee = 1% of the WETH paid
//                       into the pool on each WETH-input swap (V3 charges the
//                       fee in the input token; the token-side fee on sells is
//                       not priced), split 70% creator / 30% treasury as the
//                       FeeLocker does when it collects
//     Advanced hook V3  EffectiveSwapV3 on the hook, ETH-side fee per swap
//     Advanced hook V1/V2  no per-swap event; PoolManager Swap for the pools
//                       the hooks registered x their registered buy/sell pips
//     Legacy Advanced pools keep the proportional model: 30% platform / 70%
//     project.
//
// Revenue is the platform fee that ends up in the treasury (0x2FE3...fDF),
// counted when it accrues on the swap. The fee router pays it out to the
// treasury in batches every few days (QuotePaid with recipient == treasury),
// so counting at payout would show zero on most days and a spike on sweep
// days; the accrued figure is the same ETH on the day it was earned. Swap
// volume is deliberately not reported: dexs/uniswap-v4.ts already counts the
// Robinhood PoolManager and it would double at the chain aggregate.
//
// Addresses: https://coinbarrel.com/integrations/robinhood/deployments.json

const HOOK_V5 = "0xf667C59Cd75Ab1d7943fC8284EDAb51F3A76bfFF";
const LAUNCHER_V5 = "0x4234e536aa5da8BE18D41ef6f86533430E264E70";
const FEE_ROUTER_V5 = "0xFFf9bBF167221380e964eF4cd7636Ed8cCB10562";
const POSITION_VAULT = "0x685C85DF6836Df5713EFe89Ab1348183651cE9e1";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951"; // Uniswap V4 PoolManager
const LAUNCHER_SIMPLE = "0x985dfae571a0c5c90ac997f08687056d2ce1e46f"; // legacy Simple launcher (Uniswap V3)
const HOOKS_LEGACY_V1_V2 = [
  "0x231b193a02a5806fe55f17ea304746565c18a080", // Advanced hook V1
  "0x5120c34fd487fb62a893a4b3d2aedffdf565e080", // Advanced hook V2
];
const HOOKS_LEGACY_V3 = [
  "0x6430bE69c0Ad1b2466FB105e8a208F2ab45d68cc", // Advanced hook V3
  "0xaac62e14dd54cef278f8cde0dbd2f036243b28cc", // Advanced hook V3, previous deployment
];
const WETH = ADDRESSES.robinhood.WETH;
const NATIVE = ADDRESSES.null;

const LAUNCHER_V5_FROM_BLOCK = 21306158; // launcher proxy deployment (2026-07-28)
const LAUNCHER_SIMPLE_FROM_BLOCK = 8955028; // Simple launcher deployment (2026-07-13)
const LEGACY_HOOKS_FROM_BLOCK = 10639754; // position vault deployment (2026-07-15), before hooks V1-V3
const LAUNCH_FEE_WEI = 500000000000000n; // CoinbarrelAdvancedLauncher.launchFee(), 0.0005 ETH
const SIMPLE_LP_FEE_PIPS = 10000n; // Uniswap V3 1% tier
const SIMPLE_TREASURY_BPS = 3000n; // FeeLocker: 70% creator / 30% treasury
const LEGACY_PLATFORM_BPS = 3000n; // pre-V5 proportional model: 30% platform / 70% project
const PIPS = 1_000_000n;
const BPS = 10_000n;

const QUOTE_FEE_ACCRUED =
  "event QuoteFeeAccrued(bytes32 indexed poolId, address indexed swapSender, bool indexed isBuy, uint256 grossQuote, uint256 netQuote, uint256 totalFee, uint256 treasuryFee, uint256 revenueFee, uint256 reinvestmentFee, uint256 rewardsFee, uint256 burnFee)";
const TOKEN_LAUNCHED =
  "event UnifiedV5TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, address quoteAsset, uint8 launchKind, address rewardEscrow, bytes32 offeredRewardAssetsHash, uint8 defaultRewardAssetIndex, uint256 developerBuyQuoteAmount)";
const VAULT_FEES_COLLECTED =
  "event FeesCollected(address indexed token, uint256 projectWeth, uint256 treasuryWeth, uint256 tokensBurned)";
const SIMPLE_TOKEN_LAUNCHED =
  "event TokenLaunched(address indexed token, address indexed creator, address pool, uint256 positionId, bool isToken0, uint256 restrictionEndBlock, uint256 devBuyAmount)";
const UNIV3_SWAP =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const LEGACY_POOL_REGISTERED =
  "event PoolRegistered(bytes32 indexed poolId, address indexed token, uint24 buyFeePips, uint24 sellFeePips)";
const EFFECTIVE_SWAP_V3 =
  "event EffectiveSwapV3(bytes32 indexed poolId, address indexed sender, bool indexed zeroForOne, bool exactInput, uint128 grossInput, uint128 netOutput, uint128 inputFee, uint128 outputFee, uint24 inputSidePips, uint24 outputSidePips)";
const V4_SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

const abs = (v: any) => (BigInt(v) < 0n ? -BigInt(v) : BigInt(v));

const LABEL = {
  platform: "Platform Fees",
  holderRewards: "Holder Rewards",
  reinvestment: "Reinvestment and Burn",
  launch: "Launch Fees",
  lp: METRIC.LP_FEES,
  creator: METRIC.CREATOR_FEES,
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [feeLogs, launchLogs, allLaunchLogs, vaultLogs, simpleLaunches, legacyRegistrations, legacyV3Swaps] = await Promise.all([
    options.getLogs({ target: HOOK_V5, eventAbi: QUOTE_FEE_ACCRUED }),
    options.getLogs({ target: LAUNCHER_V5, eventAbi: TOKEN_LAUNCHED }),
    // Full history, to map every V5 pool to its quote asset (ETH or USDG).
    options.getLogs({ target: LAUNCHER_V5, eventAbi: TOKEN_LAUNCHED, fromBlock: LAUNCHER_V5_FROM_BLOCK, cacheInCloud: true }),
    options.getLogs({ target: POSITION_VAULT, eventAbi: VAULT_FEES_COLLECTED }),
    // Full history: legacy Simple launches (Uniswap V3 pools) and legacy hook V1/V2 pool registrations.
    options.getLogs({ target: LAUNCHER_SIMPLE, eventAbi: SIMPLE_TOKEN_LAUNCHED, fromBlock: LAUNCHER_SIMPLE_FROM_BLOCK, cacheInCloud: true }),
    options.getLogs({ targets: HOOKS_LEGACY_V1_V2, eventAbi: LEGACY_POOL_REGISTERED, fromBlock: LEGACY_HOOKS_FROM_BLOCK, cacheInCloud: true, flatten: true }),
    options.getLogs({ targets: HOOKS_LEGACY_V3, eventAbi: EFFECTIVE_SWAP_V3, flatten: true }),
  ]);

  const quoteByPool: Record<string, string> = {};
  for (const log of allLaunchLogs) quoteByPool[String(log.poolId).toLowerCase()] = log.quoteAsset;

  // 1. Hook fee on every swap, split by policy bucket. Amounts are in the pool's quote asset.
  //    treasuryFee is the platform fee (Coinbarrel revenue); the other buckets are the
  //    creator-configured fee and belong to the launched token's side.
  for (const log of feeLogs) {
    const quote = quoteByPool[String(log.poolId).toLowerCase()] ?? NATIVE;
    dailyFees.add(quote, log.totalFee, METRIC.TRADING_FEES);
    dailyRevenue.add(quote, log.treasuryFee, LABEL.platform);
    dailySupplySideRevenue.add(quote, log.revenueFee, LABEL.creator);
    dailySupplySideRevenue.add(quote, log.rewardsFee, LABEL.holderRewards);
    dailySupplySideRevenue.add(quote, BigInt(log.reinvestmentFee) + BigInt(log.burnFee), LABEL.reinvestment);
  }

  // 3. Uniswap LP fees swept from the locked launch positions (WETH side only;
  //    the token side is burned or unpriced). Treasury share is Coinbarrel revenue,
  //    project share goes to the launched token's revenue recipients.
  for (const log of vaultLogs) {
    dailyFees.add(WETH, BigInt(log.projectWeth) + BigInt(log.treasuryWeth), LABEL.lp);
    dailyRevenue.add(WETH, log.treasuryWeth, LABEL.lp);
    dailySupplySideRevenue.add(WETH, log.projectWeth, LABEL.lp);
  }

  // 4. Fixed launch service fee, paid to the treasury inside the launch transaction.
  if (launchLogs.length) {
    const launchFees = BigInt(launchLogs.length) * LAUNCH_FEE_WEI;
    dailyFees.add(NATIVE, launchFees, LABEL.launch);
    dailyRevenue.add(NATIVE, launchFees, LABEL.launch);
  }

  // 5. Legacy Simple launches: plain Uniswap V3 pools on the 1% tier. Uniswap V3 takes the LP fee
  //    in the input token, so only swaps that pay WETH into the pool produce a WETH fee; the
  //    token-denominated fee on sells is reserved by the FeeLocker and never paid out as WETH,
  //    so it is not counted. The WETH fee accrues to the permanently locked launch position and
  //    the FeeLocker later collects it 70/30 creator/treasury, so it is counted per swap with
  //    that split.
  const simplePools: Record<string, boolean> = {}; // pool -> launched token is token0
  for (const log of simpleLaunches) simplePools[String(log.pool).toLowerCase()] = Boolean(log.isToken0);
  const simplePoolList = Object.keys(simplePools);
  if (simplePoolList.length) {
    const swaps = await options.getLogs({ targets: simplePoolList, eventAbi: UNIV3_SWAP, entireLog: true, flatten: true });
    for (const log of swaps) {
      const args = log.args ?? log;
      const tokenIsToken0 = simplePools[String(log.address).toLowerCase()];
      if (tokenIsToken0 === undefined) continue;
      const wethDelta = BigInt(tokenIsToken0 ? args.amount1 : args.amount0); // positive when WETH enters the pool
      if (wethDelta <= 0n) continue;
      const fee = wethDelta * SIMPLE_LP_FEE_PIPS / PIPS;
      const treasuryShare = fee * SIMPLE_TREASURY_BPS / BPS;
      dailyFees.add(WETH, fee, LABEL.lp);
      dailyRevenue.add(WETH, treasuryShare, LABEL.lp);
      dailySupplySideRevenue.add(WETH, fee - treasuryShare, LABEL.lp);
    }
  }

  // 6. Legacy Advanced hooks. Pools are ETH-quoted and native ETH is always currency0 on
  //    Uniswap V4, so the ETH-side fee is inputFee on buys (zeroForOne) and outputFee on sells.
  const addLegacyHookFee = (fee: bigint) => {
    const platform = fee * LEGACY_PLATFORM_BPS / BPS;
    dailyFees.add(NATIVE, fee, METRIC.TRADING_FEES);
    dailyRevenue.add(NATIVE, platform, LABEL.platform);
    dailySupplySideRevenue.add(NATIVE, fee - platform, LABEL.creator);
  };
  for (const log of legacyV3Swaps) addLegacyHookFee(BigInt(log.zeroForOne ? log.inputFee : log.outputFee));

  //    Hooks V1 and V2 emit no per-swap event: read the PoolManager swaps for the pools they
  //    registered and apply the registered buy/sell pips to the ETH leg.
  const legacyPips: Record<string, { buy: bigint; sell: bigint }> = {};
  for (const log of legacyRegistrations) legacyPips[String(log.poolId).toLowerCase()] = { buy: BigInt(log.buyFeePips), sell: BigInt(log.sellFeePips) };
  const legacyPoolIds = Object.keys(legacyPips);
  if (legacyPoolIds.length) {
    // eth_getLogs accepts an array at a topic position (OR filter) and the sdk passes topics through
    // as-is, so one query covers every legacy pool instead of one query per pool.
    const swaps = await options.getLogs({
      target: POOL_MANAGER,
      eventAbi: V4_SWAP,
      topics: [ethers.id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"), legacyPoolIds as unknown as string],
    });
    for (const log of swaps) {
      const cfg = legacyPips[String(log.id).toLowerCase()];
      if (!cfg) continue;
      const amount0 = BigInt(log.amount0);
      const isBuy = amount0 < 0n; // the swapper paid ETH
      addLegacyHookFee(abs(amount0) * (isBuy ? cfg.buy : cfg.sell) / PIPS);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Hook fees charged on the quote leg of every swap in Coinbarrel-launched Uniswap V4 pools (flat platform fee plus the creator-configured fee, read per swap from the hook's QuoteFeeAccrued event), Uniswap LP fees swept from the permanently locked launch positions, the fixed 0.0005 ETH launch service fee, and the legacy pre-V5 streams: the 1% LP fee on the Simple launches' Uniswap V3 pools and the per-swap fees of the legacy Advanced hooks.",
  Revenue: "The platform share that ends up in the Coinbarrel treasury: the platform bucket of the hook fee (counted when it accrues; the fee router pays it out in batches), the treasury share of LP fees (30% on Simple launches, per the FeeLocker split), and launch fees. Nothing of the creator fee reaches Coinbarrel.",
  ProtocolRevenue: "Same as Revenue; Coinbarrel has no token buyback or holder distribution.",
  SupplySideRevenue: "The creator-configured fee, which goes entirely to the launched token's side: creator revenue recipients, holder rewards, reinvestment into the pool, or burn; plus the creator/project share of LP fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Hook fee on each swap (platform fee + creator fee) in the pool's quote asset: QuoteFeeAccrued.totalFee on Hook V5, EffectiveSwapV3 on the legacy V3 hook, and PoolManager swaps times the registered buy/sell pips for the legacy V1/V2 hooks.",
    [LABEL.lp]: "Uniswap LP fees on the locked launch positions: 1% of the WETH paid into the Simple launches' Uniswap V3 pools on WETH-input swaps (the token-side fee on sells is not priced), plus LP fees swept from the Uniswap V4 positions (FeesCollected on the position vault, WETH side). These fees are also inside Uniswap's own fee reporting for Robinhood Chain.",
    [LABEL.launch]: "Fixed 0.0005 ETH service fee per launch, counted as UnifiedV5TokenLaunched events times the launcher's launchFee constant.",
  },
  Revenue: {
    [LABEL.platform]: "Platform bucket of the hook fee: QuoteFeeAccrued.treasuryFee on Hook V5; 30% of the fee on the legacy Advanced hooks (proportional model).",
    [LABEL.lp]: "Treasury share of LP fees: 30% on the Simple launches (FeeLocker split) and FeesCollected.treasuryWeth on the position vault.",
    [LABEL.launch]: "Fixed launch service fee paid to the treasury.",
  },
  SupplySideRevenue: {
    [LABEL.creator]: "Creator revenue bucket of the hook fee (QuoteFeeAccrued.revenueFee on Hook V5; 70% of the fee on the legacy Advanced hooks), claimable by the launch's registered revenue recipients.",
    [LABEL.holderRewards]: "Holder rewards bucket of the hook fee (QuoteFeeAccrued.rewardsFee), escrowed for the launched token's holders.",
    [LABEL.reinvestment]: "Reinvestment and burn buckets of the hook fee (QuoteFeeAccrued.reinvestmentFee + burnFee), spent on the launched token's own pool or burned.",
    [LABEL.lp]: "Creator/project share of LP fees: 70% on the Simple launches and FeesCollected.projectWeth on the position vault.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-13", // first Coinbarrel launcher deployed on Robinhood Chain (block 8955028)
  methodology,
  breakdownMethodology,
  doublecounted: true, // uniswap v4
};

export default adapter;
