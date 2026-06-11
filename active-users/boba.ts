import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_URL = "https://blockscout.boba.network/stats-service/api/v1/lines";

const fetchLine = async (line: string, date: string): Promise<number> => {
  const data = await fetchURL(`${STATS_URL}/${line}?from=${date}&to=${date}&resolution=DAY`);
  const row = data.chart?.find((item: any) => item.date === date);
  if (!row) throw new Error(`No Boba ${line} data for ${date}`);
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
  chains: [CHAIN.BOBA],
  protocolType: ProtocolType.CHAIN,
  start: "2021-10-28",
};

export default adapter;
