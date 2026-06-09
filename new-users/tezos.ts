import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Source: TzKT Explorer stats page charts backed by DipDup stats API.
const ACCOUNTS_STATS_URL = "https://stats.dipdup.net/v1/histogram/accounts_stats/max/day?field=Total&size=1000";
const ONE_DAY = 24 * 60 * 60;

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(ACCOUNTS_STATS_URL);
  const today = Number(data.find((item: any) => item.ts === options.startOfDay).value);
  const yesterday = Number(data.find((item: any) => item.ts === options.startOfDay - ONE_DAY).value);

  return {
    dailyNewUsers: today - yesterday,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TEZOS],
  protocolType: ProtocolType.CHAIN,
  start: "2023-09-16",
};

export default adapter;
