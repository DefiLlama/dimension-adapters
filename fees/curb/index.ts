import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// CURB - token launchpad on Base, live since 2026-10-16. https://curbfun.xyz , docs https://curbfun.xyz/docs.html
// Every launch trades on its own bonding curve (a vendored Pons V2 curve) against one of the quote assets the
// registry admits (WETH, USDC, cbBTC, VIRTUAL, AERO, tokenized stocks, ...). At its threshold it graduates into a
// Uniswap v4 pool that carries CURB's FeeHook - one hook for every launch - and its LP is locked forever.
// One trading tax per launch (1%-5%, chosen at launch, never changeable) is charged in the quote asset on both
// venues: the platform takes a fixed share of the trade (0.50% at deployment, frozen into each launch) and the
// creator takes the rest - or the launch's own holders, once the creator turns holder sharing on (one-way).
// Launching costs gas only (no launch fee). Contracts are verified on Sourcify.

const LAUNCH_REGISTRY = "0x86e9a01F3959A96469051AE1a73D5C09b0BaC110";
const FEE_HOOK = "0xF85Ce05c2Ba8533d79f009fd3A3c8517aaBda0cC";
const GRADUATOR = "0xA9865e07Ce4EC0cCf7A521B98640031285C92712";
const DEPLOY_BLOCK = 52662669; // first transaction of the deployment run, 2026-10-16 01:38 UTC

// The platform recipient (treasury Safe) the hook was deployed with. Every launch freezes the recipient in force
// when it was created, so a later change adds an address rather than replacing this one; see PlatformRecipientUpdated.
const GENESIS_PLATFORM_RECIPIENT = "0x6724eb5C59D617B1c65d88Cc6734B19b9E0eB7eE";

// Factories (one per quote asset): launch created. `creator` is the launch's beneficiary, who earns the creator share.
const LAUNCH_CREATED =
  "event LaunchCreated(address indexed launchToken, address indexed curve, address indexed creator, uint256 supply, uint16 totalTaxBps)";
// Curves: `fee` is the platform's share of the tax and `tax` the creator's, both in the quote asset.
// quoteIn is gross on a buy; quoteOut is net on a sell (fee and tax already taken off it).
const CURVE_BUY =
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)";
const CURVE_SELL =
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)";
// FeeHook, per taxed pool swap: each non-zero leg of the tax, by recipient, as FeePaidDirect (paid out in the swap)
// or FeeAccrued (recorded as owed - always on WETH pools); both are emitted only inside a swap.
const FEE_PAID_DIRECT = "event FeePaidDirect(address indexed to, address indexed token, uint256 amount)";
const FEE_ACCRUED = "event FeeAccrued(address indexed to, address indexed token, uint256 amount)";
const PLATFORM_RECIPIENT_UPDATED = "event PlatformRecipientUpdated(address indexed previous, address indexed next)";
// Graduator: a launch's creator share goes to `distributor` (its holders) from this log on, for good.
const HOLDER_SHARING_ENABLED =
  "event HolderSharingEnabled(address indexed launchToken, address indexed distributor, address indexed factory, address by, bool graduated, uint64 sinceBlock)";

const LABELS = {
  CURVE_TAX: "Bonding Curve Trading Tax",
  POOL_TAX: "Graduated Pool Trading Tax",
  TAX_TO_TREASURY: "Trading Tax To Treasury",
  TAX_TO_CREATORS: METRIC.CREATOR_FEES,
  TAX_TO_LAUNCH_HOLDERS: "Trading Tax To Launch Holders",
};

type LogPosition = { block: number; index: number };
const positionOf = (log: any): LogPosition => ({ block: Number(log.blockNumber), index: Number(log.logIndex ?? log.index) });
const isAfter = (a: LogPosition, b: LogPosition) => a.block > b.block || (a.block === b.block && a.index > b.index);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // The registry has no code before the deployment, so a window that ends before it (the first hour of the start
  // day) has nothing to read and reports zeros.
  if ((await options.getToBlock()) < DEPLOY_BLOCK)
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };

  // Every launch and the asset it trades in. The registry's launcher list is append-only (no removal), one
  // factory per quote asset, and each factory logs the curve of every launch it creates.
  const factories: string[] = await options.api.fetchList({ lengthAbi: "launcherCount", itemAbi: "launcherAt", target: LAUNCH_REGISTRY });
  const quoteTokens: string[] = await options.api.multiCall({ abi: "address:quoteToken", calls: factories });
  const launchesByFactory: any[][] = await options.getLogs({
    targets: factories,
    eventAbi: LAUNCH_CREATED,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
    flatten: false,
  });
  const launchOfCurve: Record<string, { launchToken: string; creator: string; quoteToken: string }> = {};
  launchesByFactory.forEach((logs, i) => {
    for (const log of logs) {
      launchOfCurve[log.curve.toLowerCase()] = {
        launchToken: log.launchToken.toLowerCase(),
        creator: log.creator.toLowerCase(),
        quoteToken: quoteTokens[i],
      };
    }
  });

  // The treasury: every platform recipient the hook has had. A launch whose creator wallet is the treasury
  // ($CURB itself) pays its creator share to the treasury too.
  const recipientUpdates = await options.getLogs({
    target: FEE_HOOK,
    eventAbi: PLATFORM_RECIPIENT_UPDATED,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const treasury = new Set([GENESIS_PLATFORM_RECIPIENT, ...recipientUpdates.map((log: any) => log.next)].map((a) => a.toLowerCase()));

  // Holder sharing: from which log on each launch's creator share belongs to its holders, and to which distributor.
  const sharingLogs = await options.getLogs({
    target: GRADUATOR,
    eventAbi: HOLDER_SHARING_ENABLED,
    fromBlock: DEPLOY_BLOCK,
    onlyArgs: false,
    cacheInCloud: true,
  });
  const sharingSince: Record<string, LogPosition> = {};
  const distributors = new Set<string>();
  for (const log of sharingLogs) {
    sharingSince[log.args.launchToken.toLowerCase()] = positionOf(log);
    distributors.add(log.args.distributor.toLowerCase());
  }

  // ---- Bonding curves. Queried by topic and kept only when emitted by a curve a CURB factory created: one call
  // whatever the number of launches. allowParseFailure only lets a foreign contract's log that shares the topic
  // through undecoded; such a log is dropped by the curve filter below before its fields are read.
  const [buys, sells] = await Promise.all([
    options.getLogs({ noTarget: true, eventAbi: CURVE_BUY, onlyArgs: false, allowParseFailure: true }),
    options.getLogs({ noTarget: true, eventAbi: CURVE_SELL, onlyArgs: false, allowParseFailure: true }),
  ]);
  const addCurveTrade = (log: any, isBuy: boolean) => {
    const launch = launchOfCurve[String(log.address).toLowerCase()];
    if (!launch) return;
    const { quoteToken } = launch;
    const fee = BigInt(log.args.fee);
    const tax = BigInt(log.args.tax);
    const gross = isBuy ? BigInt(log.args.quoteIn) : BigInt(log.args.quoteOut) + fee + tax;

    dailyVolume.add(quoteToken, gross);
    dailyFees.add(quoteToken, fee + tax, LABELS.CURVE_TAX);
    dailyRevenue.add(quoteToken, fee, LABELS.TAX_TO_TREASURY);

    const since = sharingSince[launch.launchToken];
    if (since && isAfter(positionOf(log), since)) dailySupplySideRevenue.add(quoteToken, tax, LABELS.TAX_TO_LAUNCH_HOLDERS);
    else if (treasury.has(launch.creator)) dailyRevenue.add(quoteToken, tax, LABELS.TAX_TO_TREASURY);
    else dailySupplySideRevenue.add(quoteToken, tax, LABELS.TAX_TO_CREATORS);
  };
  for (const log of buys) addCurveTrade(log, true);
  for (const log of sells) addCurveTrade(log, false);

  // ---- Graduated pools (Uniswap v4 + FeeHook). No volume: these swaps are Uniswap v4 volume, already counted by
  // the Uniswap v4 adapter. The tax split from its legs, by recipient: the platform leg always goes to the launch's
  // frozen platform recipient (a treasury address), the creator leg to the creator, to the treasury for a
  // treasury-created launch, or to the launch's distributor once it shares.
  const [paidDirect, accrued] = await Promise.all([
    options.getLogs({ target: FEE_HOOK, eventAbi: FEE_PAID_DIRECT }),
    options.getLogs({ target: FEE_HOOK, eventAbi: FEE_ACCRUED }),
  ]);
  for (const log of [...paidDirect, ...accrued]) {
    const to = log.to.toLowerCase();
    dailyFees.add(log.token, log.amount, LABELS.POOL_TAX);
    if (treasury.has(to)) dailyRevenue.add(log.token, log.amount, LABELS.TAX_TO_TREASURY);
    else if (distributors.has(to)) dailySupplySideRevenue.add(log.token, log.amount, LABELS.TAX_TO_LAUNCH_HOLDERS);
    else dailySupplySideRevenue.add(log.token, log.amount, LABELS.TAX_TO_CREATORS);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross quote-asset value of every buy and sell on CURB bonding curves (CurveBuy quoteIn; CurveSell quoteOut + fee + tax). Trading in graduated Uniswap v4 pools is excluded: it is counted by the Uniswap v4 adapter.",
  Fees: "The trading tax (1%-5%, set per launch) paid on every curve and graduated-pool trade, in the quote asset. The pools' 0.05% Uniswap v4 LP fee is not included: it is earned by the pool's liquidity and already counted by the Uniswap v4 adapter.",
  UserFees: "Traders pay the whole trading tax. Launching costs gas only.",
  Revenue: "The platform's share of the tax (0.50% of the trade at deployment, frozen into each launch), plus the creator share of launches whose creator wallet is the treasury ($CURB).",
  ProtocolRevenue: "The platform's share of the tax on both venues, plus the creator share of treasury-created launches ($CURB), paid to the treasury Safe.",
  SupplySideRevenue: "The rest of the tax: to the launch's creator, or to the launch's own token holders through its distributor once holder sharing is on.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_TAX]: "Platform share (fee) plus creator share (tax) of every CurveBuy and CurveSell on the bonding curve of a launch created by a CURB factory.",
    [LABELS.POOL_TAX]: "Every leg of the tax the FeeHook takes from a graduated pool swap, paid out (FeePaidDirect) or recorded as owed (FeeAccrued).",
  },
  UserFees: {
    [LABELS.CURVE_TAX]: "Trading tax paid by bonding-curve traders.",
    [LABELS.POOL_TAX]: "Trading tax paid by graduated-pool traders.",
  },
  Revenue: {
    [LABELS.TAX_TO_TREASURY]: "The platform's share of the tax on both venues, plus the creator share of treasury-created launches ($CURB), paid to the treasury Safe.",
  },
  ProtocolRevenue: {
    [LABELS.TAX_TO_TREASURY]: "The platform's share of the tax on both venues, plus the creator share of treasury-created launches ($CURB), paid to the treasury Safe.",
  },
  SupplySideRevenue: {
    [LABELS.TAX_TO_CREATORS]: "Creator share of the tax, paid to the launch's creator wallet.",
    [LABELS.TAX_TO_LAUNCH_HOLDERS]: "Creator share of the tax on launches with holder sharing on, paid to the launch's distributor and split among that launch's token holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-10-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
