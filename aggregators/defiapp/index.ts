import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";

const defiAppChainIdMap: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    id: "1",
    start: "2025-02-13",
  },
  [CHAIN.BSC]: {
    id: "56",
    start: "2025-02-13",
  },
  [CHAIN.ARBITRUM]: {
    id: "42161",
    start: "2025-02-13",
  },
  [CHAIN.SOLANA]: {
    id: "1151111081099710",
    start: "2025-02-13",
  },
};

const tsToISO = (ts: number) => new Date(ts * 1e3).toISOString()

const prefetch = async (options: FetchOptions) => {
  const res = await httpGet(`https://api.defi.app/api/stats/volume/between?startRefTime=${tsToISO(options.startTimestamp)}&endRefTime=${tsToISO(options.endTimestamp)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": getEnv('DEFIAPP_API_KEY'),
      User: "defillama",
    },
  });
  return res;
}

const fetch = async (options: FetchOptions) => {
  const results = await options.preFetchedResults || [];
  const dailyVolume = results.perChainUsdVolume[defiAppChainIdMap[options.chain].id];
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.entries(defiAppChainIdMap).map(([chain, config]) => [
      chain,
      { fetch, start: config.start }
    ])
  ),
  prefetch
};

export default adapter;
