import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options;
  const endOfDay = startOfDay + 86400;
  const input = encodeURIComponent(JSON.stringify({ json: { timeStart: startOfDay, timeEnd: endOfDay } }));
  const dateStr = new Date(startOfDay * 1000).toISOString().slice(0, 10);

  const [txRes, userRes] = await Promise.all([
    httpGet(`https://scan.merlinchain.io/api/trpc/stat.getDailyTxCount?input=${input}`),
    httpGet(`https://scan.merlinchain.io/api/trpc/stat.getUniqueAddressesCount?input=${input}`),
  ]);

  if (!txRes?.result?.data?.json || !userRes?.result?.data?.json)
    throw new Error("Failed to fetch Merlin chain stats");

  const txEntry = txRes.result.data.json.find((item: any) => item.date.startsWith(dateStr));
  const userEntry = userRes.result.data.json.find((item: any) => item.date.startsWith(dateStr));

  return {
    dailyTransactionsCount: txEntry?.count ?? 0,
    dailyActiveUsers: userEntry?.count ?? 0,
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
