import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

type Snapshot = {
  token: string;
  timestamp: string;
  longUsd: number;
  shortUsd: number;
  total: number;
};

type Response = {
  timestamp: string;
  openInterest: Snapshot[];
};

const fetch = async (options: FetchOptions) => {
  // Midnight of the next UTC day -- the exact instant boundary of the
  // requested day. The backend's cron writes a snapshot at every HH:00 UTC,
  // so this lands on the 00:00-next-day row (= OI at end of requested day).
  // For "today" no next-day row exists yet; the endpoint falls back to the
  // latest available hourly snapshot.
  const endOfDay = options.startOfDay + 86400;
  const { openInterest } = (await httpGet(
    `https://api.prod.flash.trade/open-interest/at?timestamp=${endOfDay}`
  )) as Response;

  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;
  for (const snap of openInterest) {
    longOpenInterestAtEnd += snap.longUsd || 0;
    shortOpenInterestAtEnd += snap.shortUsd || 0;
  }

  return {
    openInterestAtEnd: longOpenInterestAtEnd + shortOpenInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  // Earliest date the OpenInterest table has data for (BTC/SOL/ETH).
  start: '2023-12-29',
};

export default adapter;
