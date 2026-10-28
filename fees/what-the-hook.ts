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
// So a split is booked as a distribution of its own — the profit it captured
// is Fees, wthProtocolAmount is Revenue, and the rest is the partner's, which
// pays the trader, the trigger pool and its own treasury out of it. That holds
// inside a hook transaction too. Between 5 and 8 October 2026 six of the
// integration's splits landed in a transaction the hook also distributed in,
// in the same currency, and in each the treasury was paid the split's share
// apart from the hook's: two arbitrages, two incomes. Only a split emitted by
// the hook's own executor for the integration could repeat money the reading
// above already counts, because that executor also emits the ProtocolRevenue
// it uses; such a split alone is dropped where the hook distributed in the
// same transaction and currency.
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
//
// On 4 October 2026 a second hook went live (v2, block 79751029) beside the
// first, which keeps running. The v2 hook emits no distribution event itself:
// each of its executors emits ProfitCurrencyDistribute, and there the two
// amounts are the ones the executor pays out — the swapper's cashback and the
// LPs' share. The treasury's share (ProtocolRevenue), a referral
// (ReferralRewarded) and an integrating partner's cut (PartnerRevenue) are
// paid on top of them, so on a v2 distribution every leg is added rather than
// taken out of a total: Fees is the sum of the legs. Checked on chain up to
// block 89108115 (15 October 2026): the 10,491 such events carry no other
// currency than ETH, WETH and USDG, and the USDG ones are USDG amounts (the
// largest 248 USDG), not a wei amount mislabelled.
//
// Since 13 October 2026 the v2 executor is shared with DELTA, whose own hook,
// on its own pools, names the same executor. A distribution started in a
// DELTA pool is paid by the same executor in the same shape and pays What The
// Hook's treasury the same ProtocolRevenue, with DELTA's cut as
// PartnerRevenue — paid beside the treasury's share, not out of it. It is
// counted the way the HOOKR integration's arbitrage is: the treasury's share
// is Revenue, the partner's cut and the rest are supply-side.
//
// And since 7 October 2026 a recapture executor for the HOOKR integration
// states each recapture in one ProfitRecaptured event: the treasury's share,
// which is What The Hook's, and the share it assigns to the hook of the pool
// it names. A recapture is an arbitrage of its own and counts in full, also
// in a transaction where the hook distributed in the same currency — 155 of
// the first 2,206 did, and in every one the treasury was paid the
// recapture's share apart from the hook's.

// https://robinhoodchain.blockscout.com/address/0xc52fc52698479e42f0da9a8a75296ec3871454c0
const HOOK = "0xc52fc52698479e42f0da9a8a75296ec3871454c0";
// The v2 hook, live 4 October 2026 at block 79751029 —
// 0x58a6ef29ddcdb064a72b550a78d84a8e065994c0. It emits no distribution
// event; its distributions are read from its executors, V2_EXECUTORS below.
// https://robin.etherscan.io/address/0x58A6eF29ddCdb064A72b550a78D84a8e065994C0
// v4 uses the zero address for native ETH; the pools settle in WETH and USDG.
// The hook reports a WETH-pool distribution in WETH while the executor pays
// the treasury and the pools in native ETH out of the same profit, so the two
// are one currency for the purpose of splitting a transaction's total.
const NATIVE = ADDRESSES.null;
// https://robinhoodchain.blockscout.com/token/0x0Bd7d308F8e1639fAB988DF18A8011f41EacAd73
const WETH = ADDRESSES.robinhood.WETH.toLowerCase(); // compared against lowercased log currencies in family()
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

// Every executor of the v2 hook. Each one emits ProfitCurrencyDistribute
// itself, with the amounts it actually paid, and pays ProtocolRevenue,
// ReferralRewarded and PartnerRevenue on top. Kept apart from EXECUTORS: the
// first hook's reading subtracts its executors' legs from the hook's total,
// this one adds them, and a transaction can carry both. Only an address in
// this list counts — an event signature does not authenticate its emitter —
// so a new generation has to be appended here, or its distributions stop
// being counted. The hook's executor() names the live one.
const V2_EXECUTORS = [
  // https://robin.etherscan.io/address/0xBc1E2bB1f1b6c99dc0C194797076589C4F328bed
  "0xbc1e2bb1f1b6c99dc0c194797076589c4f328bed", // gen-14, 2026-10-04 to 10-06
  // https://robin.etherscan.io/address/0x79179D07038c8131E0776746B271c6e69B65a6e3
  "0x79179d07038c8131e0776746b271c6e69b65a6e3", // gen-15, 2026-10-06 to 10-09
  // https://robin.etherscan.io/address/0x47A8a386Ec5D83B535899E73e4efF40dCaec21D3
  "0x47a8a386ec5d83b535899e73e4eff40dcaec21d3", // gen-16, 2026-10-09 to 10-10
  // https://robin.etherscan.io/address/0x867E78Db593F0E783370cC75eBE162Cb5B83877B
  "0x867e78db593f0e783370cc75ebe162cb5b83877b", // gen-17, 2026-10-10 to 10-13
  // https://robin.etherscan.io/address/0x150776A8c3baa8B22b49d40694b22b9C1D6FdB3C
  "0x150776a8c3baa8b22b49d40694b22b9c1d6fdb3c", // minutes on 2026-10-13, thirteen distributions
  // gen-18, from 2026-10-13 (first distribution at block 87527285): the v2
  // hook's executor and DELTA's, and the first to emit PartnerRevenue
  // https://robin.etherscan.io/address/0xF2Ca86F11d46b8b1DE41974012052d93ef2785aC
  "0xf2ca86f11d46b8b1de41974012052d93ef2785ac",
];
const V2_EXECUTOR_SET = new Set(V2_EXECUTORS);
const ALL_EXECUTORS = [...EXECUTORS, ...V2_EXECUTORS];

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

// The HOOKR integration's recapture executor, which states each recapture in
// a ProfitRecaptured event instead: the treasury's share and the share it
// assigns to the hook of the pool it names. First recapture at block
// 82583663, on 7 October 2026. Checked the same way as the split emitters,
// for the same reason.
// https://robin.etherscan.io/address/0x4B4c16681401454140a9dBca55e5c186BBE8D728
const RECAPTURE_EMITTERS = ["0x4b4c16681401454140a9dbca55e5c186bbe8d728"];
const RECAPTURE_EMITTER_SET = new Set(RECAPTURE_EMITTERS);

// Every signature below was checked against the topics the deployed contracts
// actually emit:
//   ProfitCurrencyDistribute 0x7b1f2ac966718a4fe501511d1cdc7d0671a76732a9213ee292a41bffdd8051fa
//   Donate                   0x29ef05caaff9404b7cb6d1c0e9bbae9eaa7ab2541feba1a9c4248594c08156cb
//   ProtocolRevenue          0x72a888fd93a6302c4cb123dfe9b12b97a7188a0c3f5a2d917802936032538848
//   ArbitrageProfitSplit     0x65c47530703d4eca41f937917aa3f3a7a33c3d85bfb8bc9ebaaaf27f8b57ef6a
//   ReferralRewarded         0xb2dee5f49e7a09a5d7c95cd4dd5dc6410eea65d4e14519d6d3a6e14c8cf0e0e9
//   PartnerRevenue           0x50d1447fe9b73d791ca8ae27721bf7f49cae6112b8ef3098c1f974d6611b2d6a
//   ProfitRecaptured         0x3e2f33c038395a3bf434490726de692ff4f95f953e9d92e972eb35733a3707ca
// ReferralRewarded is emitted by the v2 executors only; the first hook's
// executors carry it in their interface and have never emitted it.
const profitDistributeAbi =
  "event ProfitCurrencyDistribute(address indexed recipient, address indexed currency, uint256 swapperAmount, uint256 lpAmount)";
const donateAbi = "event Donate(bytes32 indexed id, address indexed sender, uint256 amount0, uint256 amount1)";
const protocolRevenueAbi = "event ProtocolRevenue(address indexed token, uint256 amount)";
const referralRewardedAbi = "event ReferralRewarded(address indexed token, address indexed recipient, uint256 amount)";
// A v2 executor's payment to an integrating partner whose pool started the
// arbitrage — DELTA's cut, so far.
const partnerRevenueAbi = "event PartnerRevenue(address indexed recipient, address indexed token, uint256 amount)";
// One recapture: the treasury's share and the share of the pool's hook.
const profitRecapturedAbi =
  "event ProfitRecaptured(bytes32 indexed poolId, address indexed currency, uint256 treasuryAmount, uint256 hookAmount)";
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
  //
  //    Read from the first hook and every v2 executor in one list and sorted
  //    by emitter: the first hook's events go to that reading, a v2
  //    executor's to the v2 one.
  const totals = ledger();
  const bookedIn = new Map<string, Map<string, string>>();
  // v2: what the executor declared it paid, per transaction and currency
  const v2Cash: { currency: string; amount: bigint }[] = [];
  const v2Lp: { currency: string; amount: bigint }[] = [];
  const v2Txs = new Set<string>();
  const pcdLogs = await getLogs({ targets: [HOOK, ...V2_EXECUTORS], eventAbi: profitDistributeAbi, ...logOptions });
  for (const log of pcdLogs) {
    const tx = low(log.transactionHash);
    if (EXCLUDED_TX.has(tx)) continue;
    const emitter = low(log.address);
    const currency = low(log.args.currency);
    if (emitter === HOOK) {
      put(totals, tx, currency, big(log.args.swapperAmount) + big(log.args.lpAmount));
      const names = bookedIn.get(tx) ?? new Map<string, string>();
      if (!names.has(family(currency))) names.set(family(currency), currency);
      bookedIn.set(tx, names);
    } else if (V2_EXECUTOR_SET.has(emitter)) {
      v2Txs.add(tx);
      v2Cash.push({ currency, amount: big(log.args.swapperAmount) });
      v2Lp.push({ currency, amount: big(log.args.lpAmount) });
    }
  }

  // 2. the treasury's share and the referral share, emitted by the executor
  //    in the distributing transaction. Only an executor's own logs count,
  //    and only inside a transaction the hook distributed in; no leg may
  //    exceed what the hook reported for that transaction and currency.
  //
  //    Every executor is passed as `targets` — the log indexer takes the
  //    whole list in one query — and the log's own address is checked again,
  //    because a filter asked of a node is not a proof.
  //
  //    A v2 executor's legs are kept apart: they are paid on top of what it
  //    declared, inside a transaction it distributed in, each in the currency
  //    it was paid in — nothing is taken out of anything, so a leg in another
  //    currency than the declared one needs no price to stay exact.
  const retained = ledger();
  const referred = ledger();
  const fromExecutor = (log: any) => EXECUTOR_SET.has(low(log.address));
  const fromV2 = (log: any) => V2_EXECUTOR_SET.has(low(log.address)) && v2Txs.has(low(log.transactionHash));
  const v2Prot: { currency: string; amount: bigint }[] = [];
  const v2Ref: { currency: string; amount: bigint }[] = [];
  const v2Partner: { currency: string; amount: bigint }[] = [];
  const v2RefPaid = new Map<string, number>();
  for (const log of await getLogs({ targets: ALL_EXECUTORS, eventAbi: protocolRevenueAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (fromV2(log)) {
      v2Prot.push({ currency: low(log.args.token), amount: big(log.args.amount) });
      continue;
    }
    if (!totals.has(tx) || !fromExecutor(log)) continue;
    put(retained, tx, low(log.args.token), big(log.args.amount));
  }
  for (const log of await getLogs({ targets: ALL_EXECUTORS, eventAbi: referralRewardedAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    if (fromV2(log)) {
      const currency = low(log.args.token);
      v2Ref.push({ currency, amount: big(log.args.amount) });
      const key = `${tx}|${family(currency)}|${big(log.args.amount)}|${low(log.args.recipient)}`;
      v2RefPaid.set(key, (v2RefPaid.get(key) ?? 0) + 1);
      continue;
    }
    if (!totals.has(tx) || !fromExecutor(log)) continue;
    put(referred, tx, low(log.args.token), big(log.args.amount));
  }
  // one payment reported under both events is counted once: a
  // PartnerRevenue naming the same transaction, currency, amount and
  // recipient as a ReferralRewarded is already counted there. None has so far.
  for (const log of await getLogs({ targets: V2_EXECUTORS, eventAbi: partnerRevenueAbi, ...logOptions })) {
    if (!fromV2(log)) continue;
    const currency = low(log.args.token);
    const key = `${low(log.transactionHash)}|${family(currency)}|${big(log.args.amount)}|${low(log.args.recipient)}`;
    const said = v2RefPaid.get(key) ?? 0;
    if (said > 0) {
      v2RefPaid.set(key, said - 1);
      continue;
    }
    v2Partner.push({ currency, amount: big(log.args.amount) });
  }

  // 2b. the splits: each an arbitrage of the integration's own, booked in
  //     step 5, including one in a transaction the hook also distributed in —
  //     the treasury is paid the split's share apart from the hook's there.
  //     Only a split from the hook's own executor for the integration is
  //     dropped where the hook distributed in the same transaction and
  //     currency, since that executor's ProtocolRevenue is already read in
  //     step 2. The currency matters as much as the transaction — a hook
  //     distribution in USDG says nothing about a split paid in ETH in the
  //     same receipt. Thirty-nine of the first 213 transactions carried more
  //     than one split, so they accumulate rather than replace.
  const ownSplits: { currency: string; total: bigint; kept: bigint }[] = [];
  for (const log of await getLogs({ targets: SPLIT_EMITTERS, eventAbi: arbitrageProfitSplitAbi, ...logOptions })) {
    const tx = low(log.transactionHash);
    const emitter = low(log.address);
    // the query already asks for these emitters; the log's own address is
    // checked again because a filter asked of a node is not a proof
    if (!SPLIT_EMITTER_SET.has(emitter)) continue;
    const currency = low(log.args.profitCurrency);
    if (EXECUTOR_SET.has(emitter) && totals.get(tx)?.has(family(currency))) continue;
    ownSplits.push({ currency, total: big(log.args.totalProfit), kept: big(log.args.wthProtocolAmount) });
  }
  // the recaptures: each one an arbitrage of its own whose treasury share is
  // paid by itself, so every one counts, whatever else the transaction carries
  const recaptures: { currency: string; kept: bigint; handed: bigint }[] = [];
  for (const log of await getLogs({ targets: RECAPTURE_EMITTERS, eventAbi: profitRecapturedAbi, ...logOptions })) {
    if (!RECAPTURE_EMITTER_SET.has(low(log.address))) continue;
    recaptures.push({ currency: low(log.args.currency), kept: big(log.args.treasuryAmount), handed: big(log.args.hookAmount) });
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

  // 6. the v2 hook's distributions: every leg the executor paid, each in its
  //    own currency. Fees is their sum, so Fees still equals Revenue plus
  //    supply-side exactly.
  const both = (currency: string, amount: bigint, bal: any, label: string) => {
    add(dailyFees, currency, amount, LABEL.captured);
    add(bal, currency, amount, label);
  };
  for (const { currency, amount } of v2Cash) both(currency, amount, dailySupplySideRevenue, LABEL.toTraders);
  for (const { currency, amount } of v2Lp) both(currency, amount, dailySupplySideRevenue, LABEL.toLPs);
  for (const { currency, amount } of v2Prot) {
    both(currency, amount, dailyRevenue, LABEL.toProtocol);
    add(dailyProtocolRevenue, currency, amount, LABEL.toProtocol);
  }
  for (const { currency, amount } of v2Ref) both(currency, amount, dailySupplySideRevenue, LABEL.toReferrers);
  for (const { currency, amount } of v2Partner) both(currency, amount, dailySupplySideRevenue, LABEL.toPartners);

  // 7. the HOOKR integration's recaptures: the treasury's share is Revenue,
  //    the share assigned to the pool's hook is the partner's
  for (const { currency, kept, handed } of recaptures) {
    both(currency, kept, dailyRevenue, LABEL.toProtocol);
    add(dailyProtocolRevenue, currency, kept, LABEL.toProtocol);
    both(currency, handed, dailySupplySideRevenue, LABEL.toPartners);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyUserFees };
};

const methodology = {
  Fees: "The arbitrage profit the hook realises and distributes, summed from the ProfitCurrencyDistribute event the first hook emits on every distribution; for the v2 hook (since 4 October 2026), every leg its executor pays — the swapper's cashback and the LPs' share it declares in ProfitCurrencyDistribute, plus the ProtocolRevenue, ReferralRewarded and PartnerRevenue it pays on top, including on the DELTA integration that shares the executor; plus the profit the HOOKR integration reports in its own ArbitrageProfitSplit and ProfitRecaptured events. The hook closes the price gap a swap opens between connected pools within the same transaction, so this is value recaptured from MEV rather than a fee charged to anyone.",
  Revenue: "The share of that profit retained by the protocol treasury: the executor's ProtocolRevenue event (90% on WTH's own pools, 40% on pools that integrate WTH, since 2 September 2026; on the v2 hook's distributions and on the DELTA integration's, paid on top of the declared amounts) plus any profit donated into WTH's own pools, which was the treasury's income before that event existed. On an arbitrage run by the HOOKR integration it is the wthProtocolAmount leg of the ArbitrageProfitSplit event, and on a recapture the treasuryAmount of the ProfitRecaptured event.",
  ProtocolRevenue: "Same as Revenue — nothing is distributed to token holders on chain.",
  SupplySideRevenue: "Everything not retained: the cashback paid to the trader whose swap created the opportunity, the profit donated to the liquidity providers of integrating pools, any referral share paid to an integrating partner, an integrating partner's cut (PartnerRevenue — DELTA's, on arbitrage started in its pools), and, on an arbitrage run by the HOOKR integration, the whole of the profit the protocol did not keep — the partner pays the trader, the trigger pool and its own treasury out of it; on a recapture, the hookAmount the event assigns to the pool's hook.",
  UserFees: "Zero. Users are not charged by the hook; a swapper receives cashback rather than paying anything.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.captured]: "Arbitrage profit captured by the hook when a swap moves one pool away from a connected pool, closed out in the same transaction — on the v2 hook, every leg its executor pays — together with the profit an integrating partner's own arbitrage reports in its ArbitrageProfitSplit or ProfitRecaptured event.",
  },
  Revenue: {
    [LABEL.toProtocol]: "Retained by the protocol treasury: the executor's ProtocolRevenue event, the wthProtocolAmount leg of an ArbitrageProfitSplit, the treasuryAmount of a ProfitRecaptured, plus profit donated into WTH's own pools.",
  },
  ProtocolRevenue: {
    [LABEL.toProtocol]: "Retained by the protocol treasury: the executor's ProtocolRevenue event, the wthProtocolAmount leg of an ArbitrageProfitSplit, the treasuryAmount of a ProfitRecaptured, plus profit donated into WTH's own pools.",
  },
  SupplySideRevenue: {
    [LABEL.toTraders]: "Cashback paid to the trader whose swap created the arbitrage opportunity.",
    [LABEL.toLPs]: "Donated to the liquidity providers of the integrating pool the profit was taken from.",
    [LABEL.toReferrers]: "Referral share paid to the referrer configured for the pool, where one is.",
    [LABEL.toPartners]: "Profit handed to an integrating partner: on an arbitrage it ran itself, the whole of what the protocol did not keep (the partner pays the trader's cashback, the trigger pool's liquidity providers and its own treasury out of it); on a recapture, the hookAmount the event assigns to the pool's hook; and the PartnerRevenue a v2 executor pays a partner whose pool started the arbitrage (DELTA).",
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
