import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.HECO]: "https://api2.makiswap.com/subgraphs/name/maki-mainnet/exchange"
  },
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2025-01-01',
  adapter: {
    [CHAIN.HECO]: { fetch: async () => ({ dailyVolume: 0 }), start: 1630000000 },
  },
}

export default adapter;
