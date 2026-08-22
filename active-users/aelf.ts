import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const DAILY_ACTIVE_ADDRESSES_URL = "https://aelfscan.io/api/app/statistics/dailyActiveAddresses";
const DAILY_TRANSACTIONS_URL = "https://aelfscan.io/api/app/statistics/dailyTransactions";

const fetch = async (options: FetchOptions) => {
  const [activeResponse, txResponse] = await Promise.all([
    fetchURL(DAILY_ACTIVE_ADDRESSES_URL),
    fetchURL(DAILY_TRANSACTIONS_URL),
  ]);

  const activeRow = activeResponse.data.list.find((item: any) => item.dateStr === options.dateString);
  const txRow = txResponse.data.list.find((item: any) => item.dateStr === options.dateString);

  if (!activeRow || !txRow) throw new Error(`No aelf user stats found for ${options.dateString}`);

  return {
    dailyActiveUsers: activeRow.mergeAddressCount,
    dailyTransactionsCount: txRow.mergeTransactionCount,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.AELF],
  protocolType: ProtocolType.CHAIN,
  start: "2020-12-10",
};

export default adapter;
