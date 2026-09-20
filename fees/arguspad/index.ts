import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// ArgusPad (arguspad.io) - tax-token launchpad on Arc. A launch mints its whole supply into a
// single-sided Uniswap v4 position held by a locker clone with no withdrawal path, so the position
// is permanently locked and there is no bonding curve: every trade is a plain v4 pool swap from
// block one. Each launch deploys its own tax hook, fee splitter and locker, announced by the
// Portal that created it:
//   ArgusV4TaxHook          charges the buy/sell tax on each swap        -> TaxTaken, SnipeTaxApplied
//   ArgusV4HookedLocker     harvests the locked position's LP fees       -> Forwarded
//   ArgusV4HookedSplitter   splits the pot between treasury/creator/...  -> Distributed, Paid, ...
// Protocol treasury, returned by treasury() on all ten Portals:
const TREASURY = "0x934dea9ab179de155db10519aa89a8c418c50705";

// Every Portal ArgusPad has launched a Uniswap v4 tax token from, in generation order P3..P7.
// Enumerated from the deployer's complete CREATE history rather than from logs, so this is the
// whole set; two further hooked Portals exist and have never carried a launch, and the retired
// Uniswap v3 line (three Portals, 59 launches between them) predates this fee machinery and emits
// none of these events.
const PORTALS = [
  "0xb021be536808f551b31789422fd28a6c9c6e97da", // P7, 139675 launches
  "0xa5628a11c412596e1f63b75a2c0284f843c549d6", // P6, 323
  "0x07a688a001f416cc433c68ff56aa26bc5131cc6e", // P5, 1
  "0xa36c443a797771df82533b8b4a86f0affd970862", // P4, 22
  "0x7a17ab0106c46c0be30623f3eb7f299cc0058338", // P3, 1
];
// P3's creation block, the first of the five; its only launch is at 19674581.
const FIRST_PORTAL_BLOCK = 19674154;

const PARTS_DEPLOYED = "event PartsDeployed(address indexed token, address locker, address hook, address splitter)";
// sellTaxBps is needed to net out the tax the splitter charges itself (see SELF-TAX below). The
// event's own comment is "emitted once and never amended because nothing here can be amended".
const FEE_CONFIGURED = "event FeeConfigured(address indexed token, address indexed hook, uint16 lpFeeBps, uint16 buyTaxBps, uint16 sellTaxBps, uint16 treasuryBps, uint16 creatorBps, uint16 burnBps, uint16 dividendBps, uint16 liquidityBps)";

const TAX_TAKEN = "event TaxTaken(address indexed currency, uint256 amount, bool exactInput, bool zeroForOne)";
const SNIPE_TAX_APPLIED = "event SnipeTaxApplied(uint256 snipeBps, uint256 secondsElapsed, uint256 amount)";
const FORWARDED = "event Forwarded(address indexed currency, uint256 amount)";
const DISTRIBUTED = "event Distributed(uint256 quoteUsdc6, uint256 tokenAmount18, uint256 carriedQuote6, uint256 carriedToken18)";
const NETTED = "event Netted(bool sellingToken, uint256 amountIn, uint256 amountOut, uint160 sqrtPriceX96, bool capped)";
const PAID = "event Paid(address indexed to, address indexed currency, uint256 amount)";
const DIVIDEND_FUNDED = "event DividendFunded(address indexed asset, uint256 amount)";
const DIVIDEND_UNSYNCED = "event DividendDeliveredUnsynced(address indexed asset, uint256 amount)";
const PRINCIPAL_DELIVERED = "event PrincipalDelivered(uint256 quoteUsdc6, uint256 tokenAmount18, uint128 liquidityAdded)";
const PRINCIPAL_PARKED = "event PrincipalParked(uint256 quoteUsdc6, uint256 tokenAmount18)";

const QUOTE_ASSET_FUNCTION = "address:quoteAsset";

const BPS = 10000n;

const SWAP_TAX = "Swap Tax";
const SNIPE_TAX = "Snipe Tax";
const TAX_TO_TREASURY = "Swap Fees to Treasury";
const FEES_TO_CREATORS = METRIC.CREATOR_FEES;
const FEES_TO_HOLDERS = "Launched Token Holder Dividends";
const FEES_TO_LOCKED_LIQUIDITY = "Fees Compounded Into Locked Liquidity";

type Tally = Record<string, bigint>;
const bump = (t: Tally, asset: string, amount: bigint) => { t[asset] = (t[asset] ?? 0n) + amount };
const lower = (value: any) => String(value).toLowerCase();
const emitter = (log: any) => lower(log.address);
const txEmitter = (log: any) => `${lower(log.transactionHash)}:${emitter(log)}`;

type Launch = { token: string, sellTaxBps: bigint, treasuryBps: bigint }

type Topology = {
  hooks: Map<string, Launch>,
  lockers: Map<string, Launch>,
  splitters: Map<string, Launch>,
  lockerOfToken: Map<string, string>,
}

async function getTopology(options: FetchOptions): Promise<Topology> {
  const partsLogs = await options.getLogs({
    targets: PORTALS,
    eventAbi: PARTS_DEPLOYED,
    fromBlock: FIRST_PORTAL_BLOCK,
    cacheInCloud: true,
  });
  const feeConfiguredLogs = await options.getLogs({
    targets: PORTALS,
    eventAbi: FEE_CONFIGURED,
    fromBlock: FIRST_PORTAL_BLOCK,
    cacheInCloud: true,
  });

  const parts = new Map<string, { locker: string, hook: string, splitter: string }>();
  const config = new Map<string, { sellTaxBps: bigint, treasuryBps: bigint }>();
  for (const log of partsLogs) {
    parts.set(lower(log.token), {
      locker: lower(log.locker),
      hook: lower(log.hook),
      splitter: lower(log.splitter),
    });
  }
  for (const log of feeConfiguredLogs) {
    config.set(lower(log.token), { sellTaxBps: BigInt(log.sellTaxBps), treasuryBps: BigInt(log.treasuryBps) });
  }

  const topology: Topology = { hooks: new Map(), lockers: new Map(), splitters: new Map(), lockerOfToken: new Map() };
  for (const [token, { locker, hook, splitter }] of parts) {
    const c = config.get(token);
    const launch: Launch = { token, sellTaxBps: c?.sellTaxBps ?? 0n, treasuryBps: c?.treasuryBps ?? 0n };
    topology.hooks.set(hook, launch);
    topology.lockers.set(locker, launch);
    topology.splitters.set(splitter, launch);
    topology.lockerOfToken.set(token, locker);
  }
  return topology;
}

// Per-launch hooks/lockers/splitters number in the hundreds of thousands, so a targets list is
// impractical; noTarget + eventAbi is the sanctioned scan (AGENTS.md). Foreign forks emit the same
// events, so each log is kept only when its emitter is in the Portal-announced topology.
const getFeeLogs = (options: FetchOptions, eventAbi: string) => options.getLogs({
  noTarget: true,
  eventAbi,
  onlyArgs: false,
  entireLog: true,
  parseLog: true,
});

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const topology = await getTopology(options);

  const taxTakenLogs = await getFeeLogs(options, TAX_TAKEN);
  const snipeLogs = await getFeeLogs(options, SNIPE_TAX_APPLIED);
  const forwardedLogs = await getFeeLogs(options, FORWARDED);
  const distributedLogs = await getFeeLogs(options, DISTRIBUTED);
  const nettedLogs = await getFeeLogs(options, NETTED);
  const paidLogs = await getFeeLogs(options, PAID);
  const dividendFundedLogs = await getFeeLogs(options, DIVIDEND_FUNDED);
  const dividendUnsyncedLogs = await getFeeLogs(options, DIVIDEND_UNSYNCED);
  const principalDeliveredLogs = await getFeeLogs(options, PRINCIPAL_DELIVERED);
  const principalParkedLogs = await getFeeLogs(options, PRINCIPAL_PARKED);

  const swapTax: Tally = {};
  const selfTax: Tally = {};
  const lpFees: Tally = {};
  const principalResidue: Tally = {};
  const snipeTax: Tally = {};
  const toTreasuryAccrued: Tally = {};
  const pot: Tally = {};
  const toTreasury: Tally = {};
  const toDividends: Tally = {};
  const toLockedLiquidity: Tally = {};

  const taxCurrencyIn = new Map<string, string>();
  for (const log of taxTakenLogs) {
    const hook = topology.hooks.get(emitter(log));
    if (!hook) continue;
    const currency = lower(log.args.currency);
    const key = txEmitter(log);
    if (!taxCurrencyIn.has(key)) taxCurrencyIn.set(key, currency);
    // Tax lands on the unspecified leg: quote on some swaps, launched token on others. The
    // launched-token leg has no price source and is excluded; see the methodology.
    if (currency === hook.token) continue;
    const amount = BigInt(log.args.amount);
    bump(swapTax, currency, amount);
    bump(toTreasuryAccrued, currency, (amount * hook.treasuryBps) / BPS);
  }

  for (const log of snipeLogs) {
    const hook = topology.hooks.get(emitter(log));
    if (!hook) continue;
    const currency = taxCurrencyIn.get(txEmitter(log));
    if (currency && currency !== hook.token) bump(snipeTax, currency, BigInt(log.args.amount));
  }

  const forwardedIn = new Set<string>();
  for (const log of forwardedLogs) {
    const locker = topology.lockers.get(emitter(log));
    if (!locker) continue;
    forwardedIn.add(txEmitter(log));
    const currency = lower(log.args.currency);
    // Forwarded rather than FeesCollected: addLiquidity harvests the position and forwards
    // without emitting FeesCollected, which undercounts the quote leg by about 1.5%.
    if (currency === locker.token) continue;
    const amount = BigInt(log.args.amount);
    bump(lpFees, currency, amount);
    bump(toTreasuryAccrued, currency, (amount * locker.treasuryBps) / BPS);
  }

  const needQuote = new Set<string>();
  for (const log of [...distributedLogs, ...nettedLogs, ...principalDeliveredLogs, ...principalParkedLogs]) {
    const splitter = emitter(log);
    if (topology.splitters.has(splitter)) needQuote.add(splitter);
  }
  const quoteSplitters = [...needQuote];
  const quoteAssets = quoteSplitters.length
    ? await options.api.multiCall({ abi: QUOTE_ASSET_FUNCTION, calls: quoteSplitters })
    : [];
  const quoteOf = new Map<string, string>();
  quoteSplitters.forEach((splitter, i) => quoteOf.set(splitter, lower(quoteAssets[i])));

  for (const log of paidLogs) {
    const splitter = topology.splitters.get(emitter(log));
    if (!splitter) continue;
    // The splitter pushes the treasury cut here; the creator is credited with Accrued and pulls
    // later, so this never double counts a creator payment. Paid shares a topic0 with
    // ArgusV4RewardTracker.Paid, which is dropped because that contract is not a splitter.
    if (lower(log.args.to) !== TREASURY) continue;
    const currency = lower(log.args.currency);
    if (currency !== splitter.token) bump(toTreasury, currency, BigInt(log.args.amount));
  }

  for (const log of [...dividendFundedLogs, ...dividendUnsyncedLogs]) {
    const splitter = topology.splitters.get(emitter(log));
    if (!splitter) continue;
    const asset = lower(log.args.asset);
    if (asset !== splitter.token) bump(toDividends, asset, BigInt(log.args.amount));
  }

  for (const log of distributedLogs) {
    const splitter = topology.splitters.get(emitter(log));
    const quote = quoteOf.get(emitter(log));
    if (!splitter || !quote) continue;
    // What arrived at the splitter and was engaged by this crank, read before the netting swap.
    // Never summed with the payouts: they are the two sides of one crank. carried* re-reports the
    // same money on every crank that carries it and is not read.
    bump(pot, quote, BigInt(log.args.quoteUsdc6));
  }

  for (const log of nettedLogs) {
    const splitter = topology.splitters.get(emitter(log));
    const quote = quoteOf.get(emitter(log));
    if (!splitter || !quote) continue;
    const amountIn = BigInt(log.args.amountIn);
    const amountOut = BigInt(log.args.amountOut);
    if (log.args.sellingToken) {
      bump(pot, quote, amountOut);
      // SELF-TAX: the netting swap routes through the launch's own pool and so pays the launch's
      // own tax, which the hook takes straight back to the splitter. TaxTaken reports it exactly
      // like a user's tax but the protocol paid it to itself, so it comes out.
      const self = (amountOut * splitter.sellTaxBps) / BPS;
      bump(selfTax, quote, self);
      bump(toTreasuryAccrued, quote, -(self * splitter.treasuryBps) / BPS);
    } else {
      bump(pot, quote, -amountIn);
    }
  }

  for (const log of principalDeliveredLogs) {
    const splitter = topology.splitters.get(emitter(log));
    const quote = quoteOf.get(emitter(log));
    if (!splitter || !quote) continue;
    bump(toLockedLiquidity, quote, BigInt(log.args.quoteUsdc6));
  }

  for (const log of principalParkedLogs) {
    const splitter = topology.splitters.get(emitter(log));
    const quote = quoteOf.get(emitter(log));
    if (!splitter || !quote) continue;
    // PrincipalParked means two different things and only a sibling Forwarded tells them apart:
    // the locker took what the price supported and sent the residue back (that residue arrived
    // through Forwarded and has to come out of it), or addLiquidity reverted and the splitter
    // parked the whole offer without anything moving (nothing to subtract).
    const locker = topology.lockerOfToken.get(splitter.token);
    if (!locker || !forwardedIn.has(`${lower(log.transactionHash)}:${locker}`)) continue;
    const residue = BigInt(log.args.quoteUsdc6);
    bump(principalResidue, quote, residue);
    bump(toTreasuryAccrued, quote, -(residue * splitter.treasuryBps) / BPS);
  }

  for (const asset of new Set([...Object.keys(swapTax), ...Object.keys(lpFees), ...Object.keys(snipeTax)])) {
    const userTax = (swapTax[asset] ?? 0n) - (selfTax[asset] ?? 0n);
    const lp = (lpFees[asset] ?? 0n) - (principalResidue[asset] ?? 0n);
    const snipe = snipeTax[asset] ?? 0n;
    const fees = userTax + lp + snipe;
    if (fees <= 0n) continue;

    dailyFees.add(asset, userTax, SWAP_TAX);
    dailyFees.add(asset, lp, METRIC.LP_FEES);
    dailyFees.add(asset, snipe, SNIPE_TAX);

    // treasuryBps of each launch's accrued fee, read per launch from FeeConfigured (1000 on all
    // launches today) rather than a window-measured share of the realised pot, so hourly pulls
    // still sum to the configured 10%. Creator/dividend/liquidity weights are price-dependent, so
    // those labels split the remaining supply side in the proportions the splitters actually paid
    // this window. The creator takes the remainder so fees = revenue + supply-side exactly.
    const treasuryCut = snipe + (toTreasuryAccrued[asset] ?? 0n);
    const supply = fees - treasuryCut;
    const supplyPot = (pot[asset] ?? 0n) - (toTreasury[asset] ?? 0n);
    const dividends = toDividends[asset] ?? 0n;
    const liquidity = toLockedLiquidity[asset] ?? 0n;
    const measurable = supplyPot > 0n && dividends + liquidity <= supplyPot;
    const dividendCut = measurable ? (supply * dividends) / supplyPot : 0n;
    const liquidityCut = measurable ? (supply * liquidity) / supplyPot : 0n;
    const creatorCut = supply - dividendCut - liquidityCut;

    dailyRevenue.add(asset, treasuryCut, TAX_TO_TREASURY);
    dailyProtocolRevenue.add(asset, treasuryCut, TAX_TO_TREASURY);
    dailySupplySideRevenue.add(asset, creatorCut, FEES_TO_CREATORS);
    dailySupplySideRevenue.add(asset, dividendCut, FEES_TO_HOLDERS);
    dailySupplySideRevenue.add(asset, liquidityCut, FEES_TO_LOCKED_LIQUIDITY);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "The tax ArgusPad's per-launch hook charges on every buy and sell, the trading fees the permanently locked launch position earns, and the extra tax charged on buys in a launch's first seconds. Counted in the asset the launch is quoted in, at the moment the fee is charged, so the protocol's later sale of the launched tokens it was paid is not counted a second time. The part of every fee charged in the launched token itself is excluded: those tokens' only market is the pool ArgusPad seeded, and pricing them there overstates by about 40% against what ArgusPad's own sales of them actually realise.",
  Revenue: "The share of fees reaching the ArgusPad treasury, 10% of every launch's fee at the rate each launch fixes at creation, plus the whole of the early-buy snipe tax, which is paid straight to the treasury.",
  ProtocolRevenue: "The share of fees reaching the ArgusPad treasury, 10% of every launch's fee at the rate each launch fixes at creation, plus the whole of the early-buy snipe tax, which is paid straight to the treasury.",
  SupplySideRevenue: "The roughly 90% of fees that leaves the protocol: the token creator's share, the dividends paid to holders of that launched token, and the share added back into the launch's permanently locked liquidity.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_TAX]: "The launch's own buy and sell tax, 1-10% chosen per launch, taken by its hook on each swap and read from that swap's TaxTaken. Net of the tax the splitter pays itself when it sells launched tokens through the launch's own pool, which is not paid by any user. These fees are also inside Uniswap's fee reporting for Arc.",
    [METRIC.LP_FEES]: "The 1% Uniswap v4 pool fee earned by the launch's permanently locked position, read as what the locker forwarded to the splitter, net of the position principal that comes back through the same call. These fees are also inside Uniswap's fee reporting for Arc.",
    [SNIPE_TAX]: "An extra, time-decaying tax on buys in the seconds after a launch opens, charged by the same hook and paid directly to the treasury.",
  },
  Revenue: {
    [TAX_TO_TREASURY]: "treasuryBps of each launch's accrued fee, read from that launch's own FeeConfigured (1000 everywhere today), plus the whole snipe tax, which the hook pays straight to the treasury without passing through a splitter.",
  },
  ProtocolRevenue: {
    [TAX_TO_TREASURY]: "treasuryBps of each launch's accrued fee, read from that launch's own FeeConfigured (1000 everywhere today), plus the whole snipe tax, which the hook pays straight to the treasury without passing through a splitter.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "The token creator's share, credited to the creator to claim. Takes the remainder of the supply side, so fees equal revenue plus supply-side revenue exactly.",
    [FEES_TO_HOLDERS]: "Dividends paid out to holders of the launched token. These are not ARGUS holders, so they are a supply-side cost rather than holders revenue.",
    [FEES_TO_LOCKED_LIQUIDITY]: "The share added straight back into the launch's permanently locked position instead of being paid to anyone.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  methodology,
  breakdownMethodology,
  // Every ArgusPad pool is a plain Uniswap v4 pool on Arc carrying a static 1% fee that
  // dexs/uniswap-v4.ts reads straight off the Swap event, and Arc is in its Configs map. Measured
  // over 24h to block 21516182: ArgusPad pools are 326722 of the 640639 Uniswap v4 swaps on Arc
  // and $208k of its $447k fee figure.
  doublecounted: true,
  // P3's only launch, block 19674581, 2026-09-07 18:46:13 UTC, and the first fee charged on it 33
  // seconds later at block 19674645. The first launch on the retired Uniswap v3 line is older
  // (block 18819901, 2026-09-02) but that line has none of this fee machinery and returns nothing.
  start: "2026-09-07",
};

export default adapter;
