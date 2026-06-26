import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getOklinkApiKey } from "../helpers/oklink";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const timestamp = options.startOfDay * 1e3;
  const apiKey = await getOklinkApiKey();
  const headers = { 'x-apikey': apiKey };
  const [activeData, txData, gasData] = await Promise.all([
    httpGet(`https://www.oklink.com/api/explorer/v2/common/charts/activeAddressCount?chain=X1&t=${timestamp}`, { headers }),
    httpGet(`https://www.oklink.com/api/explorer/v2/common/charts/transaction?chain=X1&t=${timestamp}`, { headers }),
    httpGet(`https://www.oklink.com/api/explorer/v2/common/charts/gasUsedDailyTotal?chain=X1&t=${timestamp}`, { headers }),
  ]);
  const activeEntry = activeData.data.value.find((item: any) => item.timestamp == timestamp);
  const txEntry = txData.data.value.find((item: any) => item.timestamp == timestamp);
  const gasEntry = gasData.data.value.find((item: any) => item.timestamp == timestamp);
  if (!activeEntry || !txEntry || !gasEntry) {
    throw new Error(`No X-Layer user data found for ${timestamp}`);
  }
  return {
    dailyActiveUsers: Number(activeEntry.activeAddressCount),
    dailyTransactionsCount: Number(txEntry.transactionCount),
    dailyGasUsed: Number(gasEntry.gasUsedDailyTotal),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  protocolType: ProtocolType.CHAIN,
  start: '2024-03-30',
};

export default adapter;
