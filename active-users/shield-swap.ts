import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Shield Swap is a confidential concentrated-liquidity AMM on Aleo. Its AMM program is
// shield_swap.aleo, and the Aleo node RPC counts calls to a program per day for the last 90 days.
// https://docs.provable.com/docs/api/v2/get-explorer-metrics-program-range
const AMM = "shield_swap.aleo";
const RETENTION_DAYS = 90;
const CALLS_PER_DAY = `https://api.provable.com/v2/mainnet/metrics/program/${AMM}/range/${RETENTION_DAYS}`;

const ONE_DAY = 24 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  // The endpoint is a rolling window, so a day that has aged out cannot be read at all - reporting
  // zero there would look like a day with no trading.
  if (options.startOfDay < Math.floor(Date.now() / 1000) - RETENTION_DAYS * ONE_DAY)
    throw new Error(`shield-swap: ${options.dateString} is older than the ${RETENTION_DAYS} day call-metrics window`);

  const days: { day: string; calls: number }[] = await fetchURL(CALLS_PER_DAY);
  const day = days.find((entry) => entry.day.slice(0, 10) === options.dateString);

  // Days with no calls are omitted from the response rather than returned as zero.
  return { dailyTransactionsCount: day?.calls ?? 0 };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ALEO],
  // First calls to shield_swap.aleo: the pools were created and traded on 2026-07-30.
  start: '2026-07-30',
  methodology: {
    Transactions: `Accepted and rejected calls to ${AMM} per day, counted by the Aleo node RPC. A trade is two calls: the swap and the claim that settles its output.`,
  },
  breakdownMethodology: {
    Transactions: {
      [AMM]: "Every accepted or rejected call to the AMM program: swaps, the claims that settle them, and liquidity operations. Not broken down further - the node reports calls per program, not per function.",
    },
  },
};

export default adapter;
