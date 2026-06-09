import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Source: TzKT Explorer stats page charts backed by DipDup stats API.
const STATS_API = "https://stats.dipdup.net/v1";
const SIZE = 1000;

async function getValue(path: string, timestamp: number) {
  const data = await httpGet(`${STATS_API}${path}`);
  return Number(data.find((item: any) => item.ts === timestamp).value);
}

const fetch = async (options: FetchOptions) => {
  const [activeUsers, transactions] = await Promise.all([
    getValue(`/histogram/transactions/distinct/day?field=Sender&SenderKind=1&size=${SIZE}`, options.startOfDay),
    getValue(`/histogram/transactions/count/day?size=${SIZE}`, options.startOfDay),
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
  start: "2023-09-14",
};

export default adapter;
