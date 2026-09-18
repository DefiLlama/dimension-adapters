import { Interface } from "ethers";
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
const PORTAL_SET = new Set(PORTALS);
// P3's creation block, the first of the five; its only launch is at 19674581.
const FIRST_PORTAL_BLOCK = 19674154;

// The Portal announces each launch's parts and its permanent fee configuration, one pair of events
// per launch, in the launch transaction. Measured over blocks 19660000-21516182: PartsDeployed
// reconciles to every Portal's own tokenCount() exactly (P7 139675, P6 323, P5 1, P4 22, P3 1) and
// FeeConfigured covers 140022 of 140022 launches, so these two logs are a complete substitute for
// reading launches(token) per launch. The per-launch contracts are what emit the fee events, and
// there are 140022 of each, so they cannot go in a getLogs address filter - see fetch() below.
const PARTS_DEPLOYED = "event PartsDeployed(address indexed token, address locker, address hook, address splitter)";
// sellTaxBps is needed to net out the tax the splitter charges itself (see SELF-TAX below). The
// event's own comment is "emitted once and never amended because nothing here can be amended".
const FEE_CONFIGURED = "event FeeConfigured(address indexed token, address indexed hook, uint16 lpFeeBps, uint16 buyTaxBps, uint16 sellTaxBps, uint16 treasuryBps, uint16 creatorBps, uint16 burnBps, uint16 dividendBps, uint16 liquidityBps)";

// The fee events, one family per emitter. Two of these share a topic0 with an event of a different
// shape - ArgusV4RewardTracker.Paid(address user, address destination, uint256) is also
// Paid(address,address,uint256) - so every log is bucketed on its emitter BEFORE it is decoded;
// topic2 means currency on the splitter and destination on the tracker, and decoding one as the
// other does not throw, it reports an address as a currency.
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

const iface = new Interface([
  PARTS_DEPLOYED, FEE_CONFIGURED,
  TAX_TAKEN, SNIPE_TAX_APPLIED, FORWARDED, DISTRIBUTED, NETTED, PAID,
  DIVIDEND_FUNDED, DIVIDEND_UNSYNCED, PRINCIPAL_DELIVERED, PRINCIPAL_PARKED,
]);
const topic0 = (abi: string) => iface.getEvent(abi.slice(abi.indexOf(" ") + 1, abi.indexOf("(")))!.topicHash;

const T = {
  partsDeployed: topic0(PARTS_DEPLOYED),
  feeConfigured: topic0(FEE_CONFIGURED),
  taxTaken: topic0(TAX_TAKEN),
  snipeTax: topic0(SNIPE_TAX_APPLIED),
  forwarded: topic0(FORWARDED),
  distributed: topic0(DISTRIBUTED),
  netted: topic0(NETTED),
  paid: topic0(PAID),
  dividendFunded: topic0(DIVIDEND_FUNDED),
  dividendUnsynced: topic0(DIVIDEND_UNSYNCED),
  principalDelivered: topic0(PRINCIPAL_DELIVERED),
  principalParked: topic0(PRINCIPAL_PARKED),
};

type Tally = Record<string, bigint>;
const bump = (t: Tally, asset: string, amount: bigint) => { t[asset] = (t[asset] ?? 0n) + amount };
const addr = (topic: string) => "0x" + topic.slice(26).toLowerCase();
const decode = (log: any) => iface.parseLog({ topics: log.topics, data: log.data })!.args;
const emitter = (log: any) => String(log.address).toLowerCase();
const byPosition = (a: any, b: any) => (Number(a.blockNumber) - Number(b.blockNumber)) || (Number(a.logIndex ?? a.index) - Number(b.logIndex ?? b.index));

type Launch = { token: string, sellTaxBps: bigint, treasuryBps: bigint }

// The whole launch topology, from the Portals' own announcements. Three maps keyed by the address
// that emits, because an emitter's family decides how its log is read.
type Topology = {
  hooks: Map<string, Launch>,
  lockers: Map<string, Launch>,
  splitters: Map<string, Launch>,
  lockerOfToken: Map<string, string>,
}

async function getTopology(options: FetchOptions): Promise<Topology> {
  // A launch-creation list is exactly the small, slowly-changing config scan cacheInCloud is for:
  // the range is from the first Portal to the window end and only the tail is ever refetched.
  // noTarget rather than targets: the two events come from five Portals, and one topic-filtered
  // scan is five times fewer requests than one scan per Portal over the same 1.8M blocks. Foreign
  // launchpads on Arc run forks of this codebase and emit byte-identical events, so the emitter is
  // checked against the Portal set before anything is decoded.
  const logs = await options.getLogs({
    noTarget: true,
    topics: [[T.partsDeployed, T.feeConfigured] as any],
    fromBlock: FIRST_PORTAL_BLOCK,
    entireLog: true,
    cacheInCloud: true,
  });

  const parts = new Map<string, { locker: string, hook: string, splitter: string }>();
  const config = new Map<string, { sellTaxBps: bigint, treasuryBps: bigint }>();
  for (const log of logs) {
    if (!PORTAL_SET.has(emitter(log))) continue;
    const args = decode(log);
    const token = String(args.token).toLowerCase();
    if (log.topics[0] === T.partsDeployed) {
      parts.set(token, {
        locker: String(args.locker).toLowerCase(),
        hook: String(args.hook).toLowerCase(),
        splitter: String(args.splitter).toLowerCase(),
      });
    } else {
      config.set(token, { sellTaxBps: BigInt(args.sellTaxBps), treasuryBps: BigInt(args.treasuryBps) });
    }
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

// Arc's RPC caps eth_getLogs at 10000 blocks and at 20000 results, and refuses a request that
// would exceed either rather than truncating it - so a response that comes back is always
// complete. The SDK's own bisection halves the block span on error but gives up at 1001 blocks,
// and at peak launch density a 1001-block window still returns more than 20000 of these events
// (the node's error names the range that would have fitted: 684 blocks). So the window is walked
// here instead, halving past the SDK's floor and widening again once density drops.
const MAX_SPAN = 10000;   // the endpoint's block-span cap
const MIN_SPAN = 25;      // far below any range the node has refused; a failure here is real
const WIDEN_BELOW = 5000; // widen again only while comfortably clear of the 20000-result cap

async function scanWindow(options: FetchOptions) {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  // One topic-filtered pass for every fee event at once. There is no address filter because there
  // is no small address set to filter on: the emitters are the 140022 tax hooks, 140022 splitters
  // and 140081 lockers, one set per launch, growing by tens of thousands a day. Per AGENTS.md,
  // "hundreds of targets is the sanctioned exception to targets: fetching all logs by topic0 and
  // filtering client-side is more efficient there".
  const topics = [[
    T.taxTaken, T.snipeTax, T.forwarded, T.distributed, T.netted,
    T.paid, T.dividendFunded, T.dividendUnsynced, T.principalDelivered, T.principalParked,
  ]];

  const chunks: any[][] = [];
  let cursor = fromBlock;
  let span = MAX_SPAN;
  let retried = false;
  while (cursor <= toBlock) {
    const end = Math.min(cursor + span - 1, toBlock);
    let chunk: any[];
    try {
      chunk = await options.getLogs({
        noTarget: true,
        topics: topics as any,
        entireLog: true,
        fromBlock: cursor,
        toBlock: end,
        // per-window event data, never asked for twice - not worth writing to the log cache
        skipCache: true,
      } as any);
    } catch (e) {
      // The same span is tried once more before narrowing, so that a transient failure is not read
      // as "this range is too wide" and does not shrink every request after it. A range the node
      // refuses twice is retried narrower; one it refuses at MIN_SPAN is a real failure and is
      // rethrown, so a broken endpoint can never be recorded as a zero-fee day.
      if (!retried) { retried = true; continue; }
      retried = false;
      if (span <= MIN_SPAN) throw e;
      span = Math.max(MIN_SPAN, Math.floor(span / 2));
      continue;
    }
    retried = false;
    chunks.push(chunk);
    cursor = end + 1;
    if (chunk.length < WIDEN_BELOW && span < MAX_SPAN) span = Math.min(MAX_SPAN, span * 2);
  }
  return chunks.flat();
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const topology = await getTopology(options);

  const logs = (await scanWindow(options)).sort(byPosition);

  // Fees, as accrued in the window and denominated in the launch's quote asset.
  const swapTax: Tally = {};        // the tax the hook charged on user swaps
  const selfTax: Tally = {};        // ... minus the part of it the splitter charged itself
  const lpFees: Tally = {};         // what the locked position forwarded
  const principalResidue: Tally = {};// ... minus principal that came back through the same call
  const snipeTax: Tally = {};       // charged straight to the treasury, never through the splitter
  // The treasury's cut, accumulated per launch at that launch's own configured treasuryBps as each
  // fee is counted, rather than as one rate applied to the total - so a launch that ever ships a
  // different rate is handled, and the figure does not move with the window's length.
  const toTreasuryAccrued: Tally = {};

  // The realised pot and where it actually went, used only to split the accrued fees (see below).
  const pot: Tally = {};
  const toTreasury: Tally = {};
  const toDividends: Tally = {};
  const toLockedLiquidity: Tally = {};

  // PrincipalParked means two different things and only a sibling Forwarded tells them apart: the
  // locker took what the price supported and sent the residue back (that residue arrived through
  // Forwarded and has to come out of it), or addLiquidity reverted and the splitter parked the
  // whole offer without anything moving (nothing to subtract). Both emit the same event.
  const forwardedIn = new Set<string>();
  for (const log of logs) {
    if (log.topics[0] !== T.forwarded || !topology.lockers.has(emitter(log))) continue;
    forwardedIn.add(`${String(log.transactionHash).toLowerCase()}:${emitter(log)}`);
  }

  // SnipeTaxApplied carries no currency. It is charged on the same leg as the swap's own tax, so
  // the currency comes from the TaxTaken the same hook emitted in the same transaction.
  const taxCurrencyIn = new Map<string, string>();
  for (const log of logs) {
    if (log.topics[0] !== T.taxTaken || !topology.hooks.has(emitter(log))) continue;
    const key = `${String(log.transactionHash).toLowerCase()}:${emitter(log)}`;
    if (!taxCurrencyIn.has(key)) taxCurrencyIn.set(key, addr(log.topics[1]));
  }

  // Splitter events that carry an amount but no currency - Distributed, Netted, PrincipalDelivered
  // and PrincipalParked - are denominated in their launch's quoteAsset, which is not in any of
  // them. It is read from the splitters that actually emitted one, so the call count follows the
  // window's activity rather than the number of launches ever made.
  const needQuote = new Set<string>();
  for (const log of logs) {
    const t = log.topics[0];
    if (t !== T.distributed && t !== T.netted && t !== T.principalDelivered && t !== T.principalParked) continue;
    const splitter = emitter(log);
    if (topology.splitters.has(splitter)) needQuote.add(splitter);
  }
  const quoteSplitters = [...needQuote];
  const quoteAssets = quoteSplitters.length
    ? await options.api.multiCall({ abi: QUOTE_ASSET_FUNCTION, calls: quoteSplitters })
    : [];
  const quoteOf = new Map<string, string>();
  quoteSplitters.forEach((splitter, i) => quoteOf.set(splitter, String(quoteAssets[i]).toLowerCase()));

  for (const log of logs) {
    const source = emitter(log);
    const t = log.topics[0];

    const hook = topology.hooks.get(source);
    if (hook) {
      if (t === T.taxTaken) {
        const currency = addr(log.topics[1]);
        // The tax lands on the swap's unspecified leg, so it is charged in the quote on some swaps
        // and in the launched token on others. The launched-token leg has no price source and is
        // excluded; see the methodology.
        if (currency !== hook.token) {
          const amount = BigInt(decode(log).amount);
          bump(swapTax, currency, amount);
          bump(toTreasuryAccrued, currency, (amount * hook.treasuryBps) / BPS);
        }
      } else if (t === T.snipeTax) {
        const currency = taxCurrencyIn.get(`${String(log.transactionHash).toLowerCase()}:${source}`);
        if (currency && currency !== hook.token) bump(snipeTax, currency, BigInt(decode(log).amount));
      }
      continue;
    }

    const locker = topology.lockers.get(source);
    if (locker) {
      if (t === T.forwarded) {
        const currency = addr(log.topics[1]);
        // Forwarded rather than FeesCollected: addLiquidity harvests the position and forwards
        // without emitting FeesCollected, which undercounts the quote leg by about 1.5%.
        if (currency !== locker.token) {
          const amount = BigInt(decode(log).amount);
          bump(lpFees, currency, amount);
          bump(toTreasuryAccrued, currency, (amount * locker.treasuryBps) / BPS);
        }
      }
      continue;
    }

    const splitter = topology.splitters.get(source);
    if (!splitter) continue;   // a reward tracker, or a foreign fork of this codebase
    const quote = quoteOf.get(source);
    const args = decode(log);

    switch (t) {
      case T.paid: {
        // The splitter pushes the treasury cut here; the creator is credited with Accrued and pulls
        // later, so this never double counts a creator payment.
        if (addr(log.topics[1]) !== TREASURY) break;
        const currency = addr(log.topics[2]);
        if (currency !== splitter.token) bump(toTreasury, currency, BigInt(args.amount));
        break;
      }
      case T.dividendFunded:
      case T.dividendUnsynced: {
        const asset = addr(log.topics[1]);
        if (asset !== splitter.token) bump(toDividends, asset, BigInt(args.amount));
        break;
      }
      case T.distributed:
        // What arrived at the splitter and was engaged by this crank, read before the netting swap.
        // Never summed with the payouts below: they are the two sides of one crank, and Distributed
        // is emitted in the middle of it. Its carried* fields re-report the same money on every
        // crank that carries it and are not read at all.
        if (quote) bump(pot, quote, BigInt(args.quoteUsdc6));
        break;
      case T.netted: {
        // The splitter sells the launched tokens it was paid into the launch's quote asset. Almost
        // all of the token side goes through here, which is why the quote pot is the larger measure.
        const amountIn = BigInt(args.amountIn), amountOut = BigInt(args.amountOut);
        if (args.sellingToken) {
          if (quote) bump(pot, quote, amountOut);
          // SELF-TAX: the netting swap routes through the launch's own pool and so pays the
          // launch's own tax, which the hook takes straight back to the splitter. TaxTaken reports
          // it exactly like a user's tax but the protocol paid it to itself, so it comes out.
          // The charge is amountOut * sellTaxBps / 10000 on the gross pool output.
          if (quote) {
            const self = (amountOut * splitter.sellTaxBps) / BPS;
            bump(selfTax, quote, self);
            bump(toTreasuryAccrued, quote, -(self * splitter.treasuryBps) / BPS);
          }
        } else if (quote) {
          bump(pot, quote, -amountIn);
        }
        break;
      }
      case T.principalDelivered:
        if (quote) bump(toLockedLiquidity, quote, BigInt(args.quoteUsdc6));
        break;
      case T.principalParked:
        if (quote && forwardedIn.has(`${String(log.transactionHash).toLowerCase()}:${topology.lockerOfToken.get(splitter.token)}`)) {
          const residue = BigInt(args.quoteUsdc6);
          bump(principalResidue, quote, residue);
          bump(toTreasuryAccrued, quote, -(residue * splitter.treasuryBps) / BPS);
        }
        break;
    }
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

    // The treasury's cut is the one share the contract fixes: _net pays the treasury treasuryBps
    // of the pot, read per launch from the Portal's own FeeConfigured (1000 on all 140022 launches
    // today) rather than hardcoded. Taking it per launch as the fee is counted makes the figure
    // independent of how long the window is, which matters because this adapter is pulled hourly
    // and summed over the day: a share measured per window instead moves with whichever launches
    // happened to crank inside it, and a quiet hour can put the whole hour's fee in revenue.
    // What the treasury is actually PAID out of a realised pot runs a little above treasuryBps -
    // 10.32% and 10.56% over the two windows checked, against the configured 10.00% - because
    // _allocate derives the quote weights from the pool price (_weights(c.sqrtPriceX96)) and
    // _shares pays nothing to anyone when that weight is zero. That excess is price-dependent, no
    // per-launch rate expresses it, and a window-measured rate is not stable enough to stand in
    // for one, so the configured share is what is reported.
    //
    // Everything else is what is left, so the supply-side TOTAL is as stable as the revenue is.
    // Only the split BETWEEN its three labels uses what the splitters actually paid out of the pot
    // they realised in the same window - the creator/dividend/liquidity weights really are
    // price-dependent, so there is no per-launch rate to read for them. Those proportions
    // apportion the supply-side total between its three labels, in the proportions the splitters actually paid out of the pot they realised in
    // the same window. That keeps the label split faithful while the totals stay exact: the
    // creator takes the remainder, so dailyFees is dailyRevenue plus dailySupplySideRevenue however
    // the rounding falls. If the window realised nothing, or realised less than it paid out, the
    // whole supply-side goes to the creator label rather than to a ratio that cannot be measured.
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
  ProtocolRevenue: "Same as Revenue. All of it goes to the ArgusPad treasury; there is no distribution to ARGUS holders.",
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
