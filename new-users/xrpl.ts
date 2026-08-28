import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const METRICS_URL = "https://api.xrpscan.com/api/v1/metrics/metric";

const fetch = async (options: FetchOptions) => {
  const metrics = await fetchURL(METRICS_URL);
  if (!metrics?.length) throw new Error("Missing XRPSCAN metrics data");

  const dayData = metrics.find((item) => item.date.startsWith(options.dateString));
  if (!dayData) {
    throw new Error(`No XRPSCAN metrics found for date ${options.dateString}`);
  }

  return {
    dailyNewUsers: dayData.metric.accounts_created,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.RIPPLE],
  protocolType: ProtocolType.CHAIN,
  start: "2013-01-02",
};

export default adapter;
