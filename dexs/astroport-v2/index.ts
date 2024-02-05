import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { request } from "graphql-request";
import fetchURL from "../../utils/fetchURL";

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
const url = 'https://app.astroport.fi/api/trpc/protocol.stats?input={"json":{"chains":["phoenix-1","injective-1","neutron-1","pacific-1"]}}'
const fetch = (chainId: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const results = (await fetchURL(url)).result.data.json.chains[chainId];
    const totalVolume24h = results?.dayVolumeUSD;
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
      start: 0,
    },
    [CHAIN.INJECTIVE]: {
      fetch: fetch("injective-1"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
    neutron: {
      fetch: fetch("neutron-1"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    },
    [CHAIN.SEI]: {
      fetch: fetch("pacific-1"),
      runAtCurrTime: true,
      customBackfill: undefined,
      start: 0,
    }
  },
};

export default adapter;
