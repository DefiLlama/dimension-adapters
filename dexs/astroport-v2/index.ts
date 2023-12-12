import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { request } from "graphql-request";

const API_ENDPOINT = "https://multichain-api.astroport.fi/graphql";

const statsQuery = `
query Stats($chains: [String]!) {
  stats(chains: $chains, sortDirection: DESC) {
    chains {
      chainId
      totalVolume24h
    }
  }
}
`;

const fetch = (chainId: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const results = await request(API_ENDPOINT, statsQuery, { chains: [chainId] });
    const totalVolume24h = results?.stats?.chains[0]?.totalVolume24h;
    return {
      timestamp: dayTimestamp,
      dailyVolume: totalVolume24h ? String(totalVolume24h) : undefined,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    "terra2": {
      fetch: fetch("phoenix-1"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 0,
    },
    [CHAIN.INJECTIVE]: {
      fetch: fetch("injective-1"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 0,
    },
    neutron: {
      fetch: fetch("neutron-1"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: async () => 0,
    },
  },
};

export default adapter;
