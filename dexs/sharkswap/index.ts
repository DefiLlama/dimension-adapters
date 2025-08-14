import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.SX]: "https://rollup-graph.sx.technology/subgraphs/name/sharkswap/exchange",
  },
  factoriesName: "factories",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SX],
}

export default adapter;