import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql";

// sizes in the subgraph are scaled by 1e20
const SCALE = 1e20;

// 50k rows per request covers the busiest day so far (129k events on 2026-06-01)
// in three requests
const PAGE = 50000;

// Volume farming filter, see issue #7120.
//
// The wallets behind the spikes are farming the GT points programme. They hold a
// book that is flat overall and churn it, so they turn over far more volume than
// they ever have capital at risk. On 2026-05-20 there are 13 of them carrying 99.8%
// of the flagged volume, and they look like one operation: $2.8M to $11.0M of
// capital each, 15 to 26 markets open at once, 20x to 33x turnover, VIP tier 4-5,
// and GT ranks packed into 220-998. Two numbers per wallet per day catch that:
//
//   turnover    volume / the largest capital the wallet ever had deployed at one
//               time, summed across all its open positions. One open and close of
//               the whole book is 2. Ten round trips is 20.
//   imbalance   |long volume - short volume| / volume. Flat books sit near 0.
//
// Turnover has to be measured against total concurrent capital, not against the
// largest single position. These wallets run 15 to 26 markets at once, so keying
// off the biggest position understates their capital by about that factor and
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
const MIN_TRADES = 20;
const MIN_TURNOVER = 20;
const MAX_IMBALANCE = 0.15;

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
  const turnover = wallet.volume / wallet.peakExposure;
  const imbalance = Math.abs(wallet.longVolume - wallet.shortVolume) / wallet.volume;
  return turnover >= MIN_TURNOVER && imbalance <= MAX_IMBALANCE;
};

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startOfDay * 1000).toISOString();
  const to = new Date(options.endTimestamp * 1000).toISOString();

  const events: TradeEvent[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await request(url, tradesQuery, { from, to, limit: PAGE, offset });
    const page: TradeEvent[] = res.tradeEvents;
    events.push(...page);
    if (page.length < PAGE) break;
  }

  if (!events.length) throw new Error("Not found daily data!.");

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
    Volume: "Notional volume of perpetual trades from the GMX Solana subgraph, taken as the change in position size on each trade event. Volume from wallets farming the GT points programme, meaning they turn over more than 20x their peak concurrent capital while holding a flat book, is excluded. See issue #7120.",
  },
};

export default adapter;
