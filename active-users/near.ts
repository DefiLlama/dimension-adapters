import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const NEARBLOCKS_API = "https://api.nearblocks.io/v3";

const fetchDayStats = async (path: string, date: string) => {
  const { data } = await fetchURL(`${NEARBLOCKS_API}/${path}?date=${date}`);
  if (!data?.length) throw new Error(`No Nearblocks ${path} data for ${date}`);
  return data[0];
};

const fetch = async (options: FetchOptions) => {
  const [addressStats, txnStats] = await Promise.all([
    fetchDayStats("address-stats", options.dateString),
    fetchDayStats("txn-stats", options.dateString),
  ]);

  return {
    dailyActiveUsers: addressStats.active_accounts,
    dailyTransactionsCount: txnStats.txns,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  protocolType: ProtocolType.CHAIN,
  start: "2020-07-21",
  methodology: {
    ActiveUsers: "Accounts that signed a transaction or a relayed meta-transaction during the day, from Nearblocks.",
    Transactions: "Transactions included on NEAR during the day, from Nearblocks.",
  },
};

export default adapter;
