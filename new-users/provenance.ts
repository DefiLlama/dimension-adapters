import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const ZONESCAN_BASE_URL = "https://zonescan.io/api/v1/stats/provenance/metrics";

const fetch = async (options: FetchOptions) => {
  const since = new Date(options.startOfDay * 1000).toISOString();
  const until = new Date((options.startOfDay + 86400) * 1000).toISOString();

  const response = await fetchURL(
    `${ZONESCAN_BASE_URL}/new_accounts_24h?granularity=day&limit=1&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`
  );

  const users = response.data?.find((item: any) => item.timestamp?.startsWith(options.dateString));
  if (!users || users.value == null) {
    throw new Error(`No Provenance new accounts data found for ${options.dateString}`);
  }

  return {
    dailyNewUsers: Number(users.value),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PROVENANCE],
  start: "2025-07-11",
};

export default adapter;
