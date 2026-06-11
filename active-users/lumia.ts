import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_URL = "https://explorer.lumia.org/stats-service/api/v1/lines";

const fetchLine = async (line: string, date: string): Promise<number> => {
  const data = await fetchURL(`${STATS_URL}/${line}?from=${date}&to=${date}&resolution=DAY`);
  const row = data.chart?.find((item: any) => item.date === date);
  if (!row) throw new Error(`No Lumia ${line} data for ${date}`);
  return Number(row.value);
};

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
  chains: [CHAIN.LUMIA],
  protocolType: ProtocolType.CHAIN,
  start: "2024-06-27",
};

export default adapter;
