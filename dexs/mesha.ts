import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Mesha recomputes this feed from its settled position ledger, so every past UTC day
// replays deterministically. It is a contiguous, zero-filled calendar ending at the last
// fully settled day: a day with no activity is present with zeros, so an absent day means
// the backend has not finalised it rather than that nothing happened. 365 is the
// endpoint's maximum window.
const API = "https://api.mesha.fun/api/v1/stats/defillama/daily?days=365";

// First UTC day of mainnet activity. Must not precede the feed's own left edge
// (days[0].date) or the days in between can never be served — see the guard in fetch.
const START = "2026-07-17";

type Day = {
  date: string;
  volume: number;
  fees: number;
  revenue: number;
  supply_side_revenue: number;
};

type Feed = { byDate: Map<string, Day>; firstDay: string; latestDay: string };

// A backfill needs the whole series, not one day at a time — fetch it once and keep it at
// module scope. A failed fetch is not cached, so the next day retries.
let feed: Promise<Feed> | null = null;

const getFeed = (): Promise<Feed> => {
  if (!feed) {
    feed = fetchURL(API)
      .then((res: any) => {
        // Mesha runs the same stack on a testnet whose play-money token deliberately mimics
        // USDG - same symbol, same decimals. Never publish those balances as USD.
        if (res?.network !== "mainnet")
          throw new Error(`mesha: refusing non-mainnet feed (network=${res?.network})`);
        const days: Day[] = res.days ?? [];
        if (!days.length) throw new Error("mesha: feed is empty");
        return {
          byDate: new Map(days.map((d) => [d.date, d])),
          firstDay: days[0].date,
          latestDay: res.latest_day as string,
        };
      })
      .catch((e) => {
        feed = null;
        throw e;
      });
  }
  return feed;
};

const fetch = async (options: FetchOptions) => {
  const { byDate, firstDay, latestDay } = await getFeed();
  const day = options.dateString;

  // Past the last settled day the backend has not finalised the numbers yet, and before the
  // feed's left edge they are outside the 365-day window. Throw in both cases so the day is
  // retried, rather than persisting a wrong zero into the history chart.
  if (day > latestDay) throw new Error(`mesha: ${day} not settled yet (latest=${latestDay})`);
  if (day < firstDay)
    throw new Error(`mesha: ${day} predates the feed window (starts ${firstDay}); re-anchor start`);

  const row = byDate.get(day);
  if (!row) throw new Error(`mesha: gap in feed at ${day}`);

  // allowNegativeValue is adapter-global, so it also disables the runner's negative guard on
  // volume. Net retained premium may legitimately be negative; premium paid in may not.
  if (!(row.volume >= 0)) throw new Error(`mesha: invalid volume ${row.volume} on ${day}`);

  return {
    dailyVolume: row.volume,
    dailyFees: row.fees,
    dailyUserFees: row.fees,
    dailyRevenue: row.revenue,
    dailyProtocolRevenue: row.revenue,
    dailySupplySideRevenue: row.supply_side_revenue,
  };
};

const adapter: SimpleAdapter = {
  // v1: the backend exposes daily aggregates keyed by UTC date (options.dateString), not
  // hourly windows - v1 is the correct model for a daily-aggregate API.
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  allowNegativeValue: true, // payouts can exceed premiums collected on a given day
  methodology: {
    Volume:
      "Total premium paid by users to open positions on Mesha's price grids, settled in USDG (a 1:1 USD stablecoin) on Robinhood Chain, so the figure is already in USD. This is what users pay in, not the notional exposure of the positions.",
    Fees: "Premium collected on opened positions minus payouts to positions that settled in the money. Negative on days when payouts exceed premium collected.",
    UserFees: "Same as Fees - the net premium users paid the protocol.",
    Revenue: "Net premium retained by the protocol, after referral rebates.",
    ProtocolRevenue:
      "Same as Revenue. No portion is currently distributed to token holders, so nothing is reported as holders revenue.",
    SupplySideRevenue:
      "Referral rebates accrued to referrers - 0.25% of the premium paid by users they referred.",
  },
};

export default adapter;
