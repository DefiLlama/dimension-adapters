import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const BASE_URL = "https://api.socialscan.io/morphl2-mainnet/v1/explorer/chart-data/daily?metrics=address.new_address_cnt";

const fetch = async (options: FetchOptions) => {
  const rows = await fetchURL(BASE_URL);
  const newUsers = rows.data?.find((item: any) => item.date === options.dateString);
  if (!newUsers || newUsers["address.new_address_cnt"] == null) {
    throw new Error(`No Morph new users data found for ${options.dateString}`);
  }

  return {
    dailyNewUsers: Number(newUsers["address.new_address_cnt"]),
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
