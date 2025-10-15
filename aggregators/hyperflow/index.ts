import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_API = "https://api.hyperflow.fun/v1/aggregator/stats/daily"

const chainConfig: Record<string, { id: number, start: string }> = {
  [CHAIN.HYPERLIQUID]: { id: 999, start: '2025-06-08' },
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `${STATS_API}?chainId=${chainConfig[options.chain].id}&timestamps=${options.startOfDay}`;
  const dailyVolume = (await httpGet(url)).data?.volumes?.[0].value;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig
};

export default adapter;
