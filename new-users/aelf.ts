import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_URL = "https://aelfscan.io/api/app/statistics/uniqueAddresses";

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(STATS_URL);
  const row = response.data.list.find((item: any) => item.dateStr === options.dateString);

  if (!row) throw new Error(`No aelf new user stats found for ${options.dateString}`);

  return {
    dailyNewUsers: row.mergeAddressCount,
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
