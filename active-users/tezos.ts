import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Source: TzKT Explorer stats page charts backed by DipDup stats API.
// Timestamp.gte/.lte (unix seconds) anchor the histogram to the requested day;
// without them the API only serves a sliding window of recent buckets, so old
// dates fall out of range over time. Edge buckets of the requested range can be
// trimmed, so the window is padded by 3 days on each side of the target day.
const STATS_API = "https://stats.dipdup.net/v1";
const ONE_DAY = 24 * 60 * 60;
const PAD = 3 * ONE_DAY;

async function getValue(path: string, timestamp: number) {
  const sep = path.includes("?") ? "&" : "?";
  const data = await httpGet(`${STATS_API}${path}${sep}size=10&Timestamp.gte=${timestamp - PAD}&Timestamp.lte=${timestamp + PAD}`);
  const row = data.find((item: any) => item.ts === timestamp);
  if (!row) throw new Error(`No Tezos data for ts ${timestamp} at ${path}`);
  return Number(row.value);
}

const fetch = async (options: FetchOptions) => {
  const [activeUsers, transactions] = await Promise.all([
    // SenderKind=1 filters to user accounts (excludes contract senders)
    getValue(`/histogram/transactions/distinct/day?field=Sender&SenderKind=1`, options.startOfDay),
    getValue(`/histogram/transactions/count/day`, options.startOfDay),
  ]);

  return {
    dailyActiveUsers: activeUsers,
    dailyTransactionsCount: transactions,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TEZOS],
  protocolType: ProtocolType.CHAIN,
  start: "2018-06-30",
};

export default adapter;
