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
// Portal 8 is a different generation with none of those events - see PORTAL_8 below.

// Every Portal ArgusPad has launched a Uniswap v4 tax token from, in generation order P3..P7.
// Enumerated from the deployer's complete CREATE history rather than from logs, so this is the
// whole set; two further hooked Portals exist and have never carried a launch, and the retired
// Uniswap v3 line (three Portals, 59 launches between them) predates this fee machinery and emits
// none of these events. Portal 8 is the one Portal after P7 in that history (below).
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

// Portal 8 (ArgusV5Portal), live since block 22251798 and where every new launch goes. It shares
// nothing with P3..P7 but the PoolManager: launches(token) is a different 7-field record, and its
// per-launch contracts emit none of the events below. The fee is ONE event, taken entirely in the
// launch's quote asset - the pool is a dynamic-fee pool overridden to zero on every swap, so there
// is no LP fee and no fee in the launched token, and the 1% the pool used to keep is charged by
// the hook instead:
//   ArgusV5TaxHook          buy/sell tax + 1% base, and the opening surcharge -> QuoteFeeTaken
//   ArgusV5RewardedToken    accrues the holders' share on the token itself     -> QuoteAccrued
//   ArgusV5PayoutEscrow     receives the rest and splits it                    (payouts not read)
// Portal 8's treasury is a different address from P3..P7's (a Safe); nothing here reads either.
// Identity rests on the registry: an emitter counts only if Portal 8's own launches(token) names
// it as that launch's hook. Portal 8 was created by the same deployer EOA, at nonce 747, as every
// earlier Portal.
const PORTAL_8 = "0xeed7559b8a6abf64427dc41cb5cc6400109c5d93";
const PORTAL_8_LAUNCH_ABI = "function launches(address token) view returns (address hook, address escrow, address locker, uint256 positionId, int24 tickStart, int24 tickBond, bool tokenIsToken0)";
const QUOTE_FEE_TAKEN = "event QuoteFeeTaken(uint256 bucketFee, uint256 surcharge, bool exactInput, bool isBuy)";
const QUOTE_ACCRUED = "event QuoteAccrued(uint256 quoteAmount, uint256 reclassifiedRaw)";
// The 1% base the hook adds to each leg's tax (ArgusV5TaxHook.BASE_FEE_BPS, a constant).
const PORTAL_8_BASE_FEE_BPS = 100n;

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
// Portal 8 only: the escrow's fifth bucket, and the hook's own getters.
const LOCK_BPS = "uint256:lockBps";
const BUY_TAX_BPS = "uint256:buyTaxBps";
const SELL_TAX_BPS = "uint256:sellTaxBps";

const BPS = 10000n;

const SWAP_TAX = "Swap Tax";
const BASE_SWAP_FEE = METRIC.SWAP_FEES;
const SNIPE_TAX = "Snipe Tax";
const TAX_TO_TREASURY = "Swap Fees to Treasury";
const FEES_TO_CREATORS = METRIC.CREATOR_FEES;
const FEES_TO_HOLDERS = "Launched Token Holder Dividends";
const FEES_TO_LOCKED_LIQUIDITY = "Fees Compounded Into Locked Liquidity";
const FEES_TO_LAUNCHED_TOKEN_BURN = "Launched Token Buy and Burn";
const FEES_TO_LAUNCHED_TOKEN_LOCK = "Launched Token Buy and Lock";

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

type Portal8Launch = {
  token: string,
  quote: string,
  buyTaxBps: bigint,
  sellTaxBps: bigint,
  treasuryBps: bigint,
  // bps of what is left after treasuryBps; sum to 10000 on every launch measured
  creatorBps: bigint,
  burnBps: bigint,
  dividendBps: bigint,
  liquidityBps: bigint,
  lockBps: bigint,
}

// Portal 8's hooks that emitted a fee in this window, keyed by hook, plus the same launches keyed by
// launched token (QuoteAccrued is emitted by the token). The same authentication as P3..P7: the
// hook's portal() and token() are claims, and the hook counts only if Portal 8's launches(token)
// names that exact address as the launch's hook.
async function getPortal8Topology(options: FetchOptions, emitters: string[]) {
  const hooks = new Map<string, Portal8Launch>();
  const tokens = new Map<string, Portal8Launch>();
  if (!emitters.length) return { hooks, tokens };

  const claimedPortal = await options.api.multiCall({ abi: PORTAL_OF, calls: emitters, permitFailure: true });
  const candidates = emitters.filter((_, i) => claimedPortal[i] && lower(claimedPortal[i]) === PORTAL_8);
  if (!candidates.length) return { hooks, tokens };

  const claimedToken = await options.api.multiCall({ abi: TOKEN_OF, calls: candidates, permitFailure: true });
  const claimed = candidates.map((hook, i) => ({ hook, token: claimedToken[i] ? lower(claimedToken[i]) : null }))
    .filter((c): c is { hook: string, token: string } => c.token !== null);
  if (!claimed.length) return { hooks, tokens };

  const records = await options.api.multiCall({ abi: PORTAL_8_LAUNCH_ABI, target: PORTAL_8, calls: claimed.map(c => c.token), permitFailure: true });
  const registered = claimed
    .map((c, i) => ({ ...c, escrow: records[i] ? lower(records[i].escrow) : ZERO }))
    .filter((c, i) => records[i] && lower(records[i].hook) === c.hook && c.escrow !== ZERO);
  if (!registered.length) return { hooks, tokens };

  const hookList = registered.map(r => r.hook);
  const escrowList = registered.map(r => r.escrow);
  const [quote, buyTaxBps, sellTaxBps] = await Promise.all(
    [QUOTE_ASSET_OF, BUY_TAX_BPS, SELL_TAX_BPS].map(abi => options.api.multiCall({ abi, calls: hookList, permitFailure: true })));
  const [treasuryBps, creatorBps, burnBps, dividendBps, liquidityBps, lockBps] = await Promise.all(
    [TREASURY_BPS, CREATOR_BPS, BURN_BPS, DIVIDEND_BPS, LIQUIDITY_BPS, LOCK_BPS].map(abi => options.api.multiCall({ abi, calls: escrowList, permitFailure: true })));

  registered.forEach((r, i) => {
    if (quote[i] == null || buyTaxBps[i] == null || sellTaxBps[i] == null || treasuryBps[i] == null) return;
    const launch: Portal8Launch = {
      token: r.token,
      quote: lower(quote[i]),
      buyTaxBps: BigInt(buyTaxBps[i]),
      sellTaxBps: BigInt(sellTaxBps[i]),
      treasuryBps: BigInt(treasuryBps[i]),
      creatorBps: BigInt(creatorBps[i] ?? 0),
      burnBps: BigInt(burnBps[i] ?? 0),
      dividendBps: BigInt(dividendBps[i] ?? 0),
      liquidityBps: BigInt(liquidityBps[i] ?? 0),
      lockBps: BigInt(lockBps[i] ?? 0),
    };
    hooks.set(r.hook, launch);
    tokens.set(r.token, launch);
  });
  return { hooks, tokens };
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
  // Portal 8 only: its 1% base fee and its fifth, buy-and-lock, bucket.
  const baseSwapFees: Tally = {};
  const toLockAccrued: Tally = {};

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

  // PORTAL 8. Every fee is in the launch's quote asset, so there is no launched-token leg, no
  // self-tax (the executors that trade the pool on the launch's behalf are exempt by sender) and no
  // principal to net out. What a swap pays is bucketFee plus surcharge:
  //   bucketFee  = the leg's tax plus the 1% base, charged together. The holders' share of it is
  //                accrued on the token (QuoteAccrued) and whatever no eligible holder could take
  //                (reclassifiedRaw, quote units) goes straight to the treasury; the escrow receives
  //                bucketFee - reclassified and gives treasuryBps of that to the treasury, the rest
  //                to its five buckets.
  //   surcharge  = the opening anti-snipe surcharge, paid straight to the treasury.
  // Measured to block 22391750: sum(bucketFee) equals each escrow's totalReceived() and the quote
  // it received from the PoolManager, to the raw unit, on all 8 launches; surcharge and
  // reclassifiedRaw were 0 on every event.
  const [quoteFeeLogs, quoteAccruedLogs] = await Promise.all([getFeeLogs(options, QUOTE_FEE_TAKEN), getFeeLogs(options, QUOTE_ACCRUED)]);
  const portal8 = await getPortal8Topology(options, [...new Set(quoteFeeLogs.map(emitter))]);
  type Portal8Tally = { launch: Portal8Launch, bucketFee: bigint, surcharge: bigint, reclassified: bigint };
  const portal8Fees = new Map<string, Portal8Tally>();
  for (const log of quoteFeeLogs) {
    const launch = portal8.hooks.get(emitter(log));
    if (!launch) continue;
    const bucketFee = BigInt(log.args.bucketFee);
    const surcharge = BigInt(log.args.surcharge);
    const t = portal8Fees.get(launch.token) ?? { launch, bucketFee: 0n, surcharge: 0n, reclassified: 0n };
    t.bucketFee += bucketFee;
    t.surcharge += surcharge;
    portal8Fees.set(launch.token, t);
    // bucketFee prices the leg's tax and the 1% base as one rate (tax + 100 bps); the base is its
    // proportional part and the tax takes the rounding.
    const legBps = log.args.isBuy ? launch.buyTaxBps : launch.sellTaxBps;
    const base = (bucketFee * PORTAL_8_BASE_FEE_BPS) / (legBps + PORTAL_8_BASE_FEE_BPS);
    bump(swapTax, launch.quote, bucketFee - base);
    bump(baseSwapFees, launch.quote, base);
    bump(snipeTax, launch.quote, surcharge);
  }
  for (const log of quoteAccruedLogs) {
    const t = portal8Fees.get(emitter(log));
    if (t) t.reclassified += BigInt(log.args.reclassifiedRaw);
  }
  for (const { launch, bucketFee, reclassified } of portal8Fees.values()) {
    const toEscrow = bucketFee - reclassified;
    const treasury = (toEscrow * launch.treasuryBps) / BPS;
    const supply = toEscrow - treasury;
    bump(toTreasuryAccrued, launch.quote, treasury + reclassified);
    bump(toBurnAccrued, launch.quote, (supply * launch.burnBps) / BPS);
    bump(toDividendsAccrued, launch.quote, (supply * launch.dividendBps) / BPS);
    bump(toLiquidityAccrued, launch.quote, (supply * launch.liquidityBps) / BPS);
    bump(toLockAccrued, launch.quote, (supply * launch.lockBps) / BPS);
  }

  for (const asset of new Set([...Object.keys(swapTax), ...Object.keys(lpFees), ...Object.keys(snipeTax), ...Object.keys(baseSwapFees)])) {
    const userTax = (swapTax[asset] ?? 0n) - (selfTax[asset] ?? 0n);
    const lp = (lpFees[asset] ?? 0n) - (principalResidue[asset] ?? 0n);
    const base = baseSwapFees[asset] ?? 0n;
    const snipe = snipeTax[asset] ?? 0n;
    const fees = userTax + lp + base + snipe;
    if (fees <= 0n) continue;

    dailyFees.add(asset, userTax, SWAP_TAX);
    dailyFees.add(asset, lp, METRIC.LP_FEES);
    dailyFees.add(asset, base, BASE_SWAP_FEE);
    dailyFees.add(asset, snipe, SNIPE_TAX);

    // SPLIT. Every weight is read per launch from that launch's own splitter, which is configured
    // once at creation and never amended, and is accrued as each fee is counted - so an hourly pull
    // and a daily pull of the same blocks give the same answer, and a launch that ever ships
    // different weights is handled without a code change. treasuryBps is 1000 on every P3..P7
    // launch measured and 3000 on every Portal 8 launch; the remaining weights (four on P3..P7,
    // five on Portal 8 with the lock bucket) sum to 10000 on every launch measured, being the split
    // of what is left. The creator takes the remainder rather than its own floor-divided share, so
    // fees = revenue + supply-side revenue exactly.
    const treasuryCut = snipe + (toTreasuryAccrued[asset] ?? 0n);
    const supply = fees - treasuryCut;
    const burnCut = toBurnAccrued[asset] ?? 0n;
    const dividendCut = toDividendsAccrued[asset] ?? 0n;
    const liquidityCut = toLiquidityAccrued[asset] ?? 0n;
    const lockCut = toLockAccrued[asset] ?? 0n;
    const creatorCut = supply - burnCut - dividendCut - liquidityCut - lockCut;

    dailyRevenue.add(asset, treasuryCut, TAX_TO_TREASURY);
    dailyProtocolRevenue.add(asset, treasuryCut, TAX_TO_TREASURY);
    dailySupplySideRevenue.add(asset, creatorCut, FEES_TO_CREATORS);
    dailySupplySideRevenue.add(asset, dividendCut, FEES_TO_HOLDERS);
    dailySupplySideRevenue.add(asset, liquidityCut, FEES_TO_LOCKED_LIQUIDITY);
    dailySupplySideRevenue.add(asset, burnCut, FEES_TO_LAUNCHED_TOKEN_BURN);
    dailySupplySideRevenue.add(asset, lockCut, FEES_TO_LAUNCHED_TOKEN_LOCK);
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
  Fees: "The tax ArgusPad's per-launch hook charges on every buy and sell, the trading fee each launch's pool charges (on Portals 3-7 the 1% pool fee earned by the permanently locked launch position; on Portal 8 a 1% base fee the hook charges in the quote asset in its place), and the extra tax charged on buys in a launch's first seconds. Counted in the asset the fee is charged in, at the moment it is charged, so the protocol's later sale of the launched tokens it was paid is not counted a second time. Fees charged in the launched token itself (Portals 3-7 only; Portal 8 takes every fee in the quote asset) are reported in that token's own units and are priced only if DefiLlama has a price for it; it has none for these tokens today, because a launched token's only market is the pool ArgusPad seeded, and pricing it there overstates by about 40% against what ArgusPad's own sales of them actually realise.",
  Revenue: "The share of fees reaching the ArgusPad treasury at the rate each launch fixes at creation - 10% of every fee on Portals 3-7 and 30% on Portal 8 - plus the whole of the early-buy snipe tax, which is paid straight to the treasury.",
  ProtocolRevenue: "The share of fees reaching the ArgusPad treasury at the rate each launch fixes at creation - 10% of every fee on Portals 3-7 and 30% on Portal 8 - plus the whole of the early-buy snipe tax, which is paid straight to the treasury.",
  SupplySideRevenue: "The rest of the fees, which leave the protocol divided at the weights each launch fixed at creation: the token creator's share, the dividends paid to holders of that launched token, the share added back into the launch's permanently locked liquidity, the share used to buy and burn the launched token, and on Portal 8 the share used to buy the launched token and lock it permanently.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_TAX]: "The launch's own buy and sell tax, chosen per launch (1-10%), taken by its hook on each swap: on Portals 3-7 read from that swap's TaxTaken, net of the tax the splitter pays itself when it sells launched tokens through the launch's own pool, which is not paid by any user; on Portal 8 the tax part of QuoteFeeTaken's bucketFee. The hook charges it outside the pool fee, so it is not inside Uniswap's fee reporting for Arc.",
    [METRIC.LP_FEES]: "Portals 3-7: the 1% Uniswap v4 pool fee earned by the launch's permanently locked position, read as what the locker forwarded to the splitter, net of the position principal that comes back through the same call. These fees are also inside Uniswap's fee reporting for Arc.",
    [BASE_SWAP_FEE]: "Portal 8: the 1% base fee the hook adds to every buy and sell and takes in the quote asset. Portal 8 pools are dynamic-fee pools whose pool fee is set to zero on every swap, so this replaces the LP fee and goes to the same split; it is not inside Uniswap's fee reporting for Arc. It is the base's proportional part of QuoteFeeTaken's bucketFee, which prices tax and base as one rate.",
    [SNIPE_TAX]: "An extra, time-decaying tax on buys in the seconds after a launch opens, charged by the same hook and paid directly to the treasury (Portal 8: QuoteFeeTaken's surcharge).",
  },
  Revenue: {
    [TAX_TO_TREASURY]: "treasuryBps of each launch's accrued fee, read from that launch's own splitter or escrow (1000 on every Portal 3-7 launch, 3000 on every Portal 8 launch), plus the whole snipe tax, which the hook pays straight to the treasury without passing through a splitter, plus on Portal 8 any holders' share accrued while no holder was eligible, which the hook also pays straight to the treasury.",
  },
  ProtocolRevenue: {
    [TAX_TO_TREASURY]: "treasuryBps of each launch's accrued fee, read from that launch's own splitter or escrow (1000 on every Portal 3-7 launch, 3000 on every Portal 8 launch), plus the whole snipe tax, which the hook pays straight to the treasury without passing through a splitter, plus on Portal 8 any holders' share accrued while no holder was eligible, which the hook also pays straight to the treasury.",
  },
  SupplySideRevenue: {
    [FEES_TO_CREATORS]: "The token creator's share, at that launch's configured creatorBps, credited to the creator to claim. Takes the remainder of the supply side, so fees equal revenue plus supply-side revenue exactly.",
    [FEES_TO_HOLDERS]: "Dividends paid out to holders of the launched token, at that launch's configured dividendBps. These are not ARGUS holders, so they are a supply-side cost rather than holders revenue.",
    [FEES_TO_LOCKED_LIQUIDITY]: "The share added straight back into the launch's permanently locked position instead of being paid to anyone, at that launch's configured liquidityBps.",
    [FEES_TO_LAUNCHED_TOKEN_BURN]: "The share used to buy and burn the launched token, at that launch's configured burnBps. It buys the launched token, not ARGUS, so it is a cost carried by that launch's supply side rather than a protocol buyback or a payment to holders.",
    [FEES_TO_LAUNCHED_TOKEN_LOCK]: "Portal 8: the share used to buy the launched token and lock it permanently in the line's lock vault, at that launch's configured lockBps. Like the burn it buys the launched token, not ARGUS, so it is supply side.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  methodology,
  breakdownMethodology,
  // Every Portal 3-7 pool is a plain Uniswap v4 pool on Arc carrying a static 1% fee that
  // dexs/uniswap-v4.ts reads straight off the Swap event, and Arc is in its Configs map. Measured
  // over 24h to block 21516182: ArgusPad pools are 326722 of the 640639 Uniswap v4 swaps on Arc
  // and $208k of its $447k fee figure. Portal 8 pools report fee 0 on every Swap (119 of 119 to
  // block 22391750), so its fees are not inside that figure; they are a fraction of a percent of
  // the total today, which does not change the flag.
  doublecounted: true,
  // P3's only launch, block 19674581, 2026-09-07 18:46:13 UTC, and the first fee charged on it 33
  // seconds later at block 19674645. The first launch on the retired Uniswap v3 line is older
  // (block 18819901, 2026-09-02) but that line has none of this fee machinery and returns nothing.
  start: "2026-09-07",
};

export default adapter;
