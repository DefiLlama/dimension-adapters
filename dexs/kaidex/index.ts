import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.KARDIA]: "https://ex-graph-v3.kardiachain.io/subgraphs/name/kaidex-v3/exchange2"
  },
  factoriesName: "factories",
  dayData: "dayData",
  totalVolume: "volumeUSD",
  dailyVolume: "volumeUSD"
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.KARDIA]: { fetch },
  },
}

export default adapter;