import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// LoopUP (https://loopup.fun) is a launchpad on Robinhood Chain built on the MIT-licensed Pons V2
// contracts (LoopV2LaunchFactory / LoopV2BondingCurve / LoopV2MemeHook). Two launch sets are live,
// each with its own factory and Uniswap V4 hook. Deploy blocks are from the deployment receipts.
const LAUNCH_SETS = [
  { // platform set: every public launch on loopup.fun
    factory: "0xd8146E5Dd21a67E2fe45752de44B95fD09609A8d",
    hook: "0x9EC08e4C93A5dB69090864D6EEC4a2cE9F1Ae044",
    fromBlock: 107579725,
  },
  { // LOOP set: launched the $LOOP token (0xe846503c6915a93f30fce4fc003b4f4f4e75f9d9)
    factory: "0x5e0Af0cf7a20e797ef0C65b8aBE5423E5Db7356c",
    hook: "0x610a2e5b9aa165CD5F4b404815ed94D654D02044",
    fromBlock: 107581085,
  },
];
// Uniswap V4 PoolManager on Robinhood Chain (LoopV2MemeHook.poolManager()).
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
// Protocol fee recipient of both sets (getLaunchFeePolicy().protocolFeeRecipient). LoopFeeSplitter.split()
// sends half of every fee it receives to the Looper rewards leg (KolRewardsDistributor
// 0xA9327022E0af3F7018521e0363997137Af6D1cC5) and the other half to the $LOOP buyback-and-burn leg.
// Launch fees it receives are booked separately to the treasury (treasuryOwed).
const FEE_SPLITTER = "0x642f6D7b8BA8f4D6B82e5059A5d11352aD5EE26e";
const LOOPER_SHARE_OF_PROTOCOL_FEE = 0.5; // LoopFeeSplitter.split(): toKol = delta / 2
// Buyback-and-burn wallet. The $LOOP token's creator fee recipient is this wallet too, so the $LOOP
// creator share is also used to buy back and burn $LOOP.
const BURN_WALLET = "0x3bEa91ACeAd42968682a5e90f2a94ddf81f9364e";
const BPS = 10_000n;

const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)";
const CURVE_BUY = "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)";
const CURVE_SELL = "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)";
const HOOK_FEE_COLLECTED = "event HookFeeCollected(bytes32 indexed poolId, address currency, uint256 feeAmount, uint256 taxAmount)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const LAUNCH_FEE_POLICY = "function getLaunchFeePolicy(address token) view returns (tuple(address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps))";
const LAUNCHED_TOKEN = "function getLaunchedToken(address token) view returns (tuple(address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))";
const HOOK_LAUNCHES = "function launches(bytes32 poolId) view returns (bool registered, bool memecoinIsCurrency0, address memecoin, address quoteToken, address creator, address buybackCreatorRecipient, address protocolFeeRecipient, uint16 creatorTaxBps, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps, bool buybackEnabled)";

const LABEL = {
  launchFees: "Launch Fees",
  curveFees: "Curve Swap Fees",
  poolFees: "Graduated Pool Swap Fees",
  creatorTax: "Creator Tax",
  toTreasury: "Launch Fees To Treasury",
  toCreators: "Swap Fees To Token Creators",
  toLoopers: "Swap Fees To Looper Rewards",
  toBurn: "Swap Fees To LOOP Buyback And Burn",
  toMemeBuyback: "Swap Fees To Memecoin Buyback And Lock",
  taxToCreators: "Creator Tax To Token Creators",
  taxToBurn: "Creator Tax To LOOP Buyback And Burn",
};

const SUPPLY_SIDE_LABELS = new Set([LABEL.toCreators, LABEL.taxToCreators, LABEL.toMemeBuyback, LABEL.toLoopers]);

const abs = (v: bigint) => (v < 0n ? -v : v);
const lower = (a: string) => String(a).toLowerCase();

type Policy = { protocolFeeRecipient: string, protocolFeeShareBps: bigint, buybackBurnBps: bigint, creator: string };

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Every swap fee is booked under its source label in Fees and under its destination label in either
  // Supply Side Revenue (creators, Loopers) or Revenue + Holders Revenue (the $LOOP burn legs).
  function addFee(quote: string, amount: bigint, feeLabel: string, destLabel: string) {
    if (amount === 0n) return;
    dailyFees.add(quote, amount, feeLabel);
    if (SUPPLY_SIDE_LABELS.has(destLabel)) return dailySupplySideRevenue.add(quote, amount, destLabel);
    dailyRevenue.add(quote, amount, destLabel);
    dailyHoldersRevenue.add(quote, amount, destLabel);
  }

  // Splits a base fee and creator tax exactly like LoopV2BondingCurve._accrueFees / LoopV2MemeHook._distribute.
  function addSplit(quote: string, fee: bigint, tax: bigint, policy: Policy, feeLabel: string) {
    if (lower(policy.protocolFeeRecipient) !== lower(FEE_SPLITTER))
      throw new Error(`LoopUP protocol fee recipient changed to ${policy.protocolFeeRecipient}; review fee attribution`);
    const protocol = fee * policy.protocolFeeShareBps / BPS;
    const creatorSlice = fee - protocol;
    const memeBuyback = creatorSlice * policy.buybackBurnBps / BPS;
    const creator = creatorSlice - memeBuyback;
    const toLoopers = protocol * BigInt(LOOPER_SHARE_OF_PROTOCOL_FEE * 100) / 100n;
    const creatorIsBurn = lower(policy.creator) === lower(BURN_WALLET);
    addFee(quote, toLoopers, feeLabel, LABEL.toLoopers);
    addFee(quote, protocol - toLoopers, feeLabel, LABEL.toBurn);
    addFee(quote, memeBuyback, feeLabel, LABEL.toMemeBuyback);
    addFee(quote, creator, feeLabel, creatorIsBurn ? LABEL.toBurn : LABEL.toCreators);
    addFee(quote, tax, LABEL.creatorTax, creatorIsBurn ? LABEL.taxToBurn : LABEL.taxToCreators);
  }

  const factories = LAUNCH_SETS.map((s) => s.factory);
  const hooks = LAUNCH_SETS.map((s) => s.hook);

  // ---- launches (full history, cached) and launch fees (this window) ----
  const allLaunches: any[][] = await options.getLogs({
    targets: factories, eventAbi: TOKEN_LAUNCHED, fromBlock: Math.min(...LAUNCH_SETS.map((s) => s.fromBlock)), cacheInCloud: true, flatten: false,
  });
  const curveInfo: Record<string, { token: string, pairToken: string, factory: string }> = {};
  allLaunches.forEach((logs, i) => {
    for (const l of logs) curveInfo[lower(l.curve)] = { token: l.token, pairToken: l.pairToken, factory: factories[i] };
  });

  const [windowLaunches, launchFees] = await Promise.all([
    options.getLogs({ targets: factories, eventAbi: TOKEN_LAUNCHED, flatten: false }),
    // Flat ETH fee per launch, paid to the LoopFeeSplitter treasury leg (LoopV2LaunchFactory._payLaunchFee).
    options.api.multiCall({ abi: "uint256:launchFee", calls: factories }),
  ]);
  windowLaunches.forEach((logs: any[], i: number) => {
    const amount = BigInt(launchFees[i]) * BigInt(logs.length);
    if (amount === 0n) return;
    dailyFees.addGasToken(amount, LABEL.launchFees);
    dailyRevenue.addGasToken(amount, LABEL.toTreasury);
    dailyProtocolRevenue.addGasToken(amount, LABEL.toTreasury);
  });

  // ---- bonding-curve trades ----
  const curves = Object.keys(curveInfo);
  if (curves.length) {
    const [buys, sells] = await Promise.all([
      options.getLogs({ targets: curves, eventAbi: CURVE_BUY, flatten: false }),
      options.getLogs({ targets: curves, eventAbi: CURVE_SELL, flatten: false }),
    ]);
    const active = curves.filter((_, i) => buys[i].length || sells[i].length);
    const [policies, launched] = await Promise.all([
      options.api.multiCall({ abi: LAUNCH_FEE_POLICY, calls: active.map((c) => ({ target: curveInfo[c].factory, params: [curveInfo[c].token] })) }),
      options.api.multiCall({ abi: LAUNCHED_TOKEN, calls: active.map((c) => ({ target: curveInfo[c].factory, params: [curveInfo[c].token] })) }),
    ]);
    active.forEach((curve, j) => {
      const i = curves.indexOf(curve);
      const quote = curveInfo[curve].pairToken;
      const policy: Policy = {
        protocolFeeRecipient: policies[j].protocolFeeRecipient,
        protocolFeeShareBps: BigInt(policies[j].protocolFeeShareBps),
        buybackBurnBps: BigInt(policies[j].buybackBurnBps),
        creator: launched[j].creatorFeeRecipient,
      };
      // CurveBuy.fee already includes the anti-snipe launch tax, which the curve splits like the base fee.
      for (const b of buys[i]) {
        dailyVolume.add(quote, b.quoteIn);
        addSplit(quote, BigInt(b.fee), BigInt(b.tax), policy, LABEL.curveFees);
      }
      for (const s of sells[i]) {
        dailyVolume.add(quote, BigInt(s.quoteOut) + BigInt(s.fee) + BigInt(s.tax));
        addSplit(quote, BigInt(s.fee), BigInt(s.tax), policy, LABEL.curveFees);
      }
    });
  }

  // ---- graduated Uniswap V4 pools: fee and creator tax skimmed by the hook on every swap ----
  const hookLogs: any[][] = await options.getLogs({ targets: hooks, eventAbi: HOOK_FEE_COLLECTED, flatten: false, onlyArgs: false });
  const poolKeys: { hook: string, poolId: string }[] = [];
  const seen = new Set<string>();
  hookLogs.forEach((logs, i) => logs.forEach((log) => {
    const key = `${hooks[i]}-${log.args.poolId}`;
    if (!seen.has(key)) { seen.add(key); poolKeys.push({ hook: hooks[i], poolId: log.args.poolId }); }
  }));
  if (!poolKeys.length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };

  const pools = await options.api.multiCall({ abi: HOOK_LAUNCHES, calls: poolKeys.map(({ hook, poolId }) => ({ target: hook, params: [poolId] })) });
  const poolInfo: Record<string, any> = {};
  poolKeys.forEach((k, i) => { poolInfo[`${k.hook}-${k.poolId}`] = pools[i]; });

  // A fee skimmed in the memecoin is valued in the pool's quote asset at the price of the swap it was
  // taken from. The hook emits HookFeeCollected inside afterSwap, so that swap is the last PoolManager
  // Swap of the same pool earlier in the same transaction.
  const memePools = poolKeys.filter((k) => hookLogs[hooks.indexOf(k.hook)].some((log) =>
    log.args.poolId === k.poolId && lower(log.args.currency) !== lower(poolInfo[`${k.hook}-${k.poolId}`].quoteToken)));
  const swapLogs: any[] = memePools.length ? await options.getLogs({
    target: POOL_MANAGER, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, memePools.map(({ poolId }) => poolId)] as any, onlyArgs: false,
  }) : [];
  const swapsByTx: Record<string, any[]> = {};
  swapLogs.forEach((log) => {
    const key = `${log.args.id}-${lower(log.transactionHash)}`;
    (swapsByTx[key] = swapsByTx[key] ?? []).push(log);
  });

  hookLogs.forEach((logs, i) => logs.forEach((log) => {
    const info = poolInfo[`${hooks[i]}-${log.args.poolId}`];
    const quote = info.quoteToken;
    const policy: Policy = {
      protocolFeeRecipient: info.protocolFeeRecipient,
      protocolFeeShareBps: BigInt(info.protocolFeeShareBps),
      buybackBurnBps: BigInt(info.buybackBurnBps),
      creator: info.creator,
    };
    let fee = BigInt(log.args.feeAmount);
    let tax = BigInt(log.args.taxAmount);
    if (lower(log.args.currency) !== lower(quote)) {
      const swap = (swapsByTx[`${log.args.poolId}-${lower(log.transactionHash)}`] ?? [])
        .filter((s) => Number(s.logIndex) < Number(log.logIndex))
        .sort((a, b) => Number(b.logIndex) - Number(a.logIndex))[0];
      if (!swap) throw new Error(`LoopUP: no Uniswap V4 swap found for hook fee in tx ${log.transactionHash}`);
      const memeAmount = abs(BigInt(info.memecoinIsCurrency0 ? swap.args.amount0 : swap.args.amount1));
      const quoteAmount = abs(BigInt(info.memecoinIsCurrency0 ? swap.args.amount1 : swap.args.amount0));
      fee = memeAmount === 0n ? 0n : fee * quoteAmount / memeAmount;
      tax = memeAmount === 0n ? 0n : tax * quoteAmount / memeAmount;
    }
    addSplit(quote, fee, tax, policy, LABEL.poolFees);
  }));

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
}

const methodology = {
  Volume: "Volume of trades on LoopUP bonding curves, in the quote asset. Trades in graduated Uniswap V4 pools are not included, they are counted under Uniswap V4.",
  Fees: "Launch fees, the 1% swap fee on bonding-curve trades and graduated Uniswap V4 pool trades (including the short decaying anti-snipe tax at launch), and any optional creator tax, all paid by traders and launchers.",
  UserFees: "Launch fees, swap fees and creator tax paid by LoopUP traders and token launchers.",
  Revenue: "Launch fees kept by the LoopUP treasury, plus the 20% of every swap fee used to buy back and burn $LOOP, plus the creator share and creator tax of the $LOOP token itself, which also go to the burn.",
  SupplySideRevenue: "The 60% of every swap fee and all creator tax paid to token creators, and the 20% of every swap fee paid to Loopers, the verified callers who earn on the trades of tokens they call. The $LOOP token's own creator share is burned instead and is not included.",
  ProtocolRevenue: "Flat ETH launch fees paid to the LoopUP treasury.",
  HoldersRevenue: "The 20% of every swap fee used to buy back and burn $LOOP, plus the creator share and creator tax of the $LOOP token itself, whose creator fee recipient is the burn wallet.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.launchFees]: "Flat ETH fee paid for every token launched (LoopV2LaunchFactory.launchFee).",
    [LABEL.curveFees]: "1% fee (plus the decaying anti-snipe tax at launch) on every bonding-curve buy and sell, from CurveBuy and CurveSell events.",
    [LABEL.poolFees]: "1% fee skimmed by the LoopUP Uniswap V4 hook on every graduated-pool swap, from HookFeeCollected events; fees taken in the memecoin are valued at the price of the swap they came from.",
    [LABEL.creatorTax]: "Optional creator-chosen trade tax on curve and graduated-pool trades.",
  },
  UserFees: {
    [LABEL.launchFees]: "Flat ETH fee paid by the launcher of every token.",
    [LABEL.curveFees]: "1% fee paid by traders on every bonding-curve trade.",
    [LABEL.poolFees]: "1% fee paid by traders on every graduated Uniswap V4 pool swap.",
    [LABEL.creatorTax]: "Optional creator tax paid by traders.",
  },
  Revenue: {
    [LABEL.toTreasury]: "Launch fees sent to the LoopUP treasury leg of the LoopFeeSplitter.",
    [LABEL.toBurn]: "20% of the swap fee (half of the 40% protocol share) used to buy back and burn $LOOP, plus the creator share of tokens whose creator fee recipient is the burn wallet ($LOOP itself).",
    [LABEL.taxToBurn]: "Creator tax of tokens whose creator fee recipient is the $LOOP burn wallet.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "60% of the swap fee, paid to each token's creator fee recipient.",
    [LABEL.toLoopers]: "20% of the swap fee (half of the 40% protocol share), paid to the KolRewardsDistributor for Looper (caller) rewards.",
    [LABEL.toMemeBuyback]: "Part of the creator share used to buy back and lock the traded memecoin when a creator enables it (0% on all current launches).",
    [LABEL.taxToCreators]: "Creator tax, paid in full to the token's creator fee recipient.",
  },
  ProtocolRevenue: {
    [LABEL.toTreasury]: "Launch fees sent to the LoopUP treasury leg of the LoopFeeSplitter.",
  },
  HoldersRevenue: {
    [LABEL.toBurn]: "20% of the swap fee used to buy back and burn $LOOP, plus the creator share of $LOOP itself, whose creator fee recipient is the burn wallet.",
    [LABEL.taxToBurn]: "Creator tax of tokens whose creator fee recipient is the $LOOP burn wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-11-07", // first LoopUP launch ($LOOP, block 108610496); factories deployed 2026-11-06
  methodology,
  breakdownMethodology,
};

export default adapter;
