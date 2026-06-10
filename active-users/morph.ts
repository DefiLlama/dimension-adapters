import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const BASE_URL = "https://api.socialscan.io/morphl2-mainnet/v1/explorer/chart-data/daily";

const fetch = async (options: FetchOptions) => {
  const activeRows = await fetchURL(`${BASE_URL}?metrics=address.active_address_cnt`);
  const txRows = await fetchURL(`${BASE_URL}?metrics=transaction.cnt`);

  const active = activeRows.data?.find((item: any) => item.date === options.dateString);
  const tx = txRows.data?.find((item: any) => item.date === options.dateString);
  if (!active || active["address.active_address_cnt"] == null || !tx || tx["transaction.cnt"] == null) {
    throw new Error(`No Morph daily user/transaction data found for ${options.dateString}`);
  }
  const dailyActiveUsers = Number(active["address.active_address_cnt"]);
  const dailyTransactionsCount = Number(tx["transaction.cnt"]);

  return {
    dailyActiveUsers,
    dailyTransactionsCount,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MORPH],
  protocolType: ProtocolType.CHAIN,
  start: "2024-10-21",
};

export default adapter;
