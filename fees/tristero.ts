import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import {
  TRISTERO_CHAINS,
  TRISTERO_START,
  fetchTristeroGasAbstractionFees,
  getTristeroVaultTotal,
} from "../helpers/tristero";

// Tristero fees are a loan spread charged on the capital in the vault, plus the gas abstraction
// paid to fillers for submitting orders on takers' behalf. Borrow interest earned by lenders is
// not protocol fee revenue and is not reported.
const LOAN_SPREAD_BPS_PER_DAY = 1n;   // 1bp = 0.01% per day
const BPS_DENOMINATOR = 10_000n;

const TRISTERO_FEE_METRICS = {
  LOAN_SPREAD: 'Loan Spread',
  GAS_ABSTRACTION_TO_FILLERS: 'Gas Abstraction To Fillers',
} as const;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  // 1. Loan spread on everything in the vault, idle and lent out. Kept by the protocol.
  const vault = await getTristeroVaultTotal(options);
  if (vault && vault.amount > 0n) {
    const loanFee = (vault.amount * LOAN_SPREAD_BPS_PER_DAY) / BPS_DENOMINATOR;
    if (loanFee > 0n) {
      dailyFees.add(vault.token, loanFee.toString(), TRISTERO_FEE_METRICS.LOAN_SPREAD);
      dailyRevenue.add(vault.token, loanFee.toString(), TRISTERO_FEE_METRICS.LOAN_SPREAD);
    }
  }

  // 2. Gas abstraction, paid out of the order's proceeds. Fillers keep it in full.
  const gasAbstraction = await fetchTristeroGasAbstractionFees(options);
  dailyFees.addBalances(gasAbstraction, METRIC.TRANSACTION_GAS_FEES);
  dailySupplySideRevenue.addBalances(gasAbstraction, TRISTERO_FEE_METRICS.GAS_ABSTRACTION_TO_FILLERS);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // The loan fee is a rate on a stock rather than a flow, so the day is computed once. Under
  // pullHourly the runner sums 24 slots and would report 24x the real figure.
  pullHourly: false,
  fetch,
  chains: TRISTERO_CHAINS,
  start: TRISTERO_START,
  methodology: {
    Fees: "A 1bp (0.01%) per-day loan spread on the total capital in the Tristero vault - idle and lent out, from the vault's own getTVOL accounting - plus gas abstraction paid to fillers for submitting orders on takers' behalf. Both components are charged to users: the loan spread to borrowers, gas abstraction to takers.",
    SupplySideRevenue: "Gas abstraction paid to fillers, who keep it in full.",
    Revenue: "The loan spread, kept by the protocol. Tristero takes no share of gas abstraction.",
    ProtocolRevenue: "The loan spread, kept by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [TRISTERO_FEE_METRICS.LOAN_SPREAD]: "1bp per-day loan spread on vault capital.",
      [METRIC.TRANSACTION_GAS_FEES]: "Gas abstraction charged to takers on orders submitted by a filler.",
    },
    Revenue: {
      [TRISTERO_FEE_METRICS.LOAN_SPREAD]: "1bp per-day loan spread on vault capital.",
    },
    ProtocolRevenue: {
      [TRISTERO_FEE_METRICS.LOAN_SPREAD]: "1bp per-day loan spread on vault capital.",
    },
    SupplySideRevenue: {
      [TRISTERO_FEE_METRICS.GAS_ABSTRACTION_TO_FILLERS]: "Gas abstraction paid to fillers.",
    },
  },
};

export default adapter;
