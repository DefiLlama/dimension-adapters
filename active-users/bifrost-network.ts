import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_API = "https://explorer-stats.mainnet.thebifrost.io";

async function fetchLine(line: string, date: string) {
  const { chart } = await fetchURL(`${STATS_API}/api/v1/lines/${line}?from=${date}&to=${date}&resolution=DAY`);
  return Number(chart?.find((item: any) => item.date === date)?.value ?? 0);
}

const fetch = async (options: FetchOptions) => {
  const date = options.dateString;
  const [dailyActiveUsers, dailyTransactionsCount] = await Promise.all([
    fetchLine("activeAccounts", date),
    fetchLine("newTxns", date),
  ]);
  return { dailyActiveUsers, dailyTransactionsCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BFC],
  protocolType: ProtocolType.CHAIN,
  start: "2023-01-17",
};

export default adapter;
