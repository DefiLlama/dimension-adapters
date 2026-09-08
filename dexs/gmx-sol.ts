import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql";

// sizes in the subgraph are scaled by 1e20
const SCALE = 1e20;

// 50k rows covers the busiest day so far, 129k events on 2026-06-01, in three
// requests. The cap stops a subgraph that keeps returning full pages.
const PAGE = 50000;
const MAX_EVENTS = 1_000_000;
// The event budget counts pages read, not seconds waited, so a page that never
// answers would hold the run.
const REQUEST_TIMEOUT_MS = 60_000;

// Volume farming filter, see issue #7120 for the measurements. Wallets farming GT
// points turn over far more volume than they ever have at risk.
//
//   turnover    volume / peak concurrent capital. One round trip of the book is 2.
//   imbalance   |long volume - short volume| / volume. Flat books sit near 0.
//   positions   distinct positions touched during the day.
//
// Churn plus either a flat book or a wide one: not every farmer hedges, and
// turnover alone catches directional scalpers on small capital.
//
// A position that never trades emits no event and the subgraph has no position
// entity, so idle capital is invisible and turnover is an upper bound. Backfill
// reaches 2025-02-12, whose days behave nothing like the 2026 spikes, so measure
// both eras before moving these.
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
  // position -> size in usd. a close sets the entry to 0 rather than removing it,
  // so the key count is what MIN_POSITIONS reads: deleting closed keys would
  // quietly change the filter.
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
  // startOfDay against the half-open filter tiles the calendar. startTimestamp is
  // a second earlier, so consecutive days would share a boundary trade.
  const from = new Date(options.startOfDay * 1000).toISOString();
  const to = new Date(options.endTimestamp * 1000).toISOString();

  const events: TradeEvent[] = [];
  let complete = false;
  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE) {
    const res: any = await request({
      url,
      document: tradesQuery,
      variables: { from, to, limit: PAGE, offset },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const page: TradeEvent[] = res.tradeEvents;
    events.push(...page);
    if (page.length < PAGE) { complete = true; break; }
  }

  if (!events.length) throw new Error("No trade events found for the day.");
  // a short page is the only proof the day is fully read: a full last page means
  // there is more, and carrying on would report a truncated day as the whole one
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
      // on a first sighting the position's prior size is capital at risk, so
      // count it before applying the trade
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
