import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// What The Hook — a Uniswap v4 hook on Robinhood Chain.
//
// The hook backruns the swap that creates an imbalance: when a trade moves one
// pool away from a connected pool, it closes the gap inside the same
// transaction and returns the realised profit to the trader who caused it and
// to the LPs of the pool it came out of. It is arbitrage that would otherwise
// be taken by an outside searcher, which is why it is reported under MEV
// Rewards rather than as a swap fee — no fee rate exists and nobody is charged.
//
// Everything is read from ProfitCurrencyDistribute, which the hook emits once
// per distribution carrying both legs and the currency they are paid in.
// Nothing is derived from a rate times a trade size.
//
// The whole of it is supply-side, so Revenue is zero, and that is a property of
// the contract rather than a modelling choice: profit is realised and paid out
// within the triggering transaction, and the hook and every arbitrage executor
// it has used hold a zero balance in ETH, WETH and USDG. The hook does support
// an optional referral share, taken out of this same distributed profit within
// protocol-set caps; it is not enabled, and if it were it would be supply-side
// too, so it cannot turn into retained revenue without a contract change.
const HOOK = "0xc52fc52698479e42f0da9a8a75296ec3871454c0";

// Verified against the deployed hook: keccak of the signature below is the
// topic these logs actually carry
// (0x7b1f2ac966718a4fe501511d1cdc7d0671a76732a9213ee292a41bffdd8051fa).
// `swapperAmount` is the trader's rebate, `lpAmount` is donated to the pool.
const profitDistributeAbi =
  "event ProfitCurrencyDistribute(address indexed recipient, address indexed currency, uint256 swapperAmount, uint256 lpAmount)";

// v4 uses the zero address for native ETH; pools also settle in WETH and USDG.
const NATIVE = "0x0000000000000000000000000000000000000000";

// One historical distribution the hook reported in a currency it did not pay
// in. A newer arbitrage executor could return profit to the hook in WETH and
// USDG together, and the event carried the sum of the two under a single
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
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  // left empty on purpose and returned anyway: swappers are paid by this hook,
  // never charged, so a reported zero is the fact — omitting it would leave
  // consumers unable to tell that apart from a dimension nobody measured
  const dailyUserFees = createBalances();

  const add = (bal: any, currency: string, amount: any, label: string) => {
    if (!currency || currency === NATIVE) bal.addGasToken(amount, label);
    else bal.add(currency, amount, label);
  };

  // entireLog keeps the transaction hash, which onlyArgs — the default —
  // discards; the decoded fields then live under log.args
  const logs = await getLogs({
    target: HOOK,
    eventAbi: profitDistributeAbi,
    entireLog: true,
    parseLog: true,
  });
  for (const log of logs) {
    if (EXCLUDED_TX.has(String(log.transactionHash).toLowerCase())) continue;
    const currency = String(log.args.currency);
    // Fees is what the hook captured; both legs of the split are supply-side,
    // booked under their own destination labels so the breakdowns line up
    // without a late subtract. Revenue is left empty: fees minus supply side
    // is zero here, and the balances above confirm nothing is retained.
    add(dailyFees, currency, log.args.swapperAmount, LABEL.captured);
    add(dailyFees, currency, log.args.lpAmount, LABEL.captured);
    add(dailySupplySideRevenue, currency, log.args.swapperAmount, LABEL.toTraders);
    add(dailySupplySideRevenue, currency, log.args.lpAmount, LABEL.toLPs);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyUserFees };
};

const methodology = {
  Fees: "The arbitrage profit the hook realises and pays out, summed from the ProfitCurrencyDistribute event the hook emits on every distribution. The hook closes the price gap a swap opens between connected pools within the same transaction, so this is value recaptured from MEV rather than a fee charged to anyone.",
  Revenue: "Zero. The hook retains none of the profit it captures — every distribution pays out in full to the trader and the pool's LPs in the triggering transaction, and the hook and its arbitrage executors hold no balance.",
  SupplySideRevenue: "All of the captured profit: the rebate paid to the trader whose swap created the opportunity, plus the amount donated to the LPs of the pool it was taken from.",
  UserFees: "Zero. Users are not charged by the hook; a swapper receives the rebate leg rather than paying anything.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.captured]: "Arbitrage profit captured by the hook when a swap moves one pool away from a connected pool, closed out in the same transaction.",
  },
  SupplySideRevenue: {
    [LABEL.toTraders]: "Rebate paid to the trader whose swap created the arbitrage opportunity.",
    [LABEL.toLPs]: "Donated to the liquidity providers of the pool the profit was taken from.",
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
