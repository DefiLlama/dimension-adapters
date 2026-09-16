import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// What The Hook — a Uniswap v4 hook on Robinhood Chain.
//
// The hook backruns the swap that creates an imbalance: when a trade moves one
// pool away from a connected pool, it closes the gap inside the same
// transaction and distributes the realised profit. It is arbitrage that would
// otherwise be taken by an outside searcher, which is why it is reported under
// MEV Rewards rather than as a swap fee — no fee rate exists and nobody is
// charged.
//
// Fees is the whole of the captured profit, read from ProfitCurrencyDistribute,
// which the hook emits once per distribution carrying the total and the
// currency it is paid in. Where that total goes is read from what actually
// moved in the same transaction, because the split changed on 2 September 2026
// (block 52857836) when a new arbitrage executor went live:
//
//   - the executor's ProtocolRevenue event is the share retained by the
//     protocol treasury (90% of the profit on the WTH token's own pools, 40%
//     on pools that integrate the token);
//   - the PoolManager's Donate events sent by the executor are what went to
//     liquidity providers. A donation into one of WTH's own pools is booked as
//     protocol revenue too — those pools are the protocol's, and that was the
//     treasury's income before the ProtocolRevenue event existed;
//   - ReferralRewarded is the optional referral share paid to an integrating
//     partner (supply-side; not enabled on any pool yet);
//   - the remainder of the hook's total is the cashback paid to the trader
//     whose swap created the opportunity.
//
// Since 11 September 2026 there is a second source of the same income, and it
// does not run through the hook at all. The HOOKR integration arbitrages on
// its own account and states the whole split in one
// ArbitrageProfitSplit event, of which What The Hook keeps wthProtocolAmount
// — a tenth of the profit in every one of the 252 emitted so far. Not one of
// the 213 transactions carrying them also carries a ProfitCurrencyDistribute,
// while the hook distributed in 3,455 transactions over the same blocks: the
// two are disjoint, and none of this income is reported by any other event.
//
// So a split outside a hook transaction is booked as a distribution of its
// own — the profit it captured is Fees, wthProtocolAmount is Revenue, and the
// rest is the partner's, which pays the trader, the trigger pool and its own
// treasury out of it. A split inside a hook transaction has not happened yet,
// but What The Hook's own executor for the integration carries the event in
// its code and would emit one; there the split is taken as the authority for
// that transaction instead, so the total is read once rather than twice.
//
// The executor that changed the split was deployed at block 52850943. No rule
// keys off that number: before it there are no ProtocolRevenue events and the
// treasury's income is whatever was donated into its own pools; after it those
// pools receive nothing at all, the split having become 90/10 with no LP
// share. The data draws the line by itself, and cannot draw it in the wrong
// place.
//
// Before the new executor every distribution paid out in full to the trader
// and the pool's LPs, so for that period the same reading gives revenue equal
// to the donations into WTH's own pools and nothing else. The event's own
// swapper/LP fields are not used for the split: the hook still reports the
// split it was deployed with, not the one the executor pays.

// https://robinhoodchain.blockscout.com/address/0xc52fc52698479e42f0da9a8a75296ec3871454c0
const HOOK = "0xc52fc52698479e42f0da9a8a75296ec3871454c0";
// v4 uses the zero address for native ETH; the pools settle in WETH and USDG.
// The hook reports a WETH-pool distribution in WETH while the executor pays
// the treasury and the pools in native ETH out of the same profit, so the two
// are one currency for the purpose of splitting a transaction's total.
const NATIVE = ADDRESSES.null;
// https://robinhoodchain.blockscout.com/token/0x0Bd7d308F8e1639fAB988DF18A8011f41EacAd73
const WETH = ADDRESSES.robinhood.WETH;
// https://robinhoodchain.blockscout.com/token/0xb8Fa8010833463Aac5595b55B9045479239EfF79
const WTH = "0xb8fa8010833463aac5595b55b9045479239eff79";
const family = (currency: string) => (currency === NATIVE || currency === WETH ? "eth" : currency);
// Uniswap v4 PoolManager on Robinhood Chain
// https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

// The protocol's own pools. Under the old revenue model these two were the
// only pools the protocol had, and they are the only two that ever received a
// donation from an executor — 14,323 and 14,315 of them, the last at block
// 52758567. Profit donated into them was the treasury's, because the protocol
// owns the in-range liquidity there; profit donated anywhere else belongs to
// that pool's LPs.
//
// The list is closed rather than maintained. Since the executor of 2 September
// 2026 the treasury's share arrives as a ProtocolRevenue event and no donation
// is made into a protocol pool at all, so no pool can ever join this set — it
// describes a chapter that has ended, not a registry to keep up to date.
//
// They are named rather than discovered because discovering them meant asking
// the chain for each donated-to pool's Initialize event across the
// PoolManager's whole history, once per pool the adapter had not seen before.
// A day that opens ten new pools issues ten such scans in one hour, the node
// starts refusing them, and a refusal took the whole hourly slot with it:
// 6 September 2026 reported $1,175 of fees against $10,368 on chain.
// Both are WETH/WTH pools, currency0 WETH and currency1 WTH, so a donation
// into either can be booked in its own token without asking the chain.
const PROTOCOL_POOLS: Record<string, [string, string]> = {
  // https://dexscreener.com/robinhood/0x79723a75c401d5c3ad66b0d0837739e502f08799ebf6a503e6e4d0827b3eb7e5
  "0x79723a75c401d5c3ad66b0d0837739e502f08799ebf6a503e6e4d0827b3eb7e5": [WETH, WTH],
  // https://dexscreener.com/robinhood/0x6ff5c44dbae70efd0c5124979b803395163c8e93e7d1f97a7fcdeb1ed875f5c2
  "0x6ff5c44dbae70efd0c5124979b803395163c8e93e7d1f97a7fcdeb1ed875f5c2": [WETH, WTH],
};

// Every arbitrage executor the hook has used. Only an address in this list
// may emit the ProtocolRevenue and ReferralRewarded legs or send a Donate the
// adapter will count — an event signature does not authenticate its emitter,
// and anyone can donate into a pool or emit an executor-shaped event inside a
// transaction that also trips the hook. Old generations stay so that history
// keeps reading the same; a new generation has to be appended here (the first
// nine paid the old rule and never emitted the events; gen-10 is the one that
// retains revenue).
const EXECUTORS = [
  "0x7b3c8c89b86fbf40e7107c1c8ab1b869a143842c", // gen-1, live 2026-08-04
  "0x8a8da9e805df1d380435cade5117489a1501b1fb", // gen-2, live 2026-08-10
  "0x155bad4fb831028792f7644bbb769dcaa5011e3c", // gen-3, live 2026-08-11
  "0xe4bde697b6c4339beb5d70651f79e1d668b8b95f", // gen-4, live 2026-08-12
  "0xeec11bacd1dce53e910fcf30686e33744c3591ad", // gen-5, live 2026-08-12
  "0x9859c29cc0f7a1ff177ee89d718742ab02b2cdc2", // gen-6, live 2026-08-12
  "0x843e6b6a6c51ee18fa5685a5c089ae57f5115a06", // gen-7, live 2026-08-13
  "0xbb0db1bcf582b991663ab04018c00ef6ddde7fac", // gen-8, live 2026-08-19
  "0x26a5d02938fbf70af4c114c2ff432ed3be0d3b62", // gen-9, live 2026-08-21
  // https://robinhoodchain.blockscout.com/address/0xf85018dE9ebE0fbDf7D559c8814cEBE709855029
  "0xf85018de9ebe0fbdf7d559c8814cebe709855029", // gen-10, live 2026-09-02, block 52857836
  // https://robinhoodchain.blockscout.com/address/0x5d2Adb3322E650Dc9f8FFfaF4b3cb9c3c21F74d8
  "0x5d2adb3322e650dc9f8fffaf4b3cb9c3c21f74d8", // gen-11, live 2026-09-07
  // gen-12, deployed but not yet switched on — it implements Pons hook
  // simulation correctness. An address that emits nothing changes no figure,
  // so listing it now means its first event is counted the moment the team
  // turns it on, rather than after another pull request.
  // https://robinhoodchain.blockscout.com/address/0x2F4f6Dd51c0D8869852916Fceb869339Fe16aFB3
  "0x2f4f6dd51c0d8869852916fceb869339fe16afb3",
  // What The Hook's own executor for the HOOKR integration. Its code carries
  // both the ProtocolRevenue and the ArbitrageProfitSplit topic; it has
  // emitted neither so far. Listed for the same reason as gen-12: an address
  // that emits nothing changes no figure, and its first arbitrage should
  // count on the day the team turns it on.
  // https://robinhoodchain.blockscout.com/address/0x4650EEEB8093dE5412246a4FbD7d08798Fd0ec22
  "0x4650eeeb8093de5412246a4fbd7d08798fd0ec22",
];
const EXECUTOR_SET = new Set(EXECUTORS);

// The addresses whose ArbitrageProfitSplit counts, and no others. An event
// signature does not authenticate its emitter, and this one names its own
// payout to the protocol: an unchecked reading would let anybody inflate
// these figures by emitting the same shape from an address of their own.
//
// A new deployment has to be added here, or its arbitrage stops being counted
// — the income goes quietly missing rather than wrong.
const SPLIT_EMITTERS = [
  // The integration's arbitrage contract, live since 14 September 2026 and
  // the source of 245 of the 252 arbitrages so far.
  // https://robinhoodchain.blockscout.com/address/0xc356cF51134e0df02BFE880115dd8C66eAd45803
  "0xc356cf51134e0df02bfe880115dd8c66ead45803",
  // The two test deployments it replaced, in use for a day each and seven
  // arbitrages between them. Kept so that those first days keep reading the
  // way they read when they happened.
  // https://robinhoodchain.blockscout.com/address/0x8d18DddEDd529b7f9D90E65e75408bA2290ab276
  "0x8d18dddedd529b7f9d90e65e75408ba2290ab276", // 2026-09-11, three
  // https://robinhoodchain.blockscout.com/address/0x45DcE9F6e01478Dc2d5EdcF093Eae0c0aDb043bC
  "0x45dce9f6e01478dc2d5edcf093eae0c0adb043bc", // 2026-09-12, four
  // And the hook's own executor for the integration, listed above, which
  // carries the event in its code and has not emitted one yet.
  "0x4650eeeb8093de5412246a4fbd7d08798fd0ec22",
];
const SPLIT_EMITTER_SET = new Set(SPLIT_EMITTERS);

// Every signature below was checked against the topics the deployed contracts
// actually emit:
//   ProfitCurrencyDistribute 0x7b1f2ac966718a4fe501511d1cdc7d0671a76732a9213ee292a41bffdd8051fa
//   Donate                   0x29ef05caaff9404b7cb6d1c0e9bbae9eaa7ab2541feba1a9c4248594c08156cb
//   ProtocolRevenue          0x72a888fd93a6302c4cb123dfe9b12b97a7188a0c3f5a2d917802936032538848
//   ArbitrageProfitSplit     0x65c47530703d4eca41f937917aa3f3a7a33c3d85bfb8bc9ebaaaf27f8b57ef6a
// ReferralRewarded is taken from the executor's interface; no pool has a
// referral configured yet, so it has not been observed on chain.
const profitDistributeAbi =
  "event ProfitCurrencyDistribute(address indexed recipient, address indexed currency, uint256 swapperAmount, uint256 lpAmount)";
const donateAbi = "event Donate(bytes32 indexed id, address indexed sender, uint256 amount0, uint256 amount1)";
const protocolRevenueAbi = "event ProtocolRevenue(address indexed token, uint256 amount)";
const referralRewardedAbi = "event ReferralRewarded(address indexed token, address indexed recipient, uint256 amount)";
// The whole split of one arbitrage, stated by the contract that ran it. The
// five payout legs sum to totalProfit in all 252 emitted so far, and every one
// of them was paid in native ETH.
const arbitrageProfitSplitAbi =
  "event ArbitrageProfitSplit(address indexed profitCurrency, address indexed trader, address indexed creator, uint256 totalProfit, uint256 traderAmount, uint256 creatorAmount, uint256 triggerPoolAmount, uint256 wthProtocolAmount, uint256 hookrProtocolAmount)";

// One historical distribution the hook reported in a currency it did not pay
// in. An earlier arbitrage executor could return profit to the hook in WETH
// and USDG together, and the event carried the sum of the two under a single
// currency — USDG — without normalising the eighteen-decimal leg to USDG's
// six. Read as written, 0xd7f5db62… (block 42136833) claims a rebate of
// 35,112,763 USDG, nine per cent of all USDG in existence, in a transaction
// whose recipient received 0.00000878 WETH. Left in, this single event takes
// the adapter from roughly $750 a day to $87M, and reports the protocol as
// having distributed more than it has ever turned over.
//
// The executor has since been patched: mixed profit is now normalised to the
// trigger pool's base currency before the event is emitted, so this cannot
// recur. Excluded by hash rather than by rule for that reason — a heuristic
// would outlive the defect it guards against.
const EXCLUDED_TX = new Set([
  // https://robinhoodchain.blockscout.com/tx/0xd7f5db626f84477bd4d3c7dded329c809e1b6e63dda4afe1a39b672b23a30ee7
  // The receipt carries the ProfitCurrencyDistribute event next to the
  // transfers it is meant to describe: the largest USDG movement in the
  // transaction is 1,256, and the recipient's only credit is 0.00000878 WETH.
  "0xd7f5db626f84477bd4d3c7dded329c809e1b6e63dda4afe1a39b672b23a30ee7",
]);

const LABEL = {
  captured: METRIC.MEV_REWARDS,
  toTraders: "MEV Rewards To Traders",
  toLPs: "MEV Rewards To LPs",
  toProtocol: "MEV Rewards To Protocol",
  toReferrers: "MEV Rewards To Referrers",
  toPartners: "MEV Rewards To Partners",
};

// amounts per transaction and currency family — every leg of one
// distribution shares both
type Ledger = Map<string, Map<string, bigint>>;
const ledger = (): Ledger => new Map();
const put = (l: Ledger, tx: string, currency: string, amount: bigint) => {
  if (amount === 0n) return;
  const row = l.get(tx) ?? new Map<string, bigint>();
  const key = family(currency);
  row.set(key, (row.get(key) ?? 0n) + amount);
  l.set(tx, row);
};
const take = (l: Ledger, tx: string, key: string): bigint => l.get(tx)?.get(key) ?? 0n;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  // left empty on purpose and returned anyway: swappers are paid by this hook,
  // never charged, so a reported zero is the fact — omitting it would leave
  // consumers unable to tell that apart from a dimension nobody measured
  const dailyUserFees = createBalances();

  const add = (bal: any, currency: string, amount: bigint, label: string) => {
    if (amount <= 0n) return;
    if (!currency || currency === NATIVE) bal.addGasToken(amount, label);
    else bal.add(currency, amount, label);
  };
  const low = (s: any) => String(s).toLowerCase();
  const big = (v: any) => BigInt(v.toString());

  // entireLog keeps the transaction hash, which onlyArgs — the default —
  // discards; the decoded fields then live under log.args
  const logOptions = { entireLog: true, parseLog: true };

  // 1. what the hook captured — this is Fees, and the set of transactions
  //    every other event is joined to. The currency the hook names is the one
  //    everything in that transaction is booked in.
  const totals = ledger();
  const bookedIn = new Map<string, Map<string, string>>();
  const pcdLogs = await getLogs({ target: HOOK, eventAbi: profitDistributeAbi, ...logOptions });
  for (const log of pcdLogs) {
    const tx = low(log.transactionHash);
    if (EXCLUDED_TX.has(tx)) continue;
    const currency = low(log.args.currency);
    put(totals, tx, currency, big(log.args.swapperAmount) + big(log.args.lpAmount));
    const names = bookedIn.get(tx) ?? new Map<string, string>();
    if (!names.has(family(currency))) names.set(family(currency), currency);
    bookedIn.set(tx, names);
  }

  // 2. the treasury's share and the referral share, emitted by the executor
  //    in the distributing transaction. Only an executor's own logs count,
  //    and only inside a transaction the hook distributed in; no leg may
  //    exceed what the hook reported for that transaction and currency.
  //
  //    The emitter is checked on the log rather than passed as `targets`,
  //    which the SDK fans out into one request per address: ten executors
  //    across two events is twenty requests for a single hourly slot, and the
  //    public RPCs start answering 429 long before the day is done. The log's
  //    own address is the emitter, so this authenticates exactly as well for
  //    a tenth of the traffic.
  const retained = ledger();
  const referred = ledger();
  const fromExecutor = (log: any) => EXECUTOR_SET.has(low(log.address));
  for (const log of await getLogs({ noTarget: true, eventAbi: protocolRevenueAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (!totals.has(tx) || !fromExecutor(log)) continue;
    put(retained, tx, low(log.args.token), big(log.args.amount));
  }
  for (const log of await getLogs({ noTarget: true, eventAbi: referralRewardedAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (!totals.has(tx) || !fromExecutor(log)) continue;
    put(referred, tx, low(log.args.token), big(log.args.amount));
  }

  // 2b. the splits. A transaction the hook also distributed in is left to the
  //     booking loop, which reads the split as the authority for that total;
  //     every other one is an arbitrage of the integration's own and is booked
  //     on its own terms in step 5. Thirty-nine of the 213 transactions so far
  //     carry more than one split, so they accumulate rather than replace.
  //     The emitter is checked on the log rather than passed as targets, for
  //     the same reason as the events above: one request instead of four.
  const splitTotals = ledger();
  const splitRetained = ledger();
  const ownSplits: { currency: string; total: bigint; kept: bigint }[] = [];
  for (const log of await getLogs({ noTarget: true, eventAbi: arbitrageProfitSplitAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (!SPLIT_EMITTER_SET.has(low(log.address))) continue;
    const currency = low(log.args.profitCurrency);
    const total = big(log.args.totalProfit);
    const kept = big(log.args.wthProtocolAmount);
    if (totals.has(tx)) {
      put(splitTotals, tx, currency, total);
      put(splitRetained, tx, currency, kept);
      continue;
    }
    ownSplits.push({ currency, total, kept });
  }

  // 3. what went to liquidity providers: the PoolManager's Donate events sent
  //    by an executor inside one of those transactions. Whose pool it was is
  //    read from the pool id alone, and the amount is booked in the currency
  //    the hook named for that transaction, because the executor donates out
  //    of the profit it has just reported. Checked over the hook's whole
  //    history: all 10,678 donation legs into outside pools carried exactly
  //    one non-zero amount, and every one of them was in the named currency.
  //    A protocol pool needs no such argument: its two tokens are known.
  const toProtocolPools = ledger();
  const toOtherPools = ledger();
  const donateLogs = await getLogs({ target: POOL_MANAGER, eventAbi: donateAbi, ...logOptions });
  for (const log of donateLogs) {
    const tx = low(log.transactionHash);
    if (!totals.has(tx) || !EXECUTOR_SET.has(low(log.args.sender))) continue;
    const own = PROTOCOL_POOLS[low(log.args.id)];
    if (own) {
      // a protocol pool: each side goes in under its own token, so a WETH
      // donation inside a transaction the hook named in USDG stays WETH and
      // simply finds no total to come off — left in the cashback remainder,
      // exactly as the previous adapter left it
      put(toProtocolPools, tx, own[0], big(log.args.amount0));
      put(toProtocolPools, tx, own[1], big(log.args.amount1));
      continue;
    }
    const named = bookedIn.get(tx);
    if (!named) continue;
    const amount = big(log.args.amount0) + big(log.args.amount1);
    if (amount === 0n) continue;
    // every one of the 10,678 donation legs into an outside pool carried a
    // single non-zero amount in the currency the hook had already named, so
    // the named currency identifies it; the cap in step 4 bounds it anyway
    for (const currency of named.values()) { put(toOtherPools, tx, currency, amount); break; }
  }

  // 4. book every transaction: Fees is the hook's total; the treasury legs are
  //    Revenue; donations to other pools, referral and the remaining cashback
  //    are supply-side. Every leg is taken in the currency the hook named, so
  //    the three supply-side legs plus Revenue equal Fees exactly and the
  //    breakdowns line up without a late subtract.
  //
  //    A treasury or referral leg paid in a currency the hook did not name
  //    for that transaction cannot be taken off that total without a price, so
  //    it is left inside the cashback remainder rather than added on top:
  //    revenue is understated by that much, and Fees still equals Revenue plus
  //    supply-side. A donation can no longer fall into that case — it is
  //    booked in the named currency by construction.
  const min = (a: bigint, b: bigint) => (a < b ? a : b);
  for (const [tx, row] of totals) {
    for (const [key, total] of row) {
      const currency = bookedIn.get(tx)!.get(key)!;
      let left = total;
      // a transaction whose split was stated outright: what it says the
      // protocol kept is Revenue and the rest is the partner's to pay on. The
      // legs an executor leaves in the same receipt are passed over, so
      // nothing is counted twice and the two still sum to the hook's total.
      if (take(splitTotals, tx, key) > 0n) {
        const kept = min(left, take(splitRetained, tx, key));
        left -= kept;
        add(dailyFees, currency, total, LABEL.captured);
        add(dailyRevenue, currency, kept, LABEL.toProtocol);
        add(dailyProtocolRevenue, currency, kept, LABEL.toProtocol);
        add(dailySupplySideRevenue, currency, left, LABEL.toPartners);
        continue;
      }
      const protocol = min(left, take(retained, tx, key) + take(toProtocolPools, tx, key));
      left -= protocol;
      const lps = min(left, take(toOtherPools, tx, key));
      left -= lps;
      const referral = min(left, take(referred, tx, key));
      left -= referral;
      add(dailyFees, currency, total, LABEL.captured);
      add(dailyRevenue, currency, protocol, LABEL.toProtocol);
      add(dailyProtocolRevenue, currency, protocol, LABEL.toProtocol);
      add(dailySupplySideRevenue, currency, lps, LABEL.toLPs);
      add(dailySupplySideRevenue, currency, referral, LABEL.toReferrers);
      add(dailySupplySideRevenue, currency, left, LABEL.toTraders);
    }
  }

  // 5. the integration's own arbitrage, which the hook never sees. The event
  //    is the only report of it, so the profit it names is Fees, the share it
  //    names for the protocol is Revenue, and the remainder is the partner's.
  for (const { currency, total, kept } of ownSplits) {
    const protocol = min(total, kept);
    add(dailyFees, currency, total, LABEL.captured);
    add(dailyRevenue, currency, protocol, LABEL.toProtocol);
    add(dailyProtocolRevenue, currency, protocol, LABEL.toProtocol);
    add(dailySupplySideRevenue, currency, total - protocol, LABEL.toPartners);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees };
};

const methodology = {
  Fees: "The arbitrage profit the hook realises and distributes, summed from the ProfitCurrencyDistribute event the hook emits on every distribution, plus the profit the HOOKR integration reports in its own ArbitrageProfitSplit event. The hook closes the price gap a swap opens between connected pools within the same transaction, so this is value recaptured from MEV rather than a fee charged to anyone.",
  Revenue: "The share of that profit retained by the protocol treasury: the executor's ProtocolRevenue event (90% on WTH's own pools, 40% on pools that integrate WTH, since 2 September 2026) plus any profit donated into WTH's own pools, which was the treasury's income before that event existed. On an arbitrage run by the HOOKR integration it is the wthProtocolAmount leg of the ArbitrageProfitSplit event, a tenth of that profit so far.",
  ProtocolRevenue: "Same as Revenue — nothing is distributed to token holders on chain.",
  SupplySideRevenue: "Everything not retained: the cashback paid to the trader whose swap created the opportunity, the profit donated to the liquidity providers of integrating pools, any referral share paid to an integrating partner, and, on an arbitrage run by the HOOKR integration, the whole of the profit the protocol did not keep — the partner pays the trader, the trigger pool and its own treasury out of it.",
  UserFees: "Zero. Users are not charged by the hook; a swapper receives cashback rather than paying anything.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.captured]: "Arbitrage profit captured by the hook when a swap moves one pool away from a connected pool, closed out in the same transaction.",
  },
  Revenue: {
    [LABEL.toProtocol]: "Retained by the protocol treasury: the executor's ProtocolRevenue event, the wthProtocolAmount leg of an ArbitrageProfitSplit, plus profit donated into WTH's own pools.",
  },
  ProtocolRevenue: {
    [LABEL.toProtocol]: "Retained by the protocol treasury: the executor's ProtocolRevenue event, the wthProtocolAmount leg of an ArbitrageProfitSplit, plus profit donated into WTH's own pools.",
  },
  SupplySideRevenue: {
    [LABEL.toTraders]: "Cashback paid to the trader whose swap created the arbitrage opportunity.",
    [LABEL.toLPs]: "Donated to the liquidity providers of the integrating pool the profit was taken from.",
    [LABEL.toReferrers]: "Referral share paid to the partner that integrated the pool, where one is configured.",
    [LABEL.toPartners]: "Profit handed to an integrating partner on an arbitrage it ran itself — the whole of what the protocol did not keep. The partner pays the trader's cashback, the trigger pool's liquidity providers and its own treasury out of it.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-08-04', // hook deployment, block 27190942
  methodology,
  breakdownMethodology,
  pullHourly: true,
  doublecounted: true, // uni-v4
};

export default adapter;
