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
//   ArgusV4HookedSplitter   splits the pot between treasury/creator/...  -> Netted, PrincipalParked

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
const PORTAL_SET = new Set(PORTALS);

// launches(token) widened across generations, so each Portal is read with the struct width it
// declares. The shapes are all-static and identically prefixed, so a narrower ABI would decode a
// wider record without reverting and quietly return the wrong field.
const LAUNCH_ABI: Record<string, string> = {
  "0xb021be536808f551b31789422fd28a6c9c6e97da": "function launches(address) view returns (address creator, int24 tickStart, bool tokenIsToken0, address locker, address hook, address splitter, uint16 buyTaxBps, uint16 sellTaxBps, uint256 positionId, int24 tickBond, address quoteAsset)",
  "0xa5628a11c412596e1f63b75a2c0284f843c549d6": "function launches(address) view returns (address creator, int24 tickStart, bool tokenIsToken0, address locker, address hook, address splitter, uint16 buyTaxBps, uint16 sellTaxBps, uint256 positionId, int24 tickBond, address quoteAsset)",
  "0x07a688a001f416cc433c68ff56aa26bc5131cc6e": "function launches(address) view returns (address creator, int24 tickStart, bool tokenIsToken0, address locker, address hook, address splitter, uint16 buyTaxBps, uint16 sellTaxBps, uint256 positionId, int24 tickBond)",
  "0xa36c443a797771df82533b8b4a86f0affd970862": "function launches(address) view returns (address creator, int24 tickStart, bool tokenIsToken0, address locker, address hook, address splitter, uint16 buyTaxBps, uint16 sellTaxBps, uint256 positionId, int24 tickBond)",
  "0x7a17ab0106c46c0be30623f3eb7f299cc0058338": "function launches(address) view returns (address creator, int24 tickStart, bool tokenIsToken0, address locker, address hook, address splitter, uint16 buyTaxBps, uint16 sellTaxBps, uint256 positionId)",
};

const TAX_TAKEN = "event TaxTaken(address indexed currency, uint256 amount, bool exactInput, bool zeroForOne)";
const SNIPE_TAX_APPLIED = "event SnipeTaxApplied(uint256 snipeBps, uint256 secondsElapsed, uint256 amount)";
const FORWARDED = "event Forwarded(address indexed currency, uint256 amount)";
const NETTED = "event Netted(bool sellingToken, uint256 amountIn, uint256 amountOut, uint160 sqrtPriceX96, bool capped)";
const PRINCIPAL_PARKED = "event PrincipalParked(uint256 quoteUsdc6, uint256 tokenAmount18)";
// Distributed, Paid, DividendFunded, DividendDeliveredUnsynced and PrincipalDelivered are not read.
// They report what the splitters paid out during the window, which used to be how the supply side's
// split was inferred; that split is now read per launch from the splitter's own configured weights
// (SPLIT below), so the payouts add nothing. Two traps in them are worth keeping written down,
// because anything that reads them again will hit both:
//   - Paid shares topic0 0x9def4e28 with ArgusV4RewardTracker.Paid, whose topic2 is a DESTINATION
//     where the splitter's is a CURRENCY. Decoding one as the other does not throw; it reports an
//     address as a currency. Bucket on the emitter before decoding.
//   - Distributed is not a parent of the payouts that follow it. It is emitted in the middle of a
//     crank, and its carried* fields re-report the same money on every crank that carries it.

// Getters on the per-launch contracts. The splitter is an EIP-1167 clone; these live on its
// implementation and are reached through the clone.
const PORTAL_OF = "address:portal";
const TOKEN_OF = "address:token";
const QUOTE_ASSET_OF = "address:quoteAsset";
const TREASURY_BPS = "uint256:treasuryBps";
const CREATOR_BPS = "uint256:creatorBps";
const BURN_BPS = "uint256:burnBps";
const DIVIDEND_BPS = "uint256:dividendBps";
const LIQUIDITY_BPS = "uint256:liquidityBps";

const BPS = 10000n;

const SWAP_TAX = "Swap Tax";
const SNIPE_TAX = "Snipe Tax";
const TAX_TO_TREASURY = "Swap Fees to Treasury";
const FEES_TO_CREATORS = METRIC.CREATOR_FEES;
const FEES_TO_HOLDERS = "Launched Token Holder Dividends";
const FEES_TO_LOCKED_LIQUIDITY = "Fees Compounded Into Locked Liquidity";
const FEES_TO_LAUNCHED_TOKEN_BURN = "Launched Token Buy and Burn";

type Tally = Record<string, bigint>;
const bump = (t: Tally, asset: string, amount: bigint) => { t[asset] = (t[asset] ?? 0n) + amount };
const lower = (value: any) => String(value).toLowerCase();
const emitter = (log: any) => lower(log.address);
const txEmitter = (log: any) => `${lower(log.transactionHash)}:${emitter(log)}`;
const ZERO = "0x0000000000000000000000000000000000000000";

type Launch = {
  token: string,
  quote: string,
  locker: string,
  sellTaxBps: bigint,
  treasuryBps: bigint,
  // the supply side's own split; these four are bps of what is left after treasuryBps and sum to
  // 10000 on every launch measured
  creatorBps: bigint,
  burnBps: bigint,
  dividendBps: bigint,
  liquidityBps: bigint,
}

type Topology = {
  hooks: Map<string, Launch>,
  lockers: Map<string, Launch>,
  splitters: Map<string, Launch>,
}

// Only the launches that emitted a fee in this window. Their contracts name themselves; the Portal's
// launches(token) is what confirms the hook, locker and splitter.
async function getTopology(options: FetchOptions, emitters: string[]): Promise<Topology> {
  const topology: Topology = { hooks: new Map(), lockers: new Map(), splitters: new Map() };
  if (!emitters.length) return topology;

  // Ten foreign launchpads on Arc run forks of this codebase under four other treasuries and emit
  // byte-identical events, so an emitter is only ArgusPad's if an ArgusPad Portal says so. Its own
  // portal() is taken as a claim and checked against that Portal's registry below; a fork that
  // names one of these Portals is caught there, because the Portal will not have the launch.
  const claimedPortal = await options.api.multiCall({ abi: PORTAL_OF, calls: emitters, permitFailure: true });
  const candidates = emitters.filter((_, i) => claimedPortal[i] && PORTAL_SET.has(lower(claimedPortal[i])));
  if (!candidates.length) return topology;

  const claimedToken = await options.api.multiCall({ abi: TOKEN_OF, calls: candidates, permitFailure: true });
  const portalOf = new Map<string, string>();
  const tokenOf = new Map<string, string>();
  emitters.forEach((e, i) => { if (claimedPortal[i]) portalOf.set(e, lower(claimedPortal[i])); });
  candidates.forEach((e, i) => { if (claimedToken[i]) tokenOf.set(e, lower(claimedToken[i])); });

  // One registry read per (Portal, token) pair actually seen. This is the authenticating step: the
  // Portal's own launches(token) names the locker, hook and splitter, and an emitter is only
  // accepted in the role the Portal puts it in.
  const pairs = [...new Set(candidates
    .filter(e => tokenOf.has(e))
    .map(e => `${portalOf.get(e)}:${tokenOf.get(e)}`))]
    .map(k => { const [portal, token] = k.split(":"); return { portal, token } });

  const byPortal = new Map<string, string[]>();
  for (const { portal, token } of pairs) {
    if (!byPortal.has(portal)) byPortal.set(portal, []);
    byPortal.get(portal)!.push(token);
  }

  type Registered = { token: string, locker: string, hook: string, splitter: string, sellTaxBps: bigint };
  const registered = new Map<string, Registered>();
  for (const [portal, tokens] of byPortal) {
    const records = await options.api.multiCall({
      abi: LAUNCH_ABI[portal],
      target: portal,
      calls: tokens,
      permitFailure: true,
    });
    records.forEach((record: any, i: number) => {
      if (!record || lower(record.locker) === ZERO) return;
      registered.set(tokens[i], {
        token: tokens[i],
        locker: lower(record.locker),
        hook: lower(record.hook),
        splitter: lower(record.splitter),
        sellTaxBps: BigInt(record.sellTaxBps),
      });
    });
  }
  if (!registered.size) return topology;

  // The configured allocation, read from each launch's own splitter. treasuryBps is the protocol's
  // cut of every fee; creator/burn/dividend/liquidity are that launch's split of what is left.
  const splitters = [...new Set([...registered.values()].map(r => r.splitter))];
  const [quote, treasuryBps, creatorBps, burnBps, dividendBps, liquidityBps] = await Promise.all(
    [QUOTE_ASSET_OF, TREASURY_BPS, CREATOR_BPS, BURN_BPS, DIVIDEND_BPS, LIQUIDITY_BPS]
      .map(abi => options.api.multiCall({ abi, calls: splitters, permitFailure: true })));

  const configOf = new Map<string, any>();
  splitters.forEach((splitter, i) => {
    if (quote[i] == null || treasuryBps[i] == null) return;
    configOf.set(splitter, {
      quote: lower(quote[i]),
      treasuryBps: BigInt(treasuryBps[i]),
      creatorBps: BigInt(creatorBps[i] ?? 0),
      burnBps: BigInt(burnBps[i] ?? 0),
      dividendBps: BigInt(dividendBps[i] ?? 0),
      liquidityBps: BigInt(liquidityBps[i] ?? 0),
    });
  });

  for (const r of registered.values()) {
    const config = configOf.get(r.splitter);
    if (!config) continue;
    const launch: Launch = { token: r.token, locker: r.locker, sellTaxBps: r.sellTaxBps, ...config };
    topology.hooks.set(r.hook, launch);
    topology.lockers.set(r.locker, launch);
    topology.splitters.set(r.splitter, launch);
  }
  return topology;
}

// One hook, locker and splitter per launch, far too many to pass as targets. noTarget plus the
// event, then keep a log only when its emitter is in the Portal registry.
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

  const taxTakenLogs = await getFeeLogs(options, TAX_TAKEN);
  const snipeLogs = await getFeeLogs(options, SNIPE_TAX_APPLIED);
  const forwardedLogs = await getFeeLogs(options, FORWARDED);
  const nettedLogs = await getFeeLogs(options, NETTED);
  const principalParkedLogs = await getFeeLogs(options, PRINCIPAL_PARKED);

  const emitters = [...new Set([...taxTakenLogs, ...snipeLogs, ...forwardedLogs, ...nettedLogs, ...principalParkedLogs].map(emitter))];
  const topology = await getTopology(options, emitters);

  const swapTax: Tally = {};
  const selfTax: Tally = {};
  const lpFees: Tally = {};
  const principalResidue: Tally = {};
  const snipeTax: Tally = {};
  const toTreasuryAccrued: Tally = {};
  // The supply side's own split, accrued per launch at that launch's configured weights as each fee
  // is counted (SPLIT). Not inferred from what the splitters happened to pay out this window: a
  // window with delayed or absent payouts would otherwise hand the whole supply side to the creator
  // label, which is wrong outright on the launches that configure creatorBps = 0.
  const toBurnAccrued: Tally = {};
  const toDividendsAccrued: Tally = {};
  const toLiquidityAccrued: Tally = {};

  // Fees charged in the launched token itself, keyed by that token rather than by a quote asset.
  // They are split exactly like the quote side - the splitter holds and divides both - so they get
  // their own copies of the same tallies rather than being mixed into the quote-asset ones. The swap
  // tax and the locked position's LP fee are kept apart so each is booked under its own label, the
  // same way the quote side books them.
  const launchedTokenTax: Tally = {};
  const launchedTokenLpFees: Tally = {};
  const launchedToTreasury: Tally = {};
  const launchedToBurn: Tally = {};
  const launchedToDividends: Tally = {};
  const launchedToLiquidity: Tally = {};

  const accrueInto = (treasuryT: Tally, burnT: Tally, dividendT: Tally, liquidityT: Tally) =>
    (launch: Launch, asset: string, amount: bigint) => {
      const treasury = (amount * launch.treasuryBps) / BPS;
      const supply = amount - treasury;
      bump(treasuryT, asset, treasury);
      bump(burnT, asset, (supply * launch.burnBps) / BPS);
      bump(dividendT, asset, (supply * launch.dividendBps) / BPS);
      bump(liquidityT, asset, (supply * launch.liquidityBps) / BPS);
    };
  const accrue = accrueInto(toTreasuryAccrued, toBurnAccrued, toDividendsAccrued, toLiquidityAccrued);
  const accrueLaunched = accrueInto(launchedToTreasury, launchedToBurn, launchedToDividends, launchedToLiquidity);

  const taxCurrencyIn = new Map<string, string>();
  for (const log of taxTakenLogs) {
    const hook = topology.hooks.get(emitter(log));
    if (!hook) continue;
    const currency = lower(log.args.currency);
    const key = txEmitter(log);
    if (!taxCurrencyIn.has(key)) taxCurrencyIn.set(key, currency);
    const amount = BigInt(log.args.amount);
    // Tax lands on the unspecified leg: quote on some swaps, launched token on others. The
    // launched-token leg is kept apart, in its own units - see the methodology.
    if (currency === hook.token) { bump(launchedTokenTax, currency, amount); accrueLaunched(hook, currency, amount); continue; }
    bump(swapTax, currency, amount);
    accrue(hook, currency, amount);
  }

  for (const log of snipeLogs) {
    const hook = topology.hooks.get(emitter(log));
    if (!hook) continue;
    // SnipeTaxApplied carries no currency. It is charged on the same leg as the swap's own tax, so
    // the currency comes from the TaxTaken the same hook emitted in the same transaction.
    const currency = taxCurrencyIn.get(txEmitter(log));
    if (currency && currency !== hook.token) bump(snipeTax, currency, BigInt(log.args.amount));
  }

  const forwardedIn = new Set<string>();
  for (const log of forwardedLogs) {
    const locker = topology.lockers.get(emitter(log));
    if (!locker) continue;
    forwardedIn.add(txEmitter(log));
    const currency = lower(log.args.currency);
    const amount = BigInt(log.args.amount);
    // Forwarded rather than FeesCollected: addLiquidity harvests the position and forwards
    // without emitting FeesCollected, which undercounts the quote leg by about 1.5%.
    if (currency === locker.token) { bump(launchedTokenLpFees, currency, amount); accrueLaunched(locker, currency, amount); continue; }
    bump(lpFees, currency, amount);
    accrue(locker, currency, amount);
  }

  for (const log of nettedLogs) {
    const splitter = topology.splitters.get(emitter(log));
    if (!splitter || !log.args.sellingToken) continue;
    // SELF-TAX: the netting swap routes through the launch's own pool and so pays the launch's own
    // tax, which the hook takes straight back to the splitter. TaxTaken reports it exactly like a
    // user's tax but the protocol paid it to itself, so it comes out - of the fee and of the split
    // accrued on it.
    const self = (BigInt(log.args.amountOut) * splitter.sellTaxBps) / BPS;
    bump(selfTax, splitter.quote, self);
    accrue(splitter, splitter.quote, -self);
  }

  for (const log of principalParkedLogs) {
    const splitter = topology.splitters.get(emitter(log));
    if (!splitter) continue;
    // PrincipalParked means two different things and only a sibling Forwarded tells them apart:
    // the locker took what the price supported and sent the residue back (that residue arrived
    // through Forwarded and has to come out of it), or addLiquidity reverted and the splitter
    // parked the whole offer without anything moving (nothing to subtract).
    if (!forwardedIn.has(`${lower(log.transactionHash)}:${splitter.locker}`)) continue;
    // quoteUsdc6 is in the quote's OWN decimals despite the name - 6 for USDC and EURC, 8 for
    // cirBTC, 18 for the rest - so it is only ever used against that launch's own quote asset.
    const residue = BigInt(log.args.quoteUsdc6);
    bump(principalResidue, splitter.quote, residue);
    accrue(splitter, splitter.quote, -residue);
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

    // SPLIT. Every weight is read per launch from that launch's own splitter, which is configured
    // once at creation and never amended, and is accrued as each fee is counted - so an hourly pull
    // and a daily pull of the same blocks give the same answer, and a launch that ever ships
    // different weights is handled without a code change. treasuryBps is 1000 on every launch
    // measured; creatorBps + burnBps + dividendBps + liquidityBps is 10000 on every launch
    // measured, being the split of what is left. The creator takes the remainder rather than its
    // own floor-divided share, so fees = revenue + supply-side revenue exactly.
    const treasuryCut = snipe + (toTreasuryAccrued[asset] ?? 0n);
    const supply = fees - treasuryCut;
    const burnCut = toBurnAccrued[asset] ?? 0n;
    const dividendCut = toDividendsAccrued[asset] ?? 0n;
    const liquidityCut = toLiquidityAccrued[asset] ?? 0n;
    const creatorCut = supply - burnCut - dividendCut - liquidityCut;

    dailyRevenue.add(asset, treasuryCut, TAX_TO_TREASURY);
    dailyProtocolRevenue.add(asset, treasuryCut, TAX_TO_TREASURY);
    dailySupplySideRevenue.add(asset, creatorCut, FEES_TO_CREATORS);
    dailySupplySideRevenue.add(asset, dividendCut, FEES_TO_HOLDERS);
    dailySupplySideRevenue.add(asset, liquidityCut, FEES_TO_LOCKED_LIQUIDITY);
    dailySupplySideRevenue.add(asset, burnCut, FEES_TO_LAUNCHED_TOKEN_BURN);
  }

  // The part of every fee charged in the launched token itself. It is added in that token's own raw
  // units, so DefiLlama's price feed decides what it is worth rather than this adapter deciding,
  // and it is split at the same configured weights as the quote side so that fees still equal
  // revenue plus supply-side revenue whatever price is found. Measured 2026-09-20: DefiLlama prices
  // none of these tokens (0 of 5 sampled, against 2 of 2 for the quote assets). Re-measured
  // 2026-09-23 against the 40 launched tokens with the most fees: one (TEN) has a price, first seen
  // that day, so these lines are now almost - not exactly - nothing. See the methodology for what to
  // check as that grows.
  for (const token of new Set([...Object.keys(launchedTokenTax), ...Object.keys(launchedTokenLpFees)])) {
    const tax = launchedTokenTax[token] ?? 0n;
    const lp = launchedTokenLpFees[token] ?? 0n;
    const fees = tax + lp;
    if (fees <= 0n) continue;
    const treasuryCut = launchedToTreasury[token] ?? 0n;
    const supply = fees - treasuryCut;
    const burnCut = launchedToBurn[token] ?? 0n;
    const dividendCut = launchedToDividends[token] ?? 0n;
    const liquidityCut = launchedToLiquidity[token] ?? 0n;
    const creatorCut = supply - burnCut - dividendCut - liquidityCut;

    dailyFees.add(token, tax, SWAP_TAX);
    dailyFees.add(token, lp, METRIC.LP_FEES);
    dailyRevenue.add(token, treasuryCut, TAX_TO_TREASURY);
    dailyProtocolRevenue.add(token, treasuryCut, TAX_TO_TREASURY);
    dailySupplySideRevenue.add(token, creatorCut, FEES_TO_CREATORS);
    dailySupplySideRevenue.add(token, dividendCut, FEES_TO_HOLDERS);
    dailySupplySideRevenue.add(token, liquidityCut, FEES_TO_LOCKED_LIQUIDITY);
    dailySupplySideRevenue.add(token, burnCut, FEES_TO_LAUNCHED_TOKEN_BURN);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "The tax ArgusPad's per-launch hook charges on every buy and sell, the trading fees the permanently locked launch position earns, and the extra tax charged on buys in a launch's first seconds. Counted in the asset the fee is charged in, at the moment it is charged, so the protocol's later sale of the launched tokens it was paid is not counted a second time. Fees charged in the launched token itself are reported in that token's own units and are priced only if DefiLlama has a price for it; it has none for these tokens today, because a launched token's only market is the pool ArgusPad seeded, and pricing it there overstates by about 40% against what ArgusPad's own sales of them actually realise.",
  Revenue: "The share of fees reaching the ArgusPad treasury, 10% of every launch's fee at the rate each launch fixes at creation, plus the whole of the early-buy snipe tax, which is paid straight to the treasury.",
  ProtocolRevenue: "The share of fees reaching the ArgusPad treasury, 10% of every launch's fee at the rate each launch fixes at creation, plus the whole of the early-buy snipe tax, which is paid straight to the treasury.",
  SupplySideRevenue: "The roughly 90% of fees that leaves the protocol, divided at the weights each launch fixed at creation: the token creator's share, the dividends paid to holders of that launched token, the share added back into the launch's permanently locked liquidity, and the share used to buy and burn the launched token.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_TAX]: "The launch's own buy and sell tax, 1-10% chosen per launch, taken by its hook on each swap and read from that swap's TaxTaken. Net of the tax the splitter pays itself when it sells launched tokens through the launch's own pool, which is not paid by any user. These fees are also inside Uniswap's fee reporting for Arc.",
    [METRIC.LP_FEES]: "The 1% Uniswap v4 pool fee earned by the launch's permanently locked position, read as what the locker forwarded to the splitter, net of the position principal that comes back through the same call. These fees are also inside Uniswap's fee reporting for Arc.",
    [SNIPE_TAX]: "An extra, time-decaying tax on buys in the seconds after a launch opens, charged by the same hook and paid directly to the treasury.",
  },
  Revenue: {
    [TAX_TO_TREASURY]: "treasuryBps of each launch's accrued fee, read from that launch's own splitter (1000 everywhere today), plus the whole snipe tax, which the hook pays straight to the treasury without passing through a splitter.",
  },
  ProtocolRevenue: {
    [TAX_TO_TREASURY]: "treasuryBps of each launch's accrued fee, read from that launch's own splitter (1000 everywhere today), plus the whole snipe tax, which the hook pays straight to the treasury without passing through a splitter.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "The token creator's share, at that launch's configured creatorBps, credited to the creator to claim. Takes the remainder of the supply side, so fees equal revenue plus supply-side revenue exactly.",
    [FEES_TO_HOLDERS]: "Dividends paid out to holders of the launched token, at that launch's configured dividendBps. These are not ARGUS holders, so they are a supply-side cost rather than holders revenue.",
    [FEES_TO_LOCKED_LIQUIDITY]: "The share added straight back into the launch's permanently locked position instead of being paid to anyone, at that launch's configured liquidityBps.",
    [FEES_TO_LAUNCHED_TOKEN_BURN]: "The share used to buy and burn the launched token, at that launch's configured burnBps. It buys the launched token, not ARGUS, so it is a cost carried by that launch's supply side rather than a protocol buyback or a payment to holders.",
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
