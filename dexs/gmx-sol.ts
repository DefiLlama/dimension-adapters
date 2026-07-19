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
// 2026-06-01 the largest wallet on the venue ran 24.6x turnover on $28.6M across
// 76 positions with imbalance 0.36, and the flat book test alone let it through.
// Accepting a wide book too catches it without reaching the other thing that
// clears 20x turnover, a directional scalper working a handful of positions with
// small capital. Those dominate early history: on 2025-03-15 and 2026-02-15
// turnover alone would take 60.7% and 71.7% of the day off wallets holding 1 to 7
// positions on $3k to $755k. The 02-15 leader is the shape of it, 221x turnover
// on $78k across a single position at imbalance 1.00, which is one directional
// trade reopened all day.
//
// The position count separates the two. Anything from 8 to 20 gives the same
// answer on every day tested, so it is not a fitted line; 6 starts reaching into
// the 2025 days, which is the floor.
//
// Turnover has to be measured against total concurrent capital, not against the
// largest single position. Running dozens of positions at once, as these do, means
// keying off the biggest one understates their capital by about that factor and
// sweeps in ordinary multi-market traders.
//
// The one thing this cannot see. A position that is never touched during the day
// does not appear in tradeEvents at all, and the subgraph exposes no position
// entity, so its capital is invisible. Capital carried in IS counted, because the
// first event on a position contributes its beforeSizeInUsd, but a position that
// sits idle all day is not. Measured capital is therefore a lower bound and
// turnover an upper bound.
//
// This matters more than it looks. Inflating every wallet's peak capital to stand
// in for idle positions, 2026-06-01 removes 55.4% at +0%, 52.7% at +10%, 32.7% at
// +25% and 9.3% at +50%. The 06-01 leader sits at 24.6x, only 23% clear of the
// threshold. What keeps it honest is that these wallets touch nearly everything
// they hold: 88% of their positions on 06-01 are opened fresh that day, on 3,079
// trades across 76 positions for the leader. A wallet churning 76 positions is
// unlikely to be sitting on a large 77th all day. Marginal wallets near 20x have
// no such protection, which is the main reason not to lower the threshold.
//
// Turnover is bounded on both sides. At 20 the quiet and historical days come
// out identical to the adapter without this filter. Dropping it to 10 costs an
// ordinary day real volume, 2026-07-17 goes 1.53B to 1.37B, and above 30 the
// signal itself starts to go. Do not move it without rerunning both ends.
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
  trades: 0,
  longVolume: 0,
  shortVolume: 0,
  positionSize: new Map(),
  exposure: 0,
  peakExposure: 0,
});

const isVolumeFarmer = (wallet: Wallet): boolean => {
  if (wallet.trades < MIN_TRADES || wallet.volume === 0 || wallet.peakExposure === 0) return false;
  if (wallet.volume / wallet.peakExposure < MIN_TURNOVER) return false;
  const imbalance = Math.abs(wallet.longVolume - wallet.shortVolume) / wallet.volume;
  const positionsTouched = wallet.positionSize.size;
  return imbalance <= MAX_IMBALANCE || positionsTouched >= MIN_POSITIONS;
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
    if (!wallet.positionSize.has(event.position)) {
      wallet.positionSize.set(event.position, before);
      wallet.exposure += before;
      wallet.peakExposure = Math.max(wallet.peakExposure, wallet.exposure);
    }
    wallet.exposure += after - (wallet.positionSize.get(event.position) as number);
    wallet.positionSize.set(event.position, after);
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
    Volume: "Notional volume of perpetual trades from the GMX Solana subgraph, taken as the change in position size on each trade event. Volume from wallets farming the GT points programme is excluded, meaning those that turn over 20x or more of their peak concurrent capital in a day while either holding a flat book or working eight or more positions. See issue #7120.",
  },
};

export default adapter;
