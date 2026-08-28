import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Source: TzKT Explorer stats page charts backed by DipDup stats API.
// Timestamp.gte/.lte (unix seconds) anchor the histogram to the requested day;
// without them the API only serves a sliding window of recent buckets, so old
// dates fall out of range over time. Edge buckets of the requested range can be
// trimmed, so the window is padded by 3 days beyond the two days we need.
const ACCOUNTS_STATS_URL = "https://stats.dipdup.net/v1/histogram/accounts_stats/max/day?field=Total";
const ONE_DAY = 24 * 60 * 60;
const PAD = 3 * ONE_DAY;

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`${ACCOUNTS_STATS_URL}&size=12&Timestamp.gte=${options.startOfDay - ONE_DAY - PAD}&Timestamp.lte=${options.startOfDay + PAD}`);
  const totalAt = (ts: number) => {
    const row = data.find((item: any) => item.ts === ts);
    if (!row) throw new Error(`No Tezos total accounts snapshot for ts ${ts}`);
    return Number(row.value);
  };

  // new users = day-over-day delta of the total account count
  return {
    dailyNewUsers: totalAt(options.startOfDay) - totalAt(options.startOfDay - ONE_DAY),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TEZOS],
  protocolType: ProtocolType.CHAIN,
  start: "2018-07-01", // first day with a previous-day snapshot (data starts 2018-06-30)
};

export default adapter;
