import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Lodestar — no-liquidation fixed-term lending on Flare.
//
// Nothing accrues here. A borrower pays one flat fee up front, netted out of the principal, and the
// loan then simply has a deadline. So every revenue stream is an event, not a rate integral:
//
//   LoanOpened.fee / LoanRolled.addFee  borrower's cost of the loan (USDT0), split with lenders
//   DefaultPenaltyPaid.amount           penalty for curing past the grace period (USDT0), all protocol
//   YieldSkimmed.amount                 protocol's cut of LST collateral appreciation, all protocol,
//                                       denominated in the collateral token, not the stable
//
// The lender/protocol split is NOT recomputed from `feeReserveBps`. The book pays the lender share by
// calling `pool.lockFee(fee - reserveCut)`, which emits FeeLocked with that exact amount, so the split
// is read from what was actually paid. A governance change to the rate mid-window therefore cannot
// desynchronise the two sides, and no rate needs to be read at all.
//
// Settlement proceeds are deliberately not touched: they are principal being recovered, not fees. Any
// penalty inside a settlement is routed through the same _bookPenalty helper and so already arrives
// as DefaultPenaltyPaid.
const BOOK = "0x9b479f47ef25E0Ed2134F38d3c4e1022A8695ed8";
const POOL = "0x87b09bE7A253C2af187c9af17cDEDcEAf4A9780E";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D"; // the pool asset: all stable fees are in this

const LOAN_OPENED =
  "event LoanOpened(uint256 indexed id, address indexed borrower, address indexed collateral, uint256 collAmount, uint256 principal, uint256 fee, uint64 dueAt)";
const LOAN_ROLLED = "event LoanRolled(uint256 indexed id, uint64 newDueAt, uint256 addFee)";
const PENALTY_PAID = "event DefaultPenaltyPaid(uint256 indexed id, address payer, uint256 amount)";
const YIELD_SKIMMED = "event YieldSkimmed(uint256 indexed id, address indexed collateral, uint256 amount)";
const FEE_LOCKED = "event FeeLocked(uint256 amount, uint256 lockedTotal)";

const PENALTIES = "Default Penalties";
const SKIM = "Collateral Yield Skim";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [opened, rolled, penalties, skims, locked] = await Promise.all([
    options.getLogs({ target: BOOK, eventAbi: LOAN_OPENED }),
    options.getLogs({ target: BOOK, eventAbi: LOAN_ROLLED }),
    options.getLogs({ target: BOOK, eventAbi: PENALTY_PAID }),
    options.getLogs({ target: BOOK, eventAbi: YIELD_SKIMMED }),
    options.getLogs({ target: POOL, eventAbi: FEE_LOCKED }),
  ]);

  // --- borrower's cost of the loan, shared with lenders ---
  let borrowFees = BigInt(0);
  for (const log of opened) borrowFees += BigInt(log.fee);
  for (const log of rolled) borrowFees += BigInt(log.addFee);

  let toLenders = BigInt(0);
  for (const log of locked) toLenders += BigInt(log.amount);
  // Clamp: FeeLocked is emitted inside the same transactions, but never let a boundary log make the
  // protocol's share negative.
  if (toLenders > borrowFees) toLenders = borrowFees;

  dailyFees.add(USDT0, borrowFees, { label: METRIC.BORROW_INTEREST });
  dailySupplySideRevenue.add(USDT0, toLenders, { label: METRIC.BORROW_INTEREST });
  dailyProtocolRevenue.add(USDT0, borrowFees - toLenders, { label: METRIC.BORROW_INTEREST });

  // --- penalties: paid by a borrower curing after the grace period, 100% to the first-loss buffer ---
  let penaltyTotal = BigInt(0);
  for (const log of penalties) penaltyTotal += BigInt(log.amount);
  dailyFees.add(USDT0, penaltyTotal, { label: PENALTIES });
  dailyProtocolRevenue.add(USDT0, penaltyTotal, { label: PENALTIES });

  // --- yield skim: protocol's cut of LST collateral appreciation, paid in the collateral token ---
  for (const log of skims) {
    dailyFees.add(log.collateral, log.amount, { label: SKIM });
    dailyProtocolRevenue.add(log.collateral, log.amount, { label: SKIM });
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Everything borrowers pay: the flat fee charged when a loan is opened or extended, penalties paid when a loan is cured after its grace period, and the protocol's cut of any appreciation on yield-bearing collateral. Lodestar charges no interest, so nothing accrues over the life of a loan.",
  Revenue: "The portion of the above kept by the protocol: the reserve cut of borrower fees, plus all penalties and all collateral yield skim.",
  ProtocolRevenue: "The portion kept by the protocol, routed to the first-loss reserve that absorbs settlement shortfalls before lenders do.",
  SupplySideRevenue: "The portion of borrower fees paid through to lenders in the USDT0 pool, taken from the amount the loan book actually locks for them rather than recomputed from the fee rate.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]:
      "One flat fee charged up front at origination and again on each extension, set by the term/LTV tier the borrower chose. It is netted out of the principal, so it is paid whether or not the loan is repaid.",
    [PENALTIES]: "Charged when a borrower repays after the deadline's grace period, as a share of the principal being repaid, fixed at the rate in force when the loan was opened.",
    [SKIM]: "A share of the appreciation on yield-bearing collateral (sFLR, stXRP) over the life of a loan, taken in the collateral token when it is returned. Recognised appreciation is capped at 20% per term, so an abnormal rate feed cannot inflate it.",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "The reserve's cut of each borrower fee, being the fee less the amount locked for lenders.",
    [PENALTIES]: "All of it. Penalties are moved straight into the first-loss reserve.",
    [SKIM]: "All of it. The skim is transferred to the reserve in the collateral token.",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "The reserve's cut of each borrower fee, being the fee less the amount locked for lenders.",
    [PENALTIES]: "All of it. Penalties are moved straight into the first-loss reserve.",
    [SKIM]: "All of it. The skim is transferred to the reserve in the collateral token.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]:
      "The lender share of each borrower fee, read from the amount the loan book locks in the pool for vesting. Lenders receive none of the penalties or the yield skim.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.FLARE],
  start: "2026-08-29", // LodestarLoanBook genesis, Flare block 68517390
  methodology,
  breakdownMethodology,
};

export default adapter;
