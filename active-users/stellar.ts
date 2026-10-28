import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const LEDGER_STATS_URL = "https://api.stellar.expert/explorer/public/ledger/ledger-stats";

const fetch = async (options: FetchOptions) => {
  const stats = await fetchURL(LEDGER_STATS_URL);
  if (!stats?.length) throw new Error("Missing Stellar ledger stats data");

  const today = stats.find((item) => item.ts === options.startOfDay);
  if (!today) {
    throw new Error(`No Stellar ledger stats found for date ${options.dateString}`);
  }

  return {
    dailyActiveUsers: today.active_accounts,
    dailyTransactionsCount: today.transactions,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.STELLAR],
  protocolType: ProtocolType.CHAIN,
  start: "2015-10-01",
};

export default adapter;
