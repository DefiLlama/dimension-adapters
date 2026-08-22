import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql";

// sizes in the subgraph are scaled by 1e20
const SCALE = 1e20;

// 50k rows per request covers the busiest day so far (129k events on 2026-06-01)
// in three requests. The cap is a stop so a subgraph that keeps returning full
// pages cannot spin here forever; it is well clear of any real day.
const PAGE = 50000;
const MAX_EVENTS = 1_000_000;

// Volume farming filter, see issue #7120. Measurements behind every number here
// are in that thread.
//
// Wallets farming the GT points programme churn a wide book, turning over far more
// volume than they ever have capital at risk. Three numbers per wallet per day:
//
//   turnover    volume / the largest capital the wallet ever had deployed at one
//               time, summed across its open positions. One open and close of the
//               whole book is 2. Ten round trips is 20.
//   imbalance   |long volume - short volume| / volume. Flat books sit near 0.
//   positions   distinct positions the wallet touched during the day.
//
// Flagged on churn plus either a flat book or a wide one. Both branches earn their
// place: not every farmer hedges, and turnover on its own also catches directional
// scalpers working one or two positions on small capital, who are most of the
// early backfill.
//
// Turnover has to be measured against total concurrent capital rather than the
// largest single position, or running dozens of positions at once understates a
// wallet's capital by roughly that factor.
//
// What this cannot see: a position that never trades during the day emits no
// event, and the subgraph has no position entity, so its capital is invisible.
// Capital carried in is counted, idle capital is not, which makes turnover an
// upper bound and the flagged set sensitive to it. That is the reason not to lower
// these. Backfill also runs to 2025-02-12 and the early days behave nothing like
// the 2026 spikes, so measure both eras before changing any of them.
const MIN_TURNOVER = 20;
const MAX_IMBALANCE = 0.15;
const MIN_POSITIONS = 8;

interface TradeEvent {
  user: string;
  position: string;
  flags: string;
  beforeSizeInUsd: string;
  afterSizeInUsd: string;
}

interface Wallet {
  volume: number;
  longVolume: number;
  shortVolume: number;
  // position -> its size in usd right now. closing a position sets the entry to 0
  // rather than removing it, so the key count is how many distinct positions the
  // wallet touched over the day, which is what MIN_POSITIONS reads. do not delete
  // closed keys here, it would quietly change the filter.
  positionSize: Map<string, number>;
  exposure: number; // sum of positionSize
  peakExposure: number;
}

const tradesQuery = gql`
  query trades($from: DateTime!, $to: DateTime!, $limit: Int!, $offset: Int!) {
    tradeEvents(
      where: { timestamp_gte: $from, timestamp_lt: $to }
      orderBy: id_ASC
      limit: $limit
      offset: $offset
    ) {
      user
      position
      flags
      beforeSizeInUsd
      afterSizeInUsd
    }
  }
`;

const newWallet = (): Wallet => ({
  volume: 0,
  longVolume: 0,
  shortVolume: 0,
  positionSize: new Map(),
  exposure: 0,
  peakExposure: 0,
});

const isVolumeFarmer = (wallet: Wallet): boolean => {
  if (wallet.volume === 0 || wallet.peakExposure === 0) return false;
  if (wallet.volume / wallet.peakExposure < MIN_TURNOVER) return false;
  const imbalance = Math.abs(wallet.longVolume - wallet.shortVolume) / wallet.volume;
  const positionsTouched = wallet.positionSize.size;
  return imbalance <= MAX_IMBALANCE || positionsTouched >= MIN_POSITIONS;
};

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startOfDay * 1000).toISOString();
  const to = new Date(options.endTimestamp * 1000).toISOString();

  const events: TradeEvent[] = [];
  let complete = false;
  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE) {
    const res = await request(url, tradesQuery, { from, to, limit: PAGE, offset });
    const page: TradeEvent[] = res.tradeEvents;
    events.push(...page);
    if (page.length < PAGE) { complete = true; break; }
  }

  if (!events.length) throw new Error("No trade events found for the day.");
  // a short page is the only proof the day is fully read. running out of budget
  // with every page full means there is more, and carrying on would report a
  // truncated day as if it were the whole one
  if (!complete) {
    throw new Error(
      `Read ${events.length} trade events without reaching the end of the day. ` +
      `Raise MAX_EVENTS above ${MAX_EVENTS}.`
    );
  }

  const wallets = new Map<string, Wallet>();
  for (const event of events) {
    const before = Number(event.beforeSizeInUsd) / SCALE;
    const after = Number(event.afterSizeInUsd) / SCALE;
    // low bit of flags is the side: it never changes over a position's life, and
    // realised pnl moves with the price when it is set and against it when it is not
    const isLong = (Number(event.flags) & 1) === 1;

    let wallet = wallets.get(event.user);
    if (!wallet) {
      wallet = newWallet();
      wallets.set(event.user, wallet);
    }

    let held = wallet.positionSize.get(event.position);
    if (held === undefined) {
      // first sighting: whatever the position held before this trade is already
      // capital at risk, so count it before applying the trade
      held = before;
      wallet.exposure += before;
      wallet.peakExposure = Math.max(wallet.peakExposure, wallet.exposure);
    }
    wallet.exposure += after - held;
    wallet.positionSize.set(event.position, after);
    wallet.peakExposure = Math.max(wallet.peakExposure, wallet.exposure);

    const volume = Math.abs(after - before);
    wallet.volume += volume;
    if (isLong) wallet.longVolume += volume;
    else wallet.shortVolume += volume;
  }

  let dailyVolume = 0;
  wallets.forEach((wallet) => {
    if (!isVolumeFarmer(wallet)) dailyVolume += wallet.volume;
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  version: 1,
  chains: [CHAIN.SOLANA],
  start: '2025-02-12',
  methodology: {
    Volume: "Notional volume of perpetual trades from the GMX Solana subgraph, taken as the change in position size on each trade event. Volume from wallets farming the GT points programme is excluded, meaning those that turn over 20x or more of their peak concurrent capital in a day while either holding a flat book or working eight or more positions. See issue #7120.",
  },
};

export default adapter;
