import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.LINEA]: "https://subgraph-mainnet.horizondex.io/subgraphs/name/horizondex/horizondex-mainnet-v2",
    [CHAIN.BASE]: "https://subgraph-base.horizondex.io/subgraphs/name/horizondex/horizondex-base-v2",
  },
    factoriesName: "factories",
    dayData: "accumulatedDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.LINEA]: { fetch: async () => ({}), start: 1689373614 },
    [CHAIN.BASE]: { fetch, start: 1690894800 },
  },
}

export default adapter;
