import { encodeBytes32String } from "ethers";
import { Market, Suite, ZERO } from "./config";
import { compareLogs, Log, lower } from "./events";

// Uniswap v4 TickMath uses symmetric bounds of +/-887272, derived from
// log base 1.0001 of 2^128. The protocol's RWA pricing helper uses the same bounds.
// https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/libraries/TickMath.sol#L18-L23
const MAX_TICK = 887272;

type Quote = { registered: boolean; decimals: number; tick: number; supply?: bigint; creationFee: bigint; revision?: bigint };
/**
 * Pool state needed for fee attribution. `quote`, `market` and `log` are present only for
 * pools launched inside the window; pools resolved from the opening-block `poolConfig`
 * snapshot carry just the creator, and their market is derived from the trade fee currency.
 */
type Pool = { quote?: string; creator: string; market?: Market; log?: Log };
/** Opening-block state for one suite, read point-in-time instead of replayed from genesis. */
export type Baseline = {
  pools: Map<string, { creator: string; treasury?: string }>;
  quotes: Map<string, { registered: boolean; decimals: number; tick: number; creationFee: bigint }>;
  supply?: bigint;
  nativeFee: bigint;
};
type Credit = { recipient: string; currency: string; amount: bigint; componentId?: string; poolId?: string };
export type Fee = {
  market: Market;
  currency: string;
  fees: bigint;
  creator: bigint;
  referrer: bigint;
  revenue: bigint;
  launch: boolean;
  log: Log;
  // USD per raw unit, frozen at the last price-bearing factory event, not at fetch time.
  stockPrice?: number;
};

/** Convert a decoded unsigned amount to bigint, rejecting invalid or negative values. */
const amount = (value: any): bigint => {
  const n = BigInt(value);
  if (n < 0n) throw new Error("Negative o1 fee amount");
  return n;
};
/** Sum raw credit amounts without converting them to floating-point numbers. */
const sum = (credits: Credit[]) => credits.reduce((total, c) => total + c.amount, 0n);
const componentNames = new Map(["CREATOR", "REFERRER", "PLATFORM"].map(name => [lower(encodeBytes32String(name)), name]));
/** Throw with adapter context when an event or accounting invariant fails. */
const requireThat = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`o1 Launchpad: ${message}`);
};
/**
 * Categorised counts of skipped events for the suite currently being accounted.
 * Reported as one summary line per suite rather than one line per event, so a window
 * with thousands of incomplete records stays readable. `accountSuite` runs one suite at a
 * time within a fetch, clearing this on entry and draining it on exit.
 */
const skipCounts = new Map<string, number>();
/** Incomplete RPC/log sets are skipped so one missing event cannot fail the day. */
const skip = (message: string): void => {
  // Collapse addresses, hashes, log indices and ids so the 30 call sites map onto a
  // bounded category set; one window must never produce more than a handful of categories.
  const category = message.replace(/0x[0-9a-fA-F]+/g, "").replace(/:?\d+/g, "").replace(/\s+/g, " ").trim();
  skipCounts.set(category, (skipCounts.get(category) ?? 0) + 1);
};
/**
 * Classify a fee currency into its market.
 * Standard and RWA routes are fixed by the suite; dual routes follow the quote catalogue.
 * The hook enforces that a trade's fee currency is the pool quote (LaunchHook `UnexpectedFeeCurrency`),
 * so the fee currency is a sound stand-in for the pool quote on every suite carrying that guard.
 */
const marketOf = (suite: Suite, crypto: Set<string>, currency: string): Market =>
  suite.route === "standard" || (suite.route === "dual" && crypto.has(currency)) ? "Crypto" : "Stocks";
/** Emit the accumulated skip categories for one suite and reset the counters. */
function reportSkipped(suite: Suite): void {
  if (!skipCounts.size) return;
  let total = 0;
  const parts: string[] = [];
  for (const [category, count] of skipCounts) {
    total += count;
    parts.push(`${category} x${count}`);
  }
  skipCounts.clear();
  console.log(`o1 Launchpad: skipped ${total} events in suite ${suite.hook} (${parts.join("; ")})`);
}

/**
 * Recover the stock reference price using the tick and supply captured together.
 * Standalone supply updates do not reprice an existing quote snapshot.
 * @param quote State captured at the latest quote registration or tick update.
 * @returns USD per raw quote unit, or undefined when no active pricing snapshot exists.
 * @throws If the computed reference price is non-finite or non-positive.
 */
function pricePerRawUnit(quote?: Quote): number | undefined {
  if (!quote?.registered || !quote.supply) return undefined;
  // Operator's $4,000 opening-cap convention, also used by the historical analytics.
  // Dividing quotePriceUSD by 10^quoteDecimals cancels the decimals factor in that formula.
  const price = 4000 / (Math.pow(1.0001, quote.tick) * Number(quote.supply));
  requireThat(Number.isFinite(price) && price > 0, "invalid factory tick price");
  return price;
}

/**
 * Reconcile a Trade with its escrow credits and attribute the actual fee amounts.
 * @param suite Deployment generation used to select component or historical attribution.
 * @param trade Trade event closing the credit bundle.
 * @param pool Historical pool state identifying the creator.
 * @param treasury Historical treasury, required for non-minimal suites.
 * @param credits Escrow credits preceding the trade, in event order.
 * @param components Minimal-suite component events paired with those credits.
 * @returns Total, creator, referrer and protocol amounts in raw fee-currency units, or undefined to skip the trade.
 */
function splitCredits(suite: Suite, trade: Log, pool: Pool, treasury: string | undefined, credits: Credit[], components: Credit[]) {
  const total = amount(trade.args.totalFee);
  const currency = lower(trade.args.feeCurrency);
  const referrer = lower(trade.args.referrer);
  const identity = `${trade.transactionHash}:${trade.logIndex}`;
  if (!(credits.every(c => c.currency === currency) && sum(credits) === total)) {
    skip(`escrow credits do not match Trade ${identity}`);
    return;
  }
  let creatorAmount = 0n, referrerAmount = 0n, protocolAmount = 0n;

  if (suite.minimal) {
    if (!(components.length === credits.length && sum(components) === total)) {
      skip(`component total does not match Trade ${identity}`);
      return;
    }
    const ids = new Set<string>();
    for (const [i, c] of components.entries()) {
      const generic = credits[i];
      if (!(generic && c.currency === currency && c.currency === generic.currency && c.amount === generic.amount
        && c.recipient === generic.recipient)) {
        skip(`component/escrow credit mismatch ${trade.transactionHash}`);
        return;
      }
      if (ids.has(c.componentId!)) {
        skip(`duplicate fee component ${trade.transactionHash}`);
        return;
      }
      ids.add(c.componentId!);
      if (c.componentId === "CREATOR") creatorAmount += c.amount;
      else if (c.componentId === "REFERRER") {
        if (!(referrer !== ZERO && c.recipient === referrer)) {
          skip(`invalid REFERRER component ${trade.transactionHash}`);
          return;
        }
        referrerAmount += c.amount;
      } else {
        // Deployed suites attribute PLATFORM and additional protocol-owned FIXED components
        // to protocol revenue, independently of whether their destination wallets coincide.
        protocolAmount += c.amount;
      }
    }
  } else {
    if (!treasury) {
      skip(`missing historical PoolRegistered ${trade.args.poolId}`);
      return;
    }
    // Historical hooks emit creator, optional referrer, then platform; FeeEscrow omits
    // zero amounts. Earliest deployments also permit referral/creator/treasury overlap.
    // Match the ordered subsequence, rather than merging distinct roles by wallet.
    const recipients = [pool.creator, referrer, treasury];
    const candidates: bigint[][] = [];
    /** Enumerate ordered role assignments, allowing roles with zero credit to be omitted. */
    const match = (role: number, index: number, values: bigint[]) => {
      if (role === recipients.length) {
        if (index === credits.length) candidates.push(values);
        return;
      }
      match(role + 1, index, [...values, 0n]);
      if (recipients[role] !== ZERO && credits[index]?.recipient === recipients[role])
        match(role + 1, index + 1, [...values, credits[index].amount]);
    };
    match(0, 0, []);
    const unique = new Map(candidates.map(values => [values.join(","), values]));
    if (unique.size !== 1) {
      skip(`ambiguous or unassigned historical credits ${trade.transactionHash}`);
      return;
    }
    [creatorAmount, referrerAmount, protocolAmount] = [...unique.values()][0];
  }
  if (total !== creatorAmount + referrerAmount + protocolAmount) {
    skip(`unbalanced fee destinations ${identity}`);
    return;
  }
  return { fees: total, creator: creatorAmount, referrer: referrerAmount, revenue: protocolAmount };
}

/**
 * Replay one immutable suite's history and reconcile fees within an inclusive block range.
 * @param suite Deployment addresses, generation and fee configuration.
 * @param cryptoQuotes Quote addresses classified as Crypto on dual-route suites.
 * @param logs Historical state and in-window fee events; sorted in place by block and log index.
 * @param fromBlock First block whose fees are included; earlier state events remain effective.
 * @param toBlock Last included block; later logs are ignored.
 * Incomplete event sets are skipped and logged so a missing RPC log cannot fail the run.
 */
export function accountSuite(suite: Suite, cryptoQuotes: string[], logs: Log[], fromBlock: number, toBlock: number, baseline: Baseline): Fee[] {
  skipCounts.clear();
  const pools = new Map<string, Pool>();
  const treasuries = new Map<string, string>();
  const quotes = new Map<string, Quote>();
  // Seed the opening-block snapshot, then let in-window events move it forward. This is
  // equivalent to replaying from the suite's first block without reading any earlier block.
  for (const [id, state] of baseline.pools) {
    pools.set(id, { creator: state.creator });
    if (state.treasury) treasuries.set(id, state.treasury);
  }
  for (const [token, state] of baseline.quotes)
    quotes.set(token, { ...state, supply: baseline.supply });
  const pending = new Map<string, { credits: Credit[]; components: Credit[] }>();
  const launches = new Map<string, { pool: Pool; log: Log; expected: bigint; currency: string; stockPrice?: number }[]>();
  const payments = new Map<string, Log[]>();
  const launchBuys = new Map<string, Log>();
  const fees: Fee[] = [];
  const seen = new Set<string>();
  let supply: bigint | undefined = baseline.supply;
  let nativeFee = baseline.nativeFee;
  const crypto = new Set(cryptoQuotes);

  for (const log of logs.sort(compareLogs)) {
    if (log.blockNumber > toBlock) continue;
    if (log.blockNumber < suite.firstBlock) {
      skip(`log predates suite ${log.transactionHash}:${log.logIndex}`);
      continue;
    }
    const identity = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(identity)) {
      skip(`duplicate log ${identity}`);
      continue;
    }
    seen.add(identity);
    const a = log.args;
    const inWindow = log.blockNumber >= fromBlock;
    switch (log.kind) {
      case "supply": supply = amount(a.supply); break;
      case "quote":
      case "minimalQuote": {
        const token = lower(a.quote);
        const old = quotes.get(token);
        const revision = a.revision === undefined ? undefined : amount(a.revision);
        if (revision !== undefined && old?.revision !== undefined && !(revision > old.revision)) {
          skip(`non-monotonic quote revision ${token}`);
          break;
        }
        const decimals = Number(a.decimals), tick = Number(a.tick);
        // QuoteRegistered encodes decimals as uint8 (see events.ts), whose maximum is 2^8 - 1 = 255.
        if (!(Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
          && Number.isInteger(tick) && Math.abs(tick) <= MAX_TICK)) {
          skip(`invalid quote configuration ${token}`);
          break;
        }
        quotes.set(token, { registered: true, decimals, tick, supply, revision,
          // Old tick updates share QuoteRegistered's signature. Only a new lifecycle resets creationFee.
          creationFee: old?.registered ? old.creationFee : 0n });
        break;
      }
      case "tick": {
        const token = lower(a.quote), old = quotes.get(token);
        if (!old?.registered) {
          skip(`tick update without registration ${token}`);
          break;
        }
        const revision = amount(a.revision), tick = Number(a.tick);
        if (!(revision > (old.revision ?? 0n) && Number.isInteger(tick) && Math.abs(tick) <= MAX_TICK)) {
          skip(`invalid quote tick/revision ${token}`);
          break;
        }
        quotes.set(token, { ...old, tick, supply, revision });
        break;
      }
      case "unregister":
      case "minimalUnregister": {
        const token = lower(a.quote), old = quotes.get(token);
        if (!old?.registered) {
          skip(`unregistration without registration ${token}`);
          break;
        }
        const revision = a.revision === undefined ? undefined : amount(a.revision);
        if (revision !== undefined && !(revision > (old.revision ?? 0n))) {
          skip(`invalid quote revision ${token}`);
          break;
        }
        quotes.set(token, { ...old, registered: false, creationFee: 0n, revision });
        break;
      }
      case "nativeFeeConfig": nativeFee = amount(a.amount); break;
      case "quoteFeeConfig": {
        const token = lower(a.quote), old = quotes.get(token);
        if (!old?.registered) {
          skip(`creation fee for unregistered quote ${token}`);
          break;
        }
        quotes.set(token, { ...old, creationFee: amount(a.amount) });
        break;
      }
      case "pool": treasuries.set(lower(a.poolId), lower(a.treasury)); break;
      case "launch": {
        const quote = lower(a.quote), id = lower(a.poolId);
        if (pools.has(id)) {
          skip(`duplicate pool launch ${id}`);
          break;
        }
        const registered = quotes.get(quote);
        if (suite.route === "dual" && !registered?.registered) {
          skip(`unknown launch quote ${quote}`);
          break;
        }
        const market = marketOf(suite, crypto, quote);
        const pool: Pool = { quote, creator: lower(a.creator), market, log };
        pools.set(id, pool);
        if (inWindow) {
          const currency = suite.launchFee === "quote" ? quote : ZERO;
          const expected = suite.launchFee === "native" ? nativeFee : suite.launchFee === "quote" ? registered?.creationFee : 0n;
          if (expected === undefined) {
            skip(`unknown launch fee configuration ${id}`);
            break;
          }
          const group = launches.get(log.transactionHash) ?? [];
          group.push({ pool, log, expected, currency,
            stockPrice: market === "Stocks" && currency === quote ? pricePerRawUnit(registered) : undefined });
          launches.set(log.transactionHash, group);
        }
        break;
      }
      case "launchFee":
      case "nativeLaunchFee": {
        if (!inWindow) break;
        const group = payments.get(log.transactionHash) ?? [];
        group.push(log);
        payments.set(log.transactionHash, group);
        break;
      }
      case "launchBuy": {
        const id = lower(a.poolId);
        if (!inWindow || launchBuys.has(id)) {
          skip(`duplicate or out-of-range LaunchBuyExecuted ${id}`);
          break;
        }
        launchBuys.set(id, log);
        break;
      }
      case "credit":
      case "component": {
        if (!inWindow) break;
        const group = pending.get(log.transactionHash) ?? { credits: [], components: [] };
        const credit: Credit = { recipient: lower(a.recipient), currency: lower(a.currency), amount: amount(a.amount) };
        if (log.kind === "credit") group.credits.push(credit);
        else {
          // Custom component IDs are arbitrary bytes32, not necessarily UTF-8 strings.
          // Pair against escrow credits at Trade time so a missing RPC copy of one event
          // kind cannot fail the rest of the window.
          credit.componentId = componentNames.get(lower(a.componentId)) ?? lower(a.componentId);
          credit.poolId = lower(a.poolId);
          group.components.push(credit);
        }
        pending.set(log.transactionHash, group);
        break;
      }
      case "trade": {
        if (!inWindow) break;
        const id = lower(a.poolId);
        // Minimal suites attribute by component id and never read the pool creator or
        // treasury, so a pool first seen in this window needs no opening-block lookup.
        const pool = pools.get(id) ?? (suite.minimal ? { creator: ZERO } as Pool : undefined);
        const group = pending.get(log.transactionHash) ?? { credits: [], components: [] };
        pending.delete(log.transactionHash);
        if (!pool) {
          skip(`Trade for unknown pool ${id}`);
          break;
        }
        if (!group.components.every(c => c.poolId === id)) {
          skip(`cross-pool fee bundle ${identity}`);
          break;
        }
        const split = splitCredits(suite, log, pool, treasuries.get(id), group.credits, group.components);
        if (!split) break;
        const currency = lower(a.feeCurrency);
        // Preserve the existing quote-denominated metric. Legacy launch-token fees have
        // no reliable historical USD price; never mistake their raw units for quote units.
        // Suites predating the hook's `UnexpectedFeeCurrency` guard are the only ones that can
        // emit them; for a pool launched before this window the quote catalogue identifies them.
        const legacySuite = !suite.minimal && suite.launchFee === "none";
        const quoteFee = pool.quote !== undefined
          ? currency === pool.quote
          : !legacySuite || crypto.has(currency);
        if (!quoteFee) {
          if (!legacySuite) skip(`unexpected non-quote fee ${identity}`);
          break;
        }
        const market = pool.market ?? marketOf(suite, crypto, currency);
        fees.push({ ...split, currency, market, launch: false, log,
          stockPrice: market === "Stocks" ? pricePerRawUnit(quotes.get(currency)) : undefined });
        break;
      }
    }
  }
  if (pending.size) skip(`escrow/component credits without Trade in ${suite.hook}`);

  for (const [tx, launchesInTx] of launches) {
    const paid = payments.get(tx) ?? [];
    const used = new Set<Log>();
    // Atomic creation ends with a pool-specific marker after its payment. Assign those
    // first so a later ordinary launch cannot consume the atomic launch's payment.
    const ordered = [...launchesInTx].sort((a, b) => Number(launchBuys.has(lower(b.log.args.poolId)))
      - Number(launchBuys.has(lower(a.log.args.poolId))));
    for (const entry of ordered) {
      const { pool, log: launchLog, expected, currency } = entry;
      const id = lower(launchLog.args.poolId), atomicEnd = launchBuys.get(id);
      if (atomicEnd) {
        if (!(atomicEnd.transactionHash === tx && lower(atomicEnd.args.originalCreator) === pool.creator
          && compareLogs(launchLog, atomicEnd) < 0)) {
          skip(`invalid LaunchBuyExecuted ${id}`);
          continue;
        }
        launchBuys.delete(id);
      }
      const matching = paid.filter(p => !used.has(p) && lower(p.args.payer) === pool.creator
        && (p.kind === "nativeLaunchFee" ? ZERO : lower(p.args.currency)) === currency
        && amount(p.args.amount) === expected
        && (atomicEnd ? compareLogs(launchLog, p) < 0 && compareLogs(p, atomicEnd) < 0
          : compareLogs(p, launchLog) < 0
            && !launchesInTx.some(other => compareLogs(p, other.log) < 0 && compareLogs(other.log, launchLog) < 0)));
      if (expected === 0n ? matching.length !== 0 : matching.length !== 1) {
        skip(`missing or ambiguous launch fee ${tx}:${launchLog.logIndex}`);
        continue;
      }
      if (expected === 0n) continue;
      const payment = matching[0];
      used.add(payment);
      fees.push({ market: pool.market ?? marketOf(suite, crypto, currency), currency, fees: expected, revenue: expected, creator: 0n, referrer: 0n,
        launch: true, log: payment, stockPrice: entry.stockPrice });
    }
    if (used.size !== paid.length) skip(`unassigned launch payment ${tx}`);
    payments.delete(tx);
  }
  if (payments.size) skip(`launch payments without Launched in ${suite.factory}`);
  if (launchBuys.size) skip(`LaunchBuyExecuted without Launched in ${suite.factory}`);
  reportSkipped(suite);
  return fees;
}
