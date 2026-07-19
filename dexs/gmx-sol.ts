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

// Volume farming filter, see issue #7120.
//
// The wallets behind the spikes are farming the GT points programme. They churn a
// wide book, turning over far more volume than they ever have capital at risk. On
// 2026-05-20 this flags 17 of them holding $2.36B, the thirteen largest carry 94%
// of it, and they look like one operation: $3.9M to $11.0M of capital each, 29 to
// 41 positions, 20.0x to 32.8x turnover. Three numbers per wallet per day:
//
//   turnover    volume / the largest capital the wallet ever had deployed at one
//               time, summed across all its open positions. One open and close of
//               the whole book is 2. Ten round trips is 20.
//   imbalance   |long volume - short volume| / volume. Flat books sit near 0.
//   positions   distinct positions the wallet touched during the day.
//
// Churn plus either a flat book or a wide book. Not every farmer hedges: on
// 2026-06-01 the largest wallet on the venue ran 24.6x turnover on $28.6M with
// imbalance 0.36, and imbalance alone let it through. Requiring a flat book OR a
// wide book catches it without reaching the other thing that clears 20x turnover,
// a directional scalper working one or two positions with small capital. Those
// exist mostly in early history: on 2025-03-15 and 2026-02-15, turnover alone
// would take 60.7% and 71.7% of the day off wallets holding 1 to 7 positions on
// $39k to $755k. The position count is what separates the two, and 8, 10 and 15
// all give the same answer, so it is not a fitted line.
//
// Turnover has to be measured against total concurrent capital, not against the
// largest single position. Running dozens of positions at once, as these do, means
// keying off the biggest one understates their capital by about that factor and
// sweeps in ordinary multi-market traders.
//
// Capital sitting in a position that is never touched during the day is not counted,
// since the position only becomes visible when it trades. That is nil in practice:
// every wallet this flags churns its whole book, so it carries no untouched
// positions into the day.
//
// Quiet days are untouched anywhere in turnover 10-30 and imbalance 0.05-0.25, so
// the thresholds are not load bearing on the false positive side. Above 30 the
// signal itself starts to go, so do not raise it.
//
// Backfill runs to 2025-02-12, and the early days behave differently from the
// 2026 spikes, so check both before touching any of these numbers.
const MIN_TRADES = 20;
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
  trades: number;
  longVolume: number;
  shortVolume: number;
  openSize: Map<string, number>; // position -> current size in usd
  exposure: number;              // sum of openSize
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
  trades: 0,
  longVolume: 0,
  shortVolume: 0,
  openSize: new Map(),
  exposure: 0,
  peakExposure: 0,
});

const isVolumeFarmer = (wallet: Wallet): boolean => {
  if (wallet.trades < MIN_TRADES || wallet.volume === 0 || wallet.peakExposure === 0) return false;
  if (wallet.volume / wallet.peakExposure < MIN_TURNOVER) return false;
  const imbalance = Math.abs(wallet.longVolume - wallet.shortVolume) / wallet.volume;
  return imbalance <= MAX_IMBALANCE || wallet.openSize.size >= MIN_POSITIONS;
};

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startOfDay * 1000).toISOString();
  const to = new Date(options.endTimestamp * 1000).toISOString();

  const events: TradeEvent[] = [];
  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE) {
    const res = await request(url, tradesQuery, { from, to, limit: PAGE, offset });
    const page: TradeEvent[] = res.tradeEvents;
    events.push(...page);
    if (page.length < PAGE) break;
  }

  if (!events.length) throw new Error("No trade events found for the day.");

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

    // first sighting of a position: whatever it held before this trade is already
    // capital at risk, so count it before applying the trade
    if (!wallet.openSize.has(event.position)) {
      wallet.openSize.set(event.position, before);
      wallet.exposure += before;
      wallet.peakExposure = Math.max(wallet.peakExposure, wallet.exposure);
    }
    wallet.exposure += after - (wallet.openSize.get(event.position) as number);
    wallet.openSize.set(event.position, after);
    wallet.peakExposure = Math.max(wallet.peakExposure, wallet.exposure);

    const volume = Math.abs(after - before);
    wallet.volume += volume;
    wallet.trades += 1;
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
    Volume: "Notional volume of perpetual trades from the GMX Solana subgraph, taken as the change in position size on each trade event. Volume from wallets farming the GT points programme is excluded, meaning those that turn over more than 20x their peak concurrent capital in a day while either holding a flat book or working eight or more positions. See issue #7120.",
  },
};

export default adapter;
