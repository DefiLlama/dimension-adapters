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
const PROTOCOL_POOLS = new Set([
  // WTH/WETH #1 — https://dexscreener.com/robinhood/0x79723a75c401d5c3ad66b0d0837739e502f08799ebf6a503e6e4d0827b3eb7e5
  "0x79723a75c401d5c3ad66b0d0837739e502f08799ebf6a503e6e4d0827b3eb7e5",
  // WTH/WETH #2 — https://dexscreener.com/robinhood/0x6ff5c44dbae70efd0c5124979b803395163c8e93e7d1f97a7fcdeb1ed875f5c2
  "0x6ff5c44dbae70efd0c5124979b803395163c8e93e7d1f97a7fcdeb1ed875f5c2",
]);

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
];
const EXECUTOR_SET = new Set(EXECUTORS);

// Every signature below was checked against the topics the deployed contracts
// actually emit:
//   ProfitCurrencyDistribute 0x7b1f2ac966718a4fe501511d1cdc7d0671a76732a9213ee292a41bffdd8051fa
//   Donate                   0x29ef05caaff9404b7cb6d1c0e9bbae9eaa7ab2541feba1a9c4248594c08156cb
//   ProtocolRevenue          0x72a888fd93a6302c4cb123dfe9b12b97a7188a0c3f5a2d917802936032538848
// ReferralRewarded is taken from the executor's interface; no pool has a
// referral configured yet, so it has not been observed on chain.
const profitDistributeAbi =
  "event ProfitCurrencyDistribute(address indexed recipient, address indexed currency, uint256 swapperAmount, uint256 lpAmount)";
const donateAbi = "event Donate(bytes32 indexed id, address indexed sender, uint256 amount0, uint256 amount1)";
const protocolRevenueAbi = "event ProtocolRevenue(address indexed token, uint256 amount)";
const referralRewardedAbi = "event ReferralRewarded(address indexed token, address indexed recipient, uint256 amount)";

// v4 uses the zero address for native ETH; pools also settle in WETH and USDG.
// The hook reports a WETH-pool distribution in WETH while the executor pays the
// treasury and the pools in native ETH out of the same profit, so the two are
// one currency for the purpose of splitting a transaction's total.
const NATIVE = "0x0000000000000000000000000000000000000000";
// https://robinhoodchain.blockscout.com/token/0x0Bd7d308F8e1639fAB988DF18A8011f41EacAd73
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const family = (currency: string) => (currency === NATIVE || currency === WETH ? "eth" : currency);

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
  //    in the distributing transaction. Only the executors' own logs count,
  //    and only inside a transaction the hook distributed in; no leg may
  //    exceed what the hook reported for that transaction and currency.
  const retained = ledger();
  const referred = ledger();
  for (const log of await getLogs({ targets: EXECUTORS, eventAbi: protocolRevenueAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (!totals.has(tx)) continue;
    put(retained, tx, low(log.args.token), big(log.args.amount));
  }
  for (const log of await getLogs({ targets: EXECUTORS, eventAbi: referralRewardedAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (!totals.has(tx)) continue;
    put(referred, tx, low(log.args.token), big(log.args.amount));
  }

  // 3. what went to liquidity providers: the PoolManager's Donate events sent
  //    by an executor inside one of those transactions. Whose pool it was is
  //    read from the pool id alone, and the amount is booked in the currency
  //    the hook named for that transaction, because the executor donates out
  //    of the profit it has just reported. Checked over the hook's whole
  //    history: all 10,678 donation legs into outside pools carried exactly
  //    one non-zero amount, and every one of them was in the named currency.
  const toProtocolPools = ledger();
  const toOtherPools = ledger();
  const donateLogs = await getLogs({ target: POOL_MANAGER, eventAbi: donateAbi, ...logOptions });
  for (const log of donateLogs) {
    const tx = low(log.transactionHash);
    if (!totals.has(tx) || !EXECUTOR_SET.has(low(log.args.sender))) continue;
    const named = bookedIn.get(tx);
    if (!named) continue;
    const amount = big(log.args.amount0) + big(log.args.amount1);
    if (amount === 0n) continue;
    const book = PROTOCOL_POOLS.has(low(log.args.id)) ? toProtocolPools : toOtherPools;
    // one currency per distribution on every record so far; were a transaction
    // ever to carry two, the donation follows the first and the cap in step 4
    // keeps it from exceeding what the hook reported
    for (const currency of named.values()) { put(book, tx, currency, amount); break; }
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

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees };
};

const methodology = {
  Fees: "The arbitrage profit the hook realises and distributes, summed from the ProfitCurrencyDistribute event the hook emits on every distribution. The hook closes the price gap a swap opens between connected pools within the same transaction, so this is value recaptured from MEV rather than a fee charged to anyone.",
  Revenue: "The share of that profit retained by the protocol treasury: the executor's ProtocolRevenue event (90% on WTH's own pools, 40% on pools that integrate WTH, since 2 September 2026) plus any profit donated into WTH's own pools, which was the treasury's income before that event existed.",
  ProtocolRevenue: "Same as Revenue — nothing is distributed to token holders on chain.",
  SupplySideRevenue: "Everything not retained: the cashback paid to the trader whose swap created the opportunity, the profit donated to the liquidity providers of integrating pools, and any referral share paid to an integrating partner.",
  UserFees: "Zero. Users are not charged by the hook; a swapper receives cashback rather than paying anything.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.captured]: "Arbitrage profit captured by the hook when a swap moves one pool away from a connected pool, closed out in the same transaction.",
  },
  Revenue: {
    [LABEL.toProtocol]: "Retained by the protocol treasury: the executor's ProtocolRevenue event, plus profit donated into WTH's own pools.",
  },
  ProtocolRevenue: {
    [LABEL.toProtocol]: "Retained by the protocol treasury: the executor's ProtocolRevenue event, plus profit donated into WTH's own pools.",
  },
  SupplySideRevenue: {
    [LABEL.toTraders]: "Cashback paid to the trader whose swap created the arbitrage opportunity.",
    [LABEL.toLPs]: "Donated to the liquidity providers of the integrating pool the profit was taken from.",
    [LABEL.toReferrers]: "Referral share paid to the partner that integrated the pool, where one is configured.",
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
