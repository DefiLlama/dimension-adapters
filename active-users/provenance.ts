import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const ZONESCAN_BASE_URL = "https://zonescan.io/api/v1/stats/provenance/metrics";

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startOfDay * 1000).toISOString();
  const to = new Date((options.startOfDay + 86400) * 1000).toISOString();

  const [activeRows, txRows, gasRows] = await Promise.all([
    fetchURL(`${ZONESCAN_BASE_URL}/active_accounts_24h?granularity=day&limit=1&since=${encodeURIComponent(from)}&until=${encodeURIComponent(to)}`),
    fetchURL(`${ZONESCAN_BASE_URL}/transactions_new?granularity=day&limit=1&since=${encodeURIComponent(from)}&until=${encodeURIComponent(to)}`),
    fetchURL(`${ZONESCAN_BASE_URL}/transaction_fees_total?granularity=day&limit=1&since=${encodeURIComponent(from)}&until=${encodeURIComponent(to)}`),
  ]);

  const active = activeRows.data?.find((item: any) => item.timestamp?.startsWith(options.dateString));
  const tx = txRows.data?.find((item: any) => item.timestamp?.startsWith(options.dateString));
  const gas = gasRows.data?.find((item: any) => item.timestamp?.startsWith(options.dateString));

  if (!active || active.value == null || tx == null || tx.value == null || gas == null || gas.value == null) {
    throw new Error(`No Provenance active users/transactions/gas data for ${options.dateString}`);
  }

  return {
    dailyActiveUsers: Number(active.value),
    dailyTransactionsCount: Number(tx.value),
    dailyGasUsed: Number(gas.value),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PROVENANCE],
  start: "2025-07-11",
};

export default adapter;
