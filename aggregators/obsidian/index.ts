import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const supportedChains: Record<string, string> = {
  25: CHAIN.CRONOS,
  388: CHAIN.CRONOS_ZKEVM,
};

const BASE_URL = "https://api.obsidian.finance";
const endpoint = "/aggregator-vol";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startTimestamp = options.startOfDay;
  
  const chainId = Object.entries(supportedChains).find(
    ([_, defiLlamaChain]) => defiLlamaChain === options.chain
  )?.[0];

  if (!chainId) {
    return { dailyVolume: 0 };
  }

  const url = `${BASE_URL}${endpoint}/${chainId}?startTimestamp=${startTimestamp}`;
  const defaultRes = {
    dailyVolume: 0,
  };

  try {
    const res = await httpGet(url);
    
    if (!res) {
      return defaultRes;
    }

    return {
      dailyVolume: res.totalUSD || 0,
    };
  } catch (error) {
    console.error(`Error fetching data from Obsidian API: ${error}`);
    return defaultRes;
  }
};

const adapter = {
  version: 1,
  start: '2024-07-25', 
  adapter: Object.fromEntries(
    Object.entries(supportedChains).map(([chainId, defiLlamaChain]) => [
      defiLlamaChain,
      {
        fetch,
        start: '2024-07-25',
      },
    ])
  ),
};

export default adapter;