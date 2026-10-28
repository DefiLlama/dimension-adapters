import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Stats host from https://scan.merlinchain.io/assets/envs.js (NEXT_PUBLIC_STATS_API_HOST)
const STATS_URL = "https://scan-stat.merlinchain.io";
const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

async function fetchLine(line: string, date: string) {
  const data = await httpGet(`${STATS_URL}/api/v1/lines/${line}?from=${date}&to=${date}&resolution=DAY`, { headers });
  const entry = data.chart.find((item: any) => item.date === date);
  if (!entry) throw new Error(`No Merlin Blockscout ${line} data on ${date}`);
  return Number(entry.value);
}

const fetch = async (options: FetchOptions) => {
  const date = options.dateString;
  const [dailyTransactionsCount, dailyActiveUsers] = await Promise.all([
    fetchLine("newTxns", date),
    fetchLine("activeAccounts", date),
  ]);

  return {
    dailyTransactionsCount,
    dailyActiveUsers,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MERLIN],
  protocolType: ProtocolType.CHAIN,
  start: "2024-02-09",
};

export default adapter;
