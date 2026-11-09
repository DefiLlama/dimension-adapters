import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// Project 0 (P0) is a permissionless prime broker / lending protocol on Solana,
// built on mrgnLendv2. Borrowers pay interest on their loans (the fees); the
// protocol keeps a reserve cut (revenue) and the rest is paid to depositors.
//
// Data comes from P0's public API (/v0/bankMetrics), which returns the current
// state of every bank only (no historical/timestamp param) — the same source
// the TVL adapter (`p0`) uses. Fees are therefore a live snapshot
// (`runAtCurrTime`): per bank, daily borrower interest = totalBorrowsUsd *
// borrowApr / 365.
const METRICS_ENDPOINT = "https://api.0.xyz/v0/bankMetrics";

interface Bank {
  priced: boolean;
  totalBorrowsUsd: string;
  borrowApr: string;
  depositApr: string;
  utilization: string;
}

const fetch = async ({ createBalances }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const data = await httpGet(METRICS_ENDPOINT);
  const banks: Bank[] = data?.banks ?? [];

  for (const bank of banks) {
    if (!bank.priced) continue;

    const borrowsUsd = Number(bank.totalBorrowsUsd) || 0;
    const borrowApr = Number(bank.borrowApr) || 0;
    const depositApr = Number(bank.depositApr) || 0;
    const utilization = Number(bank.utilization) || 0;

    const borrowInterest = (borrowsUsd * borrowApr) / 365;
    if (borrowInterest <= 0) continue;

    // Implied protocol reserve factor from the rate spread:
    //   depositApr = borrowApr * utilization * (1 - reserveFactor)
    // Integration banks earn external (e.g. staking) yield on top of the lending
    // spread, which pushes this negative — floor at 0 so external yield is never
    // counted as protocol revenue and the split stays 0 <= revenue <= fees.
    let reserveFactor = 0;
    if (borrowApr > 0 && utilization > 0) {
      reserveFactor = 1 - depositApr / (borrowApr * utilization);
      if (!isFinite(reserveFactor) || reserveFactor < 0) reserveFactor = 0;
      if (reserveFactor > 1) reserveFactor = 1;
    }

    const revenue = borrowInterest * reserveFactor;

    dailyFees.addUSDValue(borrowInterest, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(revenue, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.addUSDValue(borrowInterest - revenue, METRIC.BORROW_INTEREST);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  runAtCurrTime: true,
  fetch,
  chains: [CHAIN.SOLANA],
  methodology: {
    Fees: "Interest paid by borrowers across all Project 0 banks (borrows x borrow APR).",
    UserFees: "Interest paid by borrowers on their outstanding loans.",
    Revenue: "Protocol's reserve share of the borrower interest.",
    ProtocolRevenue: "Protocol's reserve share of the borrower interest.",
    SupplySideRevenue: "Borrower interest distributed to depositors/lenders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Interest paid by borrowers on all outstanding loans.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Protocol reserve cut of borrower interest.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Borrower interest paid out to depositors.",
    },
  },
};

export default adapter;
