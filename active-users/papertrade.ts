import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { PAPERTRADE_API } from "../helpers/papertrade";
import { httpGet } from "../utils/fetchURL";

const PAGE_SIZE = 100; // API maximum
const ONE_DAY = 24 * 60 * 60;

// The leaderboard is live only and its 24h window is relative to now, so the cutoff is taken from the clock, not the
// runner window. Pages are sorted by lastActiveTs desc and read until the first stale account.
const fetch = async () => {
  const cutoff = Math.floor(Date.now() / 1000) - ONE_DAY;
  let active = 0;
  for (let page = 0; ; page++) {
    const res = await httpGet(`${PAPERTRADE_API}/state/leaderboard/accounts?page=${page}&pageSize=${PAGE_SIZE}&sortDir=desc&sortKey=lastActiveTs&window=24h`);
    if (!res.ok || !Array.isArray(res.accounts) || !Number.isInteger(res.pageInfo?.totalPages)) throw new Error(`papertrade: bad leaderboard page ${page}`);
    const fresh = res.accounts.filter((a: any) => a.lastActiveTs >= cutoff).length;
    active += fresh;
    if (fresh < res.accounts.length || page + 1 >= res.pageInfo.totalPages) break;
  }
  return { dailyActiveUsers: active };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // a trailing-24h unique count cannot be sliced into hours
  runAtCurrTime: true, // no historical leaderboard
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-10-07",
  methodology: {
    ActiveUsers: "Papertrade accounts that took any action (trade, deposit, withdrawal, stake or claim) in the trailing 24 hours, from the protocol's live leaderboard.",
  },
};

export default adapter;
