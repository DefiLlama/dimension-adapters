import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.CUBE]: "https://info.capricorn.finance/subgraphs/name/cube/dex-subgraph"
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "hswapFactories",
  dayData: "hswapDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2023-07-09',
  fetch: async() => ({
    dailyVolume: 0,
  }),
  chains: Object.keys(endpoints),
  start: 1632326400,
}

export default adapter;
